import { ReviewModel } from '../models/review.model'
import { PaperReviewerModel } from '../models/paper-reviewer.model'
import { pool } from '../config/database'
import {
  Review,
  UpdateReview,
  InsertReviewEvent,
  AnonymousReview,
  ReviewStatistics
} from '@humanly/shared'
import { AppError } from '../middleware/error-handler'

export class ReviewService {
  // Get or create review for a reviewer (auto-create on first access)
  static async getOrCreate(paperId: string, reviewerId: string): Promise<Review> {
    // Check if reviewer is assigned
    const assignment = await PaperReviewerModel.findByPaperAndReviewer(paperId, reviewerId)
    if (!assignment) {
      throw new AppError(403, 'You are not assigned as a reviewer for this paper')
    }

    // Check if review already exists
    let review = await ReviewModel.findByPaperAndReviewer(paperId, reviewerId)

    if (!review) {
      // Create new review
      review = await ReviewModel.create({
        paperId,
        reviewerId,
        paperReviewerId: assignment.id,
        content: { root: { children: [], direction: null, format: '', indent: 0, type: 'root', version: 1 } }
      })

      // Update reviewer status to in_progress
      await PaperReviewerModel.update(assignment.id, {
        reviewStatus: 'in_progress',
        reviewStartedAt: new Date()
      })
    }

    return review
  }

  // Get review by ID
  static async get(reviewId: string, userId: string): Promise<Review> {
    const review = await ReviewModel.findById(reviewId)
    if (!review) {
      throw new AppError(404, 'Review not found')
    }

    // Verify ownership or admin access
    const isOwner = review.reviewerId === userId
    // TODO: Check admin access
    // const isAdmin = await this.isAdmin(review.paperId, userId)

    if (!isOwner) {
      throw new AppError(403, 'Access denied')
    }

    return review
  }

  // Update review content
  static async update(
    reviewId: string,
    data: UpdateReview,
    userId: string
  ): Promise<Review> {
    // Verify ownership
    const isOwner = await ReviewModel.isOwner(reviewId, userId)
    if (!isOwner) {
      throw new AppError(403, 'Only the review owner can update the review')
    }

    // Get current review
    const review = await ReviewModel.findById(reviewId)
    if (!review) {
      throw new AppError(404, 'Review not found')
    }

    // Prevent updates to submitted reviews
    if (review.status === 'submitted') {
      throw new AppError(400, 'Cannot update a submitted review')
    }

    // Calculate word count and plain text if content is updated
    if (data.content) {
      const plainText = this.extractPlainText(data.content)
      const wordCount = this.countWords(plainText)
      const characterCount = plainText.length

      data.plainText = plainText
      data.wordCount = wordCount
      data.characterCount = characterCount
    }

    return ReviewModel.update(reviewId, data)
  }

  // Submit review
  static async submit(
    reviewId: string,
    submissionData: {
      scores?: Record<string, number>
      recommendation?: string
      confidenceLevel?: number
    },
    userId: string
  ): Promise<Review> {
    // Verify ownership
    const isOwner = await ReviewModel.isOwner(reviewId, userId)
    if (!isOwner) {
      throw new AppError(403, 'Only the review owner can submit the review')
    }

    // Get current review
    const review = await ReviewModel.findById(reviewId)
    if (!review) {
      throw new AppError(404, 'Review not found')
    }

    // Prevent re-submission
    if (review.status === 'submitted') {
      throw new AppError(400, 'Review already submitted')
    }

    // Validate minimum content
    if (!review.plainText || review.wordCount < 50) {
      throw new AppError(400, 'Review must have at least 50 words')
    }

    // Update review status
    const updatedReview = await ReviewModel.update(reviewId, {
      status: 'submitted',
      submittedAt: new Date(),
      scores: submissionData.scores,
      recommendation: submissionData.recommendation,
      confidenceLevel: submissionData.confidenceLevel
    })

    // Update paper_reviewer status
    const assignment = await PaperReviewerModel.findByPaperAndReviewer(
      review.paperId,
      review.reviewerId
    )
    if (assignment) {
      await PaperReviewerModel.update(assignment.id, {
        reviewStatus: 'submitted',
        reviewSubmittedAt: new Date()
      })
    }

    return updatedReview
  }

  // Get anonymous reviews for a paper (admin only)
  static async getAnonymousReviews(
    paperId: string,
    userId: string
  ): Promise<AnonymousReview[]> {
    // TODO: Verify admin access
    // const isAdmin = await PaperModel.hasTaskAccess(paperId, userId)
    // if (!isAdmin) throw new AppError('Admin access required', 403)

    return ReviewModel.findByPaper(paperId)
  }

  // Track review events (keystroke tracking)
  static async trackEvents(
    reviewId: string,
    events: InsertReviewEvent[],
    userId: string
  ): Promise<number> {
    // Verify ownership
    const isOwner = await ReviewModel.isOwner(reviewId, userId)
    if (!isOwner) {
      throw new AppError(403, 'Access denied')
    }

    // Insert events in batch
    const query = `
      INSERT INTO review_events (review_id, reviewer_id, event_type, event_data, selection_text, cursor_position, timestamp)
      VALUES ($1, $2, $3, $4, $5, $6, $7)
    `

    let count = 0
    for (const event of events) {
      await pool.query(query, [
        reviewId,
        userId,
        event.eventType,
        event.eventData,
        event.selectionText || null,
        event.cursorPosition || null,
        event.timestamp || new Date()
      ])
      count++
    }

    return count
  }

  // Get review statistics
  static async getStatistics(
    reviewId: string,
    userId: string
  ): Promise<ReviewStatistics> {
    // Verify access (owner or admin)
    const isOwner = await ReviewModel.isOwner(reviewId, userId)
    // TODO: Check admin access
    if (!isOwner) {
      throw new AppError(403, 'Access denied')
    }

    const query = `
      SELECT
        COUNT(*) as total_events,
        COUNT(*) FILTER (WHERE event_type = 'keystroke') as keystroke_count,
        COUNT(*) FILTER (WHERE event_type = 'paste') as paste_count,
        COUNT(*) FILTER (WHERE event_type = 'delete') as delete_count,
        EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp)))::INTEGER as active_time_seconds
      FROM review_events
      WHERE review_id = $1
    `

    const result = await pool.query(query, [reviewId])
    const stats = result.rows[0]

    const totalEvents = parseInt(stats.total_events)
    const keystrokeCount = parseInt(stats.keystroke_count)
    const pasteCount = parseInt(stats.paste_count)
    const deleteCount = parseInt(stats.delete_count)
    const activeTimeSeconds = parseInt(stats.active_time_seconds) || 0

    // Calculate typing speed (words per minute)
    const review = await ReviewModel.findById(reviewId)
    const wordCount = review?.wordCount || 0
    const typingSpeed = activeTimeSeconds > 0
      ? Math.round((wordCount / activeTimeSeconds) * 60)
      : 0

    // Calculate paste percentage
    const pastePercentage = totalEvents > 0
      ? Math.round((pasteCount / totalEvents) * 100)
      : 0

    return {
      reviewId,
      totalEvents,
      keystrokeCount,
      pasteCount,
      deleteCount,
      typingSpeed,
      activeTimeSeconds,
      pastePercentage
    }
  }

  // Extract plain text from Lexical JSON
  private static extractPlainText(lexicalState: any): string {
    if (!lexicalState || !lexicalState.root) {
      return ''
    }

    const extractFromNode = (node: any): string => {
      if (node.type === 'text') {
        return node.text || ''
      }

      if (node.children && Array.isArray(node.children)) {
        return node.children.map(extractFromNode).join('')
      }

      return ''
    }

    return extractFromNode(lexicalState.root).trim()
  }

  // Count words in text
  private static countWords(text: string): number {
    if (!text) return 0
    return text.split(/\s+/).filter(word => word.length > 0).length
  }
}

import { PaperReviewerModel } from '../models/paper-reviewer.model'
import { PaperModel } from '../models/paper.model'
import {
  PaperReviewer,
  InsertPaperReviewer,
  UpdatePaperReviewer
} from '@humanly/shared'
import { AppError } from '../middleware/error-handler'

export class ReviewerService {
  // Assign a reviewer to a paper
  static async assign(
    paperId: string,
    reviewerId: string,
    assignedBy: string,
    permissions?: {
      canViewPaper?: boolean
      canWriteReview?: boolean
      canAccessAI?: boolean
    }
  ): Promise<PaperReviewer> {
    // TODO: Verify assigner is admin
    // const isAdmin = await PaperModel.hasTaskAccess(paperId, assignedBy)
    // if (!isAdmin) throw new AppError('Only admins can assign reviewers', 403)

    // Verify paper exists
    const paper = await PaperModel.findById(paperId)
    if (!paper) {
      throw new AppError(404, 'Paper not found')
    }

    // TODO: Verify reviewer user exists
    // const reviewer = await UserModel.findById(reviewerId)
    // if (!reviewer) throw new AppError('Reviewer not found', 404)

    // Check if already assigned
    const existing = await PaperReviewerModel.findByPaperAndReviewer(paperId, reviewerId)
    if (existing) {
      throw new AppError(409, 'Reviewer already assigned to this paper')
    }

    const data: InsertPaperReviewer = {
      paperId,
      reviewerId,
      assignedBy,
      canViewPaper: permissions?.canViewPaper,
      canWriteReview: permissions?.canWriteReview,
      canAccessAI: permissions?.canAccessAI
    }

    return PaperReviewerModel.create(data)
  }

  // List reviewers for a paper
  static async listByPaper(
    paperId: string,
    userId: string
  ): Promise<PaperReviewer[]> {
    // TODO: Verify user is admin or assigned reviewer
    // const isAdmin = await PaperModel.hasTaskAccess(paperId, userId)
    // const isReviewer = await PaperReviewerModel.hasAccess(paperId, userId)
    // if (!isAdmin && !isReviewer) throw new AppError('Access denied', 403)

    return PaperReviewerModel.findByPaper(paperId)
  }

  // Get reviewer assignment
  static async get(
    paperId: string,
    reviewerId: string,
    userId: string
  ): Promise<PaperReviewer> {
    // TODO: Verify access (admin or the reviewer themselves)
    // const isAdmin = await PaperModel.hasTaskAccess(paperId, userId)
    // if (!isAdmin && userId !== reviewerId) {
    //   throw new AppError('Access denied', 403)
    // }

    const assignment = await PaperReviewerModel.findByPaperAndReviewer(paperId, reviewerId)
    if (!assignment) {
      throw new AppError(404, 'Reviewer assignment not found')
    }

    return assignment
  }

  // Update reviewer permissions
  static async updatePermissions(
    paperId: string,
    reviewerId: string,
    permissions: UpdatePaperReviewer,
    userId: string
  ): Promise<PaperReviewer> {
    // TODO: Verify user is admin
    // const isAdmin = await PaperModel.hasTaskAccess(paperId, userId)
    // if (!isAdmin) throw new AppError('Only admins can update permissions', 403)

    return PaperReviewerModel.updateByPaperAndReviewer(paperId, reviewerId, permissions)
  }

  // Remove reviewer assignment
  static async remove(
    paperId: string,
    reviewerId: string,
    userId: string
  ): Promise<void> {
    // TODO: Verify user is admin
    // const isAdmin = await PaperModel.hasTaskAccess(paperId, userId)
    // if (!isAdmin) throw new AppError('Only admins can remove reviewers', 403)

    // Check if review has been submitted
    const assignment = await PaperReviewerModel.findByPaperAndReviewer(paperId, reviewerId)
    if (assignment?.reviewStatus === 'submitted') {
      throw new AppError(400, 'Cannot remove reviewer who has already submitted a review')
    }

    await PaperReviewerModel.deleteByPaperAndReviewer(paperId, reviewerId)
  }

  // Get all papers assigned to a reviewer
  static async listPapersForReviewer(
    reviewerId: string,
    userId: string
  ): Promise<PaperReviewer[]> {
    // Verify user is requesting their own assignments or is admin
    if (userId !== reviewerId) {
      // TODO: Check if user is admin
      // const isAdmin = await UserModel.isAdmin(userId)
      // if (!isAdmin) throw new AppError('Access denied', 403)
    }

    return PaperReviewerModel.findByReviewer(reviewerId)
  }

  // Check if user has specific permission
  static async checkPermission(
    paperId: string,
    reviewerId: string,
    permission: 'canViewPaper' | 'canWriteReview' | 'canAccessAI'
  ): Promise<boolean> {
    const permissions = await PaperReviewerModel.getPermissions(paperId, reviewerId)
    if (!permissions) {
      return false
    }

    return permissions[permission]
  }
}

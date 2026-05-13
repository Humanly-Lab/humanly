import { Request, Response } from 'express'
import { PaperService } from '../services/paper.service'
import { ReviewerService } from '../services/reviewer.service'
import { DocumentService } from '../services/document.service'
import { asyncHandler } from '../middleware/error-handler'
import { AppError } from '../middleware/error-handler'

// Upload a new paper
export const uploadPaper = asyncHandler(async (req: Request, res: Response) => {
  const { taskId } = req.params

  if (!req.file) {
    throw new AppError(400, 'PDF file is required')
  }

  const { title, authors, abstract, keywords, reviewDeadline, documentId } = req.body

  // Parse arrays if they're strings
  const parsedAuthors = typeof authors === 'string' ? JSON.parse(authors) : (authors || [])
  const parsedKeywords = typeof keywords === 'string' ? JSON.parse(keywords) : (keywords || [])

  const paper = await PaperService.upload(
    req.file.buffer,
    {
      taskId,
      title,
      authors: parsedAuthors,
      abstract: abstract || '',
      keywords: parsedKeywords,
      reviewDeadline: reviewDeadline ? new Date(reviewDeadline) : undefined,
      documentId: documentId || undefined
    },
    req.user!.userId
  )

  res.status(201).json({
    success: true,
    data: paper
  })
})

// Get linked paper for a document
export const getPaperByDocument = asyncHandler(async (req: Request, res: Response) => {
  const { id: documentId } = req.params

  // Verify document ownership (throws 404 if not found or not owned by user)
  await DocumentService.getDocument(documentId, req.user!.userId)

  const paper = await PaperService.getByDocumentId(documentId)

  if (!paper) {
    res.json({
      success: true,
      data: { paper: null }
    })
    return
  }

  res.json({
    success: true,
    data: { paper }
  })
})

// Get paper by ID
export const getPaper = asyncHandler(async (req: Request, res: Response) => {
  const { paperId } = req.params

  const paper = await PaperService.get(paperId, req.user!.userId)

  res.json({
    success: true,
    data: paper
  })
})

// List papers for a task
export const listPapers = asyncHandler(async (req: Request, res: Response) => {
  const { taskId } = req.params
  const { status, limit = 50, offset = 0 } = req.query

  const { papers, total } = await PaperService.listByTask(
    taskId,
    req.user!.userId,
    { status: status as any },
    Number(limit),
    Number(offset)
  )

  res.json({
    success: true,
    data: papers,
    pagination: {
      total,
      limit: Number(limit),
      offset: Number(offset),
      hasMore: Number(offset) + papers.length < total
    }
  })
})

// Get papers assigned to current user (reviewer)
export const getMyPapers = asyncHandler(async (req: Request, res: Response) => {
  const { status, limit = 50, offset = 0 } = req.query

  const { papers, total } = await PaperService.listByReviewer(
    req.user!.userId,
    status as string,
    Number(limit),
    Number(offset)
  )

  res.json({
    success: true,
    data: papers,
    pagination: {
      total,
      limit: Number(limit),
      offset: Number(offset),
      hasMore: Number(offset) + papers.length < total
    }
  })
})

// Stream PDF content
export const streamPDF = asyncHandler(async (req: Request, res: Response) => {
  const { paperId } = req.params

  const stream = await PaperService.streamPDF(paperId, req.user!.userId)

  // CRITICAL: Set headers to prevent download
  res.setHeader('Content-Type', 'application/pdf')
  res.setHeader('Content-Disposition', 'inline') // NOT 'attachment'
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate')
  res.setHeader('X-Frame-Options', 'SAMEORIGIN')
  res.setHeader('Content-Security-Policy', "default-src 'self'")

  stream.pipe(res)
})

// Update paper metadata
export const updatePaper = asyncHandler(async (req: Request, res: Response) => {
  const { paperId } = req.params
  const { title, abstract, keywords, reviewDeadline, status } = req.body

  const paper = await PaperService.update(
    paperId,
    {
      title,
      abstract,
      keywords,
      reviewDeadline: reviewDeadline ? new Date(reviewDeadline) : undefined,
      status
    },
    req.user!.userId
  )

  res.json({
    success: true,
    data: paper
  })
})

// Delete paper
export const deletePaper = asyncHandler(async (req: Request, res: Response) => {
  const { paperId } = req.params

  await PaperService.delete(paperId, req.user!.userId)

  res.json({
    success: true,
    message: 'Paper deleted successfully'
  })
})

// Log paper access (page view)
export const logAccess = asyncHandler(async (req: Request, res: Response) => {
  const { paperId } = req.params
  const { accessType, pageNumber, durationSeconds } = req.body

  await PaperService.logAccess({
    paperId,
    reviewerId: req.user!.userId,
    accessType,
    pageNumber,
    durationSeconds
  })

  res.json({
    success: true
  })
})

// Add reading time
export const addReadingTime = asyncHandler(async (req: Request, res: Response) => {
  const { paperId } = req.params
  const { seconds } = req.body

  await PaperService.addReadingTime(paperId, req.user!.userId, seconds)

  res.json({
    success: true
  })
})

// Assign reviewer to paper
export const assignReviewer = asyncHandler(async (req: Request, res: Response) => {
  const { paperId } = req.params
  const { reviewerId, permissions } = req.body

  const assignment = await ReviewerService.assign(
    paperId,
    reviewerId,
    req.user!.userId,
    permissions
  )

  res.status(201).json({
    success: true,
    data: assignment
  })
})

// List reviewers for a paper
export const listReviewers = asyncHandler(async (req: Request, res: Response) => {
  const { paperId } = req.params

  const reviewers = await ReviewerService.listByPaper(paperId, req.user!.userId)

  res.json({
    success: true,
    data: reviewers
  })
})

// Update reviewer permissions
export const updateReviewerPermissions = asyncHandler(async (req: Request, res: Response) => {
  const { paperId, reviewerId } = req.params
  const permissions = req.body

  const assignment = await ReviewerService.updatePermissions(
    paperId,
    reviewerId,
    permissions,
    req.user!.userId
  )

  res.json({
    success: true,
    data: assignment
  })
})

// Remove reviewer
export const removeReviewer = asyncHandler(async (req: Request, res: Response) => {
  const { paperId, reviewerId } = req.params

  await ReviewerService.remove(paperId, reviewerId, req.user!.userId)

  res.json({
    success: true,
    message: 'Reviewer removed successfully'
  })
})

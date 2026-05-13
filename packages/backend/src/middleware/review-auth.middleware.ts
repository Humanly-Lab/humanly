import { Request, Response, NextFunction } from 'express'
import { AppError } from './error-handler'
import { PaperReviewerModel } from '../models/paper-reviewer.model'
import { PaperModel } from '../models/paper.model'
import { TaskModel } from '../models/task.model'
import { ReviewModel } from '../models/review.model'

// Check if user is assigned reviewer for paper
export const requireReviewerAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { paperId, reviewId } = req.params
    const userId = req.user!.userId

    let hasAccess = false

    if (paperId) {
      hasAccess = await PaperReviewerModel.hasAccess(paperId, userId)
    } else if (reviewId) {
      hasAccess = await PaperReviewerModel.hasAccessToReview(reviewId, userId)
    }

    if (!hasAccess) {
      throw new AppError(403, 'Access denied. You are not assigned as a reviewer.')
    }

    next()
  } catch (error) {
    next(error)
  }
}

// Check specific permission (view, write, AI)
export const requirePermission = (
  permission: 'canViewPaper' | 'canWriteReview' | 'canAccessAI'
) => {
  return async (req: Request, res: Response, next: NextFunction) => {
    try {
      const { paperId, reviewId } = req.params
      const userId = req.user!.userId

      const permissions = await PaperReviewerModel.getPermissions(
        paperId || reviewId,
        userId
      )

      if (!permissions || !permissions[permission]) {
        throw new AppError(403, `Permission denied: ${permission}`)
      }

      next()
    } catch (error) {
      next(error)
    }
  }
}

// Check if user is task admin (can manage reviewers and papers)
export const requireTaskAdmin = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { paperId, taskId } = req.params
    const userId = req.user!.userId

    // Get task from paper or directly
    let checkTaskId = taskId
    if (paperId) {
      const paper = await PaperModel.findById(paperId)
      if (!paper) {
        throw new AppError(404, 'Paper not found')
      }
      checkTaskId = paper.taskId
    }

    if (!checkTaskId) {
      throw new AppError(404, 'Task not found')
    }

    // TODO: Check if user is task admin
    // const isAdmin = await TaskModel.isAdmin(checkTaskId, userId)
    // if (!isAdmin) {
    //   throw new AppError('Admin access required', 403)
    // }

    // For now, allow if user has paper access (will be replaced with proper task check)
    if (paperId) {
      const hasAccess = await PaperModel.hasTaskAccess(paperId, userId)
      if (!hasAccess) {
        throw new AppError(403, 'Admin access required')
      }
    }

    next()
  } catch (error) {
    next(error)
  }
}

// Check if user owns the review
export const requireReviewOwnership = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { reviewId } = req.params
    const userId = req.user!.userId

    const isOwner = await ReviewModel.isOwner(reviewId, userId)
    if (!isOwner) {
      throw new AppError(403, 'You can only access your own reviews')
    }

    next()
  } catch (error) {
    next(error)
  }
}

// Check if user can view paper (reviewer or admin)
export const requirePaperViewAccess = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { paperId } = req.params
    const userId = req.user!.userId

    // Check if user is reviewer with view permission
    const isReviewer = await PaperReviewerModel.hasAccess(paperId, userId)

    // Check if user is admin
    const paper = await PaperModel.findById(paperId)
    const isUploader = await PaperModel.isUploader(paperId, userId)
    const hasTaskAccess = await PaperModel.hasTaskAccess(paperId, userId)
    const isAdmin = isUploader || hasTaskAccess
    const isTaskInstruction = paper?.keywords?.includes('instructions') ?? false
    const isEnrolled = paper ? await TaskModel.hasEnrollment(paper.taskId, userId) : false

    if (!isReviewer && !isAdmin && !(isTaskInstruction && isEnrolled)) {
      throw new AppError(403, 'Access denied')
    }

    // Store admin status in request for later use
    req.isAdmin = isAdmin

    next()
  } catch (error) {
    next(error)
  }
}

// Extend Request type to include isAdmin flag
declare global {
  namespace Express {
    interface Request {
      isAdmin?: boolean
    }
  }
}

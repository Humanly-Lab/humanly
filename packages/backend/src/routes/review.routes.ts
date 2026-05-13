import { Router } from 'express'
import {
  getOrCreateReview,
  getReview,
  updateReview,
  submitReview,
  trackEvents,
  getStatistics,
  getAnonymousReviews,
  addComment,
  getComments,
  updateComment,
  deleteComment
} from '../controllers/review.controller'
import { authenticate } from '../middleware/auth.middleware'
import {
  requireReviewerAccess,
  requireReviewOwnership,
  requirePermission,
  requireTaskAdmin
} from '../middleware/review-auth.middleware'

const router = Router()

// Review routes
router.post(
  '/papers/:paperId/reviews',
  authenticate,
  requireReviewerAccess,
  requirePermission('canWriteReview'),
  getOrCreateReview
)

router.get(
  '/reviews/:reviewId',
  authenticate,
  requireReviewOwnership,
  getReview
)

router.patch(
  '/reviews/:reviewId',
  authenticate,
  requireReviewOwnership,
  requirePermission('canWriteReview'),
  updateReview
)

router.post(
  '/reviews/:reviewId/submit',
  authenticate,
  requireReviewOwnership,
  requirePermission('canWriteReview'),
  submitReview
)

// Event tracking
router.post(
  '/reviews/:reviewId/events',
  authenticate,
  requireReviewOwnership,
  trackEvents
)

router.get(
  '/reviews/:reviewId/stats',
  authenticate,
  requireReviewOwnership,
  getStatistics
)

// Anonymous reviews for a paper (admin only)
router.get(
  '/papers/:paperId/reviews',
  authenticate,
  requireTaskAdmin,
  getAnonymousReviews
)

// Comment routes
router.post(
  '/reviews/:reviewId/comments',
  authenticate,
  requireReviewOwnership,
  addComment
)

router.get(
  '/reviews/:reviewId/comments',
  authenticate,
  requireReviewOwnership,
  getComments
)

router.patch(
  '/comments/:commentId',
  authenticate,
  updateComment
)

router.delete(
  '/comments/:commentId',
  authenticate,
  deleteComment
)

export default router

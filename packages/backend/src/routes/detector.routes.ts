import { Router } from 'express';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler } from '../middleware/error-handler';
import {
  detectSubmission,
  listDetectors,
  getDetectorSpec,
} from '../controllers/detector.controller';

// Mounted under /api/v1. All detection endpoints require authentication (task ownership is checked inside the service).
const router: Router = Router();

router.use(authenticate);

// Detector metadata (spec config) — global, not tied to a specific task.
router.get('/detectors', asyncHandler(listDetectors));
router.get('/detectors/:name/spec', asyncHandler(getDetectorSpec));

// Run detection on a submission; the result is returned immediately and not persisted.
router.post('/tasks/:taskId/submissions/:submissionId/detect', asyncHandler(detectSubmission));

export default router;

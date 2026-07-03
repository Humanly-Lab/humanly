import { Request, Response } from 'express';
import { DetectorService } from '../services/detector.service';
import { AppError } from '../middleware/error-handler';

/**
 * Run detection on a submission.
 * POST /api/v1/tasks/:taskId/submissions/:submissionId/detect
 * Optional body { detector } specifies the detector name (defaults to "detector"), reserved for multiple detectors.
 *
 * Security: requires authentication; DetectorService verifies task ownership internally (only the task owner may use it). The result is returned immediately and not persisted.
 */
export async function detectSubmission(req: Request, res: Response): Promise<void> {
  const adminUserId = req.user!.userId;
  const { taskId, submissionId } = req.params;
  const detectorName = (req.body?.detector as string) || 'detector';

  if (!taskId || !submissionId) {
    throw new AppError(400, 'taskId and submissionId are required');
  }

  const result = await DetectorService.detectSubmission(
    taskId,
    submissionId,
    adminUserId,
    detectorName
  );

  res.json({ success: true, data: result });
}

/**
 * List available detectors.
 * GET /api/v1/detectors
 */
export async function listDetectors(_req: Request, res: Response): Promise<void> {
  const detectors = await DetectorService.listDetectors();
  res.json({ success: true, data: { detectors } });
}

/**
 * Get a detector's component spec.
 * GET /api/v1/detectors/:name/spec
 */
export async function getDetectorSpec(req: Request, res: Response): Promise<void> {
  const name = req.params.name;
  if (!name) {
    throw new AppError(400, 'detector name is required');
  }
  const spec = await DetectorService.getSpec(name);
  res.json({ success: true, data: spec });
}

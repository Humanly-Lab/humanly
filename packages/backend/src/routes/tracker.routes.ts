import { Router } from 'express';
import { TrackerController } from '../controllers/tracker.controller';

const router: Router = Router();

/**
 * GET /tracker/snippet
 * Get tracking snippet code for integration
 */
router.get('/snippet', TrackerController.getSnippet);

/**
 * GET /tracker/:filename
 * Serve tracker JavaScript files
 */
router.get('/:filename', TrackerController.serveTracker);

/**
 * GET /tracker
 * Serve default tracker file (humanly-tracker.min.js)
 */
router.get('/', TrackerController.serveTracker);

export default router;

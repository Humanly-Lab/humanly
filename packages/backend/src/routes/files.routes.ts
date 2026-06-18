import { Router } from 'express';
import multer from 'multer';
import { authenticate } from '../middleware/auth.middleware';
import { asyncHandler, AppError } from '../middleware/error-handler';
import {
  deleteFile,
  listAccessibleTaskInstructionFiles,
  listDocumentFiles,
  listTaskInstructionFiles,
  issueFileViewToken,
  streamFileContent,
  uploadDocumentFile,
} from '../controllers/file.controller';

const router: Router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype !== 'application/pdf') {
      cb(new AppError(400, 'Only PDF files are allowed'));
      return;
    }
    cb(null, true);
  },
});

router.use(authenticate);

router.post('/documents/:documentId/files', upload.single('pdf'), asyncHandler(uploadDocumentFile));
router.get('/documents/:documentId/files', asyncHandler(listDocumentFiles));
router.get('/tasks/:taskId/files', asyncHandler(listTaskInstructionFiles));
router.get('/tasks/enrollments/:taskId/instruction-files', asyncHandler(listAccessibleTaskInstructionFiles));
router.get('/files/:fileId/view-token', asyncHandler(issueFileViewToken));
router.get('/files/:fileId/content', asyncHandler(streamFileContent));
router.delete('/files/:fileId', asyncHandler(deleteFile));

export default router;

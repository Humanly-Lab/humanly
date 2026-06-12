import { Request, Response } from 'express';
import { FileService } from '../services/file.service';
import { AppError } from '../middleware/error-handler';

export async function initiateDocumentFileUpload(req: Request, res: Response): Promise<void> {
  const upload = await FileService.initiateDocumentFileUpload(
    req.params.documentId,
    req.user!.userId,
    req.body
  );

  res.status(201).json({
    success: true,
    data: upload,
  });
}

export async function completeFileUpload(req: Request, res: Response): Promise<void> {
  const file = await FileService.completeFileUpload(req.params.fileId, req.user!.userId);

  res.json({
    success: true,
    data: {
      file,
    },
  });
}

export async function uploadDocumentFile(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new AppError(400, 'PDF file is required');
  }

  const file = await FileService.uploadDocumentFile(
    req.params.documentId,
    req.user!.userId,
    req.file,
    typeof req.body.title === 'string' ? req.body.title : undefined
  );

  res.status(201).json({
    success: true,
    data: file,
  });
}
export async function listDocumentFiles(req: Request, res: Response): Promise<void> {
  const files = await FileService.listDocumentFiles(req.params.documentId, req.user!.userId);

  res.json({
    success: true,
    data: {
      file: files[0] || null,
      files,
    },
  });
}

export async function uploadTaskInstructionFile(req: Request, res: Response): Promise<void> {
  if (!req.file) {
    throw new AppError(400, 'PDF file is required');
  }

  const file = await FileService.uploadTaskInstructionFile(
    req.params.taskId,
    req.user!.userId,
    req.file,
    typeof req.body.title === 'string' ? req.body.title : undefined
  );

  res.status(201).json({
    success: true,
    data: file,
  });
}

export async function listTaskInstructionFiles(req: Request, res: Response): Promise<void> {
  const files = await FileService.listTaskInstructionFiles(req.params.taskId, req.user!.userId);

  res.json({
    success: true,
    data: files,
  });
}

export async function listAccessibleTaskInstructionFiles(req: Request, res: Response): Promise<void> {
  const files = await FileService.listAccessibleTaskInstructionFiles(req.params.taskId, req.user!.userId);

  res.json({
    success: true,
    data: {
      file: files[0] || null,
      files,
    },
  });
}

export async function issueFileViewToken(req: Request, res: Response): Promise<void> {
  const token = await FileService.issueViewOnlyFileToken(req.params.fileId, req.user!.userId);

  res.json({
    success: true,
    data: token,
  });
}

export async function streamFileContent(req: Request, res: Response): Promise<void> {
  const viewToken = typeof req.query.viewToken === 'string'
    ? req.query.viewToken
    : req.get('X-File-View-Token') || undefined;
  const stream = await FileService.streamFile(req.params.fileId, req.user!.userId, { viewToken });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', 'inline');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');

  stream.pipe(res);
}

export async function getFileReadUrl(req: Request, res: Response): Promise<void> {
  const readUrl = await FileService.getFileReadUrl(req.params.fileId, req.user!.userId);

  res.json({
    success: true,
    data: readUrl,
  });
}

export async function deleteFile(req: Request, res: Response): Promise<void> {
  await FileService.deleteFile(req.params.fileId, req.user!.userId);

  res.json({
    success: true,
    message: 'File deleted successfully',
  });
}

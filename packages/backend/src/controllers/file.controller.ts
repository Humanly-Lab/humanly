import { Request, Response } from 'express';
import { FileService } from '../services/file.service';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';

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

export async function uploadTaskInstructionFiles(req: Request, res: Response): Promise<void> {
  const files = Array.isArray(req.files) ? req.files : [];
  if (files.length === 0) {
    throw new AppError(400, 'At least one PDF file is required');
  }

  const uploadedFiles = await FileService.uploadDraftTaskInstructionFiles(
    req.params.taskId,
    req.user!.userId,
    files
  );

  res.status(201).json({
    success: true,
    data: uploadedFiles,
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

function encodeRFC5987Value(value: string): string {
  return encodeURIComponent(value)
    .replace(/['()]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
    .replace(/\*/g, '%2A');
}

const CONTENT_DISPOSITION_FILENAME_MAX_LENGTH = 200;

function truncateFilename(filename: string): string {
  if (filename.length <= CONTENT_DISPOSITION_FILENAME_MAX_LENGTH) {
    return filename;
  }

  const extension = /\.pdf$/i.test(filename) ? filename.slice(-4) : '';
  const baseLength = Math.max(1, CONTENT_DISPOSITION_FILENAME_MAX_LENGTH - extension.length);
  const basename = filename.slice(0, baseLength).trimEnd() || 'document';
  return `${basename}${extension}`;
}

function normalizeDownloadFilename(filename: string): string {
  const normalized = filename
    .replace(/[\r\n"]/g, '')
    .replace(/[\\/]/g, '_')
    .trim();
  return truncateFilename(normalized || 'document.pdf');
}

function toSafeAsciiFilename(filename: string): string {
  return normalizeDownloadFilename(filename).replace(/[^\x20-\x7E]/g, '_');
}

function buildAttachmentContentDisposition(filename: string): string {
  const normalizedFilename = normalizeDownloadFilename(filename);
  const safeAsciiFilename = toSafeAsciiFilename(normalizedFilename);
  return `attachment; filename="${safeAsciiFilename}"; filename*=UTF-8''${encodeRFC5987Value(normalizedFilename)}`;
}

async function streamFileResponse(
  req: Request,
  res: Response,
  disposition: 'inline' | 'attachment',
  rangeHeader: string | undefined
): Promise<void> {
  const viewToken = typeof req.query.viewToken === 'string'
    ? req.query.viewToken
    : req.get('X-File-View-Token') || undefined;
  const result = await FileService.streamFile(req.params.fileId, req.user!.userId, {
    viewToken,
    rangeHeader,
  });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Accept-Ranges', 'bytes');

  if (result.kind === 'range_not_satisfiable') {
    res.setHeader('Content-Range', result.contentRange);
    res.status(416).end();
    return;
  }

  res.setHeader(
    'Content-Disposition',
    disposition === 'attachment'
      ? buildAttachmentContentDisposition(result.file.originalFilename)
      : 'inline'
  );
  res.setHeader('Content-Length', result.contentLength.toString());
  if (result.contentRange) {
    res.setHeader('Content-Range', result.contentRange);
    res.status(206);
  } else {
    res.status(200);
  }

  const { stream } = result;
  let streamCompleted = false;

  stream.on('end', () => {
    streamCompleted = true;
  });

  stream.on('error', (error) => {
    logger.error('PDF file stream failed', {
      fileId: req.params.fileId,
      error,
    });
    if (!res.destroyed) {
      res.destroy(error);
    }
  });

  res.on('close', () => {
    if (!streamCompleted) {
      stream.destroy();
    }
  });

  stream.pipe(res);
}

export async function streamFileContent(req: Request, res: Response): Promise<void> {
  await streamFileResponse(req, res, 'inline', req.get('Range') || undefined);
}

export async function downloadFileContent(req: Request, res: Response): Promise<void> {
  await streamFileResponse(req, res, 'attachment', undefined);
}

export async function deleteFile(req: Request, res: Response): Promise<void> {
  await FileService.deleteFile(req.params.fileId, req.user!.userId);

  res.json({
    success: true,
    message: 'File deleted successfully',
  });
}

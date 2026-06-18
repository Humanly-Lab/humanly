import type { AppFile, ResourceAccessPolicy } from '@humanly/shared';
import { normalizeResourceAccessPolicy } from '@humanly/shared';
import crypto from 'crypto';
import jwt, { JwtPayload } from 'jsonwebtoken';
import { queryOne } from '../config/database';
import { env } from '../config/env';
import { DocumentModel } from '../models/document.model';
import { FileModel } from '../models/file.model';
import { TaskModel } from '../models/task.model';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';
import { FileStorageService } from './file-storage.service';
import { AIRetrievalService } from './ai-retrieval.service';

const VIEW_ONLY_FILE_TOKEN_AUDIENCE = 'humanly:file-view';
const VIEW_ONLY_FILE_TOKEN_PURPOSE = 'view_only_file';
const VIEW_ONLY_FILE_TOKEN_EXPIRES_IN_SECONDS = 60;
const DOCUMENT_SOURCE_FILE_LOCK_MESSAGE = 'Document source PDF is read-only after document creation';

const isUniqueViolation = (error: unknown): boolean => (
  typeof error === 'object' &&
  error !== null &&
  'code' in error &&
  (error as { code?: unknown }).code === '23505'
);

interface FileViewTokenPayload extends JwtPayload {
  purpose: typeof VIEW_ONLY_FILE_TOKEN_PURPOSE;
  fileId: string;
  userId: string;
}

export class FileService {
  static async uploadDocumentFile(
    documentId: string,
    userId: string,
    file: Express.Multer.File,
    title?: string
  ): Promise<AppFile> {
    const document = await DocumentModel.findByIdAndUserId(documentId, userId);
    if (!document) {
      throw new AppError(404, 'Document not found');
    }

    const existingFiles = await FileModel.findByDocument(documentId);
    if (existingFiles.length > 0) {
      throw new AppError(409, DOCUMENT_SOURCE_FILE_LOCK_MESSAGE);
    }

    let appFile: AppFile;
    try {
      appFile = await this.createFileRecord({
        file,
        userId,
        title: title || document.title,
        documentId,
        purpose: 'document_source_pdf',
      });
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new AppError(409, DOCUMENT_SOURCE_FILE_LOCK_MESSAGE);
      }
      throw error;
    }

    await this.indexFileBestEffort(appFile);
    return appFile;
  }

  static async attachTaskInstructionFileAtCreation(
    taskId: string,
    userId: string,
    file: Express.Multer.File,
    title?: string
  ): Promise<AppFile> {
    const appFile = await this.createFileRecord({
      file,
      userId,
      title: title || file.originalname.replace(/\.pdf$/i, ''),
      taskId,
      purpose: 'task_instruction_pdf',
    });

    await this.indexFileBestEffort(appFile);
    return appFile;
  }

  static assertValidPdfUploadFile(file: Express.Multer.File): void {
    if (file.mimetype !== 'application/pdf') {
      throw new AppError(400, 'PDF file is required');
    }
    this.assertValidPdfPayload(file);
  }

  static async listDocumentFiles(documentId: string, userId: string): Promise<AppFile[]> {
    const document = await DocumentModel.findByIdAndUserId(documentId, userId);
    if (!document) {
      throw new AppError(404, 'Document not found');
    }

    return FileModel.findByDocument(documentId);
  }

  static async listTaskInstructionFiles(taskId: string, userId: string): Promise<AppFile[]> {
    const task = await TaskModel.findById(taskId);
    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    if (task.userId !== userId) {
      throw new AppError(403, 'Access denied to this task');
    }

    return FileModel.findByTask(taskId);
  }

  static async listAccessibleTaskInstructionFiles(taskIdOrInviteCode: string, userId: string): Promise<AppFile[]> {
    const normalizedIdentifier = taskIdOrInviteCode.trim();
    const task = /^[A-Z0-9]{6}$/i.test(normalizedIdentifier)
      ? await TaskModel.findByInviteCode(normalizedIdentifier.toUpperCase())
      : await TaskModel.findById(normalizedIdentifier);

    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    const hasAccess = task.userId === userId || await TaskModel.hasEnrollment(task.id, userId);
    if (!hasAccess) {
      throw new AppError(403, 'Access denied to this task');
    }

    return FileModel.findByTask(task.id);
  }

  static async issueViewOnlyFileToken(fileId: string, userId: string): Promise<{
    token: string;
    expiresAt: string;
    expiresInSeconds: number;
  }> {
    const appFile = await FileModel.findById(fileId);
    if (!appFile) {
      throw new AppError(404, 'File not found');
    }

    await this.assertCanRead(appFile, userId);
    const resourceAccess = await this.getResourceAccess(appFile);
    if (resourceAccess !== 'view-only') {
      throw new AppError(400, 'This file does not require a view-only token');
    }

    const token = jwt.sign(
      {
        purpose: VIEW_ONLY_FILE_TOKEN_PURPOSE,
        fileId,
        userId,
      },
      env.jwtSecret,
      {
        audience: VIEW_ONLY_FILE_TOKEN_AUDIENCE,
        expiresIn: VIEW_ONLY_FILE_TOKEN_EXPIRES_IN_SECONDS,
        subject: fileId,
      }
    );

    return {
      token,
      expiresAt: new Date(Date.now() + VIEW_ONLY_FILE_TOKEN_EXPIRES_IN_SECONDS * 1000).toISOString(),
      expiresInSeconds: VIEW_ONLY_FILE_TOKEN_EXPIRES_IN_SECONDS,
    };
  }

  static async streamFile(
    fileId: string,
    userId: string,
    options: { viewToken?: string } = {}
  ): Promise<NodeJS.ReadableStream> {
    const appFile = await FileModel.findById(fileId);
    if (!appFile) {
      throw new AppError(404, 'File not found');
    }

    await this.assertCanRead(appFile, userId);
    const resourceAccess = await this.getResourceAccess(appFile);
    if (resourceAccess === 'view-only') {
      this.assertValidViewOnlyToken(options.viewToken, fileId, userId);
    }

    return FileStorageService.getStream(appFile);
  }

  static async deleteFile(fileId: string, userId: string): Promise<void> {
    const appFile = await FileModel.findById(fileId);
    if (!appFile) {
      throw new AppError(404, 'File not found');
    }

    await this.assertCanManage(appFile, userId);
    if (appFile.taskId) {
      throw new AppError(409, 'Task instruction files are read-only after task creation');
    }

    if (!appFile.legacySourceId) {
      await FileStorageService.delete(appFile);
    }
    await FileModel.delete(fileId);
  }

  static async canReadFileForDocument(userId: string, documentId: string, fileId: string): Promise<boolean> {
    const appFile = await FileModel.findById(fileId);
    if (!appFile) return false;

    if (appFile.documentId === documentId) {
      return DocumentModel.isOwner(documentId, userId);
    }

    if (appFile.taskId) {
      const access = await queryOne<{ id: string }>(
        `SELECT te.id
         FROM task_enrollments te
         JOIN documents d ON d.id = te.submission_document_id
         WHERE te.task_id = $1
           AND te.user_id = $2
           AND d.id = $3
           AND d.user_id = $2`,
        [appFile.taskId, userId, documentId]
      );
      return !!access;
    }

    return false;
  }

  private static async createFileRecord(input: {
    file: Express.Multer.File;
    userId: string;
    title: string;
    documentId?: string;
    taskId?: string;
    purpose: 'document_source_pdf' | 'task_instruction_pdf';
  }): Promise<AppFile> {
    this.assertValidPdfUploadFile(input.file);

    const fileId = crypto.randomUUID();
    const stored = await FileStorageService.store(input.file.buffer, fileId);

    return FileModel.create({
      id: fileId,
      ownerUserId: input.userId,
      documentId: input.documentId || null,
      taskId: input.taskId || null,
      purpose: input.purpose,
      title: input.title.trim() || input.file.originalname.replace(/\.pdf$/i, ''),
      originalFilename: input.file.originalname,
      mimeType: input.file.mimetype,
      storageProvider: stored.storageProvider,
      storageKey: stored.storageKey,
      storageBucket: stored.storageBucket,
      storageRegion: stored.storageRegion,
      storageEtag: stored.storageEtag,
      fileSize: stored.fileSize,
      checksum: stored.checksum,
      pageCount: null,
      uploadStatus: stored.uploadStatus,
    });
  }

  private static assertValidPdfPayload(file: Express.Multer.File): void {
    if (!file.buffer || file.buffer.length === 0 || file.size === 0) {
      throw new AppError(400, 'PDF file is empty');
    }

    const headerWindow = file.buffer.subarray(0, Math.min(file.buffer.length, 1024));
    if (headerWindow.indexOf(Buffer.from('%PDF-')) === -1) {
      throw new AppError(400, 'Invalid PDF file');
    }
  }

  private static async assertCanRead(appFile: AppFile, userId: string): Promise<void> {
    if (appFile.documentId && await DocumentModel.isOwner(appFile.documentId, userId)) {
      return;
    }

    if (appFile.taskId) {
      const task = await TaskModel.findById(appFile.taskId);
      if (task?.userId === userId || await TaskModel.hasEnrollment(appFile.taskId, userId)) {
        return;
      }
    }

    throw new AppError(403, 'Access denied');
  }

  private static async getResourceAccess(appFile: AppFile): Promise<ResourceAccessPolicy> {
    if (appFile.taskId) {
      const task = await TaskModel.findById(appFile.taskId);
      return normalizeResourceAccessPolicy(task?.environmentConfig?.resourceAccess);
    }

    if (appFile.documentId) {
      const document = await DocumentModel.findById(appFile.documentId);
      return normalizeResourceAccessPolicy(document?.environmentConfig?.resourceAccess);
    }

    return 'downloadable';
  }

  private static assertValidViewOnlyToken(
    token: string | undefined,
    fileId: string,
    userId: string
  ): void {
    if (!token) {
      this.logRejectedViewOnlyAccess(fileId, userId, 'missing_token');
      throw new AppError(403, 'View-only file token is required');
    }

    try {
      const decoded = jwt.verify(token, env.jwtSecret, {
        audience: VIEW_ONLY_FILE_TOKEN_AUDIENCE,
        subject: fileId,
      }) as FileViewTokenPayload;

      if (
        decoded.purpose !== VIEW_ONLY_FILE_TOKEN_PURPOSE ||
        decoded.fileId !== fileId ||
        decoded.userId !== userId
      ) {
        this.logRejectedViewOnlyAccess(fileId, userId, 'token_scope_mismatch');
        throw new AppError(403, 'View-only file token is not valid for this file');
      }
    } catch (error) {
      if (error instanceof AppError) {
        throw error;
      }
      this.logRejectedViewOnlyAccess(fileId, userId, 'invalid_or_expired_token');
      throw new AppError(403, 'View-only file token is invalid or expired');
    }
  }

  private static logRejectedViewOnlyAccess(fileId: string, userId: string, reason: string): void {
    logger.warn('Rejected view-only file access', {
      fileId,
      userId,
      reason,
    });
  }

  private static async assertCanManage(appFile: AppFile, userId: string): Promise<void> {
    if (appFile.documentId && await DocumentModel.isOwner(appFile.documentId, userId)) {
      return;
    }

    if (appFile.taskId) {
      const task = await TaskModel.findById(appFile.taskId);
      if (task?.userId === userId) {
        return;
      }
    }

    throw new AppError(403, 'Access denied');
  }

  private static async indexFileBestEffort(appFile: AppFile): Promise<void> {
    try {
      await AIRetrievalService.indexFile(appFile.id);
    } catch (error) {
      logger.warn('File uploaded but text indexing failed', { fileId: appFile.id, error });
    }
  }
}

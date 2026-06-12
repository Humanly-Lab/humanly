import type {
  AppFile,
  ResourceAccessPolicy,
  SignedFileReadUrlResponse,
  SignedFileUploadInitRequest,
  SignedFileUploadInitResponse,
} from '@humanly/shared';
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

const MAX_PDF_SIZE_BYTES = 50 * 1024 * 1024;
const PENDING_UPLOAD_TTL_MS = 2 * 60 * 60 * 1000;
const VIEW_ONLY_FILE_TOKEN_AUDIENCE = 'humanly:file-view';
const VIEW_ONLY_FILE_TOKEN_PURPOSE = 'view_only_file';
const VIEW_ONLY_FILE_TOKEN_EXPIRES_IN_SECONDS = 60;

interface FileViewTokenPayload extends JwtPayload {
  purpose: typeof VIEW_ONLY_FILE_TOKEN_PURPOSE;
  fileId: string;
  userId: string;
}

export class FileService {
  static async initiateDocumentFileUpload(
    documentId: string,
    userId: string,
    data: SignedFileUploadInitRequest
  ): Promise<SignedFileUploadInitResponse> {
    if (!FileStorageService.supportsSignedUploads()) {
      throw new AppError(409, 'Signed PDF upload unavailable in this environment');
    }

    const document = await DocumentModel.findByIdAndUserId(documentId, userId);
    if (!document) {
      throw new AppError(404, 'Document not found');
    }

    this.assertValidPdfUploadRequest(data);

    const fileId = crypto.randomUUID();
    const checksum = data.checksum.toLowerCase();
    const storageKey = FileStorageService.buildObjectKey(fileId, checksum);
    const signedUrl = await FileStorageService.createSignedUploadUrl(storageKey, data.mimeType);

    await FileModel.create({
      id: fileId,
      ownerUserId: userId,
      documentId,
      taskId: null,
      purpose: 'document_source_pdf',
      title: data.title?.trim() || document.title || data.filename.replace(/\.pdf$/i, ''),
      originalFilename: data.filename.trim() || 'source.pdf',
      mimeType: data.mimeType,
      storageProvider: 'gcs',
      storageKey,
      storageBucket: process.env.GCS_BUCKET_NAME || null,
      storageRegion: process.env.GCS_BUCKET_REGION || process.env.GCS_REGION || null,
      storageEtag: null,
      fileSize: data.fileSize,
      checksum,
      pageCount: null,
      uploadStatus: 'pending',
    });

    return {
      fileId,
      storageKey,
      uploadUrl: signedUrl.url,
      requiredHeaders: signedUrl.requiredHeaders || {},
      expiresAt: signedUrl.expiresAt.toISOString(),
    };
  }

  static async completeFileUpload(fileId: string, userId: string): Promise<AppFile> {
    const appFile = await FileModel.findById(fileId);
    if (!appFile) {
      throw new AppError(404, 'File not found');
    }

    await this.assertCanManage(appFile, userId);

    if (appFile.purpose !== 'document_source_pdf' || !appFile.documentId) {
      throw new AppError(400, 'Only document PDF uploads can be completed');
    }

    if (appFile.storageProvider !== 'gcs') {
      throw new AppError(409, 'Signed upload completion is only available for GCS files');
    }

    if (appFile.uploadStatus === 'ready') {
      return appFile;
    }

    if (appFile.uploadStatus === 'failed') {
      throw new AppError(409, 'File upload has failed');
    }

    if (this.isPendingUploadExpired(appFile)) {
      await FileModel.markFailed(fileId);
      throw new AppError(410, 'File upload has expired');
    }

    const metadata = await FileStorageService.getMetadata(appFile);
    if (!metadata.exists) {
      await FileModel.markFailed(fileId);
      throw new AppError(404, 'Uploaded file object was not found');
    }

    if (metadata.contentType && metadata.contentType !== 'application/pdf') {
      await FileModel.markFailed(fileId);
      throw new AppError(400, 'Uploaded file is not a PDF');
    }

    if (metadata.size !== null && metadata.size !== undefined && metadata.size !== appFile.fileSize) {
      await FileModel.markFailed(fileId);
      throw new AppError(400, 'Uploaded file size does not match the initiated upload');
    }

    const buffer = await FileStorageService.getBuffer(appFile);
    if (buffer.length !== appFile.fileSize) {
      await FileModel.markFailed(fileId);
      throw new AppError(400, 'Uploaded file size does not match the initiated upload');
    }

    try {
      this.assertValidPdfBuffer(buffer);
    } catch (error) {
      await FileModel.markFailed(fileId);
      throw error;
    }
    const checksum = crypto.createHash('sha256').update(buffer).digest('hex');
    if (checksum !== appFile.checksum) {
      await FileModel.markFailed(fileId);
      throw new AppError(400, 'Uploaded file checksum does not match the initiated upload');
    }

    const readyFile = await FileModel.markReady(fileId, {
      storageEtag: metadata.etag || appFile.storageEtag || null,
    });
    if (!readyFile) {
      throw new AppError(500, 'Failed to finalize uploaded file');
    }

    void this.indexFileBestEffort(readyFile);
    return readyFile;
  }

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

    const appFile = await this.createFileRecord({
      file,
      userId,
      title: title || document.title,
      documentId,
      purpose: 'document_source_pdf',
    });

    await this.indexFileBestEffort(appFile);
    return appFile;
  }

  static async uploadTaskInstructionFile(
    taskId: string,
    userId: string,
    file: Express.Multer.File,
    title?: string
  ): Promise<AppFile> {
    const task = await TaskModel.findById(taskId);
    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    if (task.userId !== userId) {
      throw new AppError(403, 'Access denied to this task');
    }

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

  static async listDocumentFiles(documentId: string, userId: string): Promise<AppFile[]> {
    const document = await DocumentModel.findByIdAndUserId(documentId, userId);
    if (!document) {
      throw new AppError(404, 'Document not found');
    }

    return FileModel.findReadyByDocument(documentId);
  }

  static async listTaskInstructionFiles(taskId: string, userId: string): Promise<AppFile[]> {
    const task = await TaskModel.findById(taskId);
    if (!task) {
      throw new AppError(404, 'Task not found');
    }

    if (task.userId !== userId) {
      throw new AppError(403, 'Access denied to this task');
    }

    return FileModel.findReadyByTask(taskId);
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

    return FileModel.findReadyByTask(task.id);
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
    this.assertFileReady(appFile);
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
    this.assertFileReady(appFile);
    const resourceAccess = await this.getResourceAccess(appFile);
    if (resourceAccess === 'view-only') {
      this.assertValidViewOnlyToken(options.viewToken, fileId, userId);
    }

    return FileStorageService.getStream(appFile);
  }

  static async getFileReadUrl(fileId: string, userId: string): Promise<SignedFileReadUrlResponse> {
    const appFile = await FileModel.findById(fileId);
    if (!appFile) {
      throw new AppError(404, 'File not found');
    }

    await this.assertCanRead(appFile, userId);
    this.assertFileReady(appFile);
    const resourceAccess = await this.getResourceAccess(appFile);

    if (resourceAccess === 'view-only' || appFile.storageProvider !== 'gcs') {
      return {
        url: null,
        expiresAt: null,
        fallbackMode: 'stream',
      };
    }

    const signedUrl = await FileStorageService.createSignedReadUrl(appFile);
    return {
      url: signedUrl.url,
      expiresAt: signedUrl.expiresAt.toISOString(),
      fallbackMode: 'signed_url',
    };
  }

  static async deleteFile(fileId: string, userId: string): Promise<void> {
    const appFile = await FileModel.findById(fileId);
    if (!appFile) {
      throw new AppError(404, 'File not found');
    }

    await this.assertCanManage(appFile, userId);
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
    if (input.file.mimetype !== 'application/pdf') {
      throw new AppError(400, 'PDF file is required');
    }
    this.assertValidPdfPayload(input.file);

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

    this.assertValidPdfBuffer(file.buffer);
  }

  private static assertValidPdfUploadRequest(data: SignedFileUploadInitRequest): void {
    if (data.mimeType !== 'application/pdf') {
      throw new AppError(400, 'PDF file is required');
    }

    if (!data.filename || typeof data.filename !== 'string') {
      throw new AppError(400, 'PDF filename is required');
    }

    if (!Number.isInteger(data.fileSize) || data.fileSize <= 0) {
      throw new AppError(400, 'PDF file is empty');
    }

    if (data.fileSize > MAX_PDF_SIZE_BYTES) {
      throw new AppError(400, 'PDF must be smaller than 50MB');
    }

    if (!/^[a-f0-9]{64}$/i.test(data.checksum)) {
      throw new AppError(400, 'Invalid file checksum');
    }
  }

  private static assertValidPdfBuffer(buffer: Buffer): void {
    const headerWindow = buffer.subarray(0, Math.min(buffer.length, 1024));
    if (headerWindow.indexOf(Buffer.from('%PDF-')) === -1) {
      throw new AppError(400, 'Invalid PDF file');
    }
  }

  private static assertFileReady(appFile: AppFile): void {
    if (appFile.uploadStatus !== 'ready') {
      throw new AppError(409, 'File upload is not ready');
    }
  }

  private static isPendingUploadExpired(appFile: AppFile): boolean {
    return Date.now() - new Date(appFile.createdAt).getTime() > PENDING_UPLOAD_TTL_MS;
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

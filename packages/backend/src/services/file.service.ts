import type { AppFile } from '@humanly/shared';
import crypto from 'crypto';
import { queryOne } from '../config/database';
import { DocumentModel } from '../models/document.model';
import { FileModel } from '../models/file.model';
import { TaskModel } from '../models/task.model';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';
import { FileStorageService } from './file-storage.service';
import { AIRetrievalService } from './ai-retrieval.service';

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

  static async streamFile(fileId: string, userId: string): Promise<NodeJS.ReadableStream> {
    const appFile = await FileModel.findById(fileId);
    if (!appFile) {
      throw new AppError(404, 'File not found');
    }

    await this.assertCanRead(appFile, userId);
    return FileStorageService.getStream(appFile);
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

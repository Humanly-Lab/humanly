export type FilePurpose = 'document_source_pdf' | 'task_instruction_pdf';

export interface AppFile {
  id: string;
  ownerUserId: string;
  documentId?: string | null;
  taskId?: string | null;
  purpose: FilePurpose;
  title: string;
  originalFilename: string;
  mimeType: string;
  storageProvider: string;
  storageKey: string;
  fileSize: number;
  checksum: string;
  pageCount?: number | null;
  legacySourceId?: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export interface CreateFileData {
  id?: string;
  ownerUserId: string;
  documentId?: string | null;
  taskId?: string | null;
  purpose: FilePurpose;
  title: string;
  originalFilename: string;
  mimeType: string;
  storageProvider: string;
  storageKey: string;
  fileSize: number;
  checksum: string;
  pageCount?: number | null;
  legacySourceId?: string | null;
}

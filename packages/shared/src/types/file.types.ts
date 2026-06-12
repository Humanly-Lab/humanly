export type FilePurpose = 'document_source_pdf' | 'task_instruction_pdf';
export type FileUploadStatus = 'pending' | 'ready' | 'failed';

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
  storageBucket?: string | null;
  storageRegion?: string | null;
  storageEtag?: string | null;
  fileSize: number;
  checksum: string;
  pageCount?: number | null;
  uploadStatus: FileUploadStatus;
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
  storageBucket?: string | null;
  storageRegion?: string | null;
  storageEtag?: string | null;
  fileSize: number;
  checksum: string;
  pageCount?: number | null;
  uploadStatus?: FileUploadStatus;
  legacySourceId?: string | null;
}

export interface SignedFileUploadInitRequest {
  title?: string;
  filename: string;
  mimeType: 'application/pdf';
  fileSize: number;
  checksum: string;
}

export interface SignedFileUploadInitResponse {
  fileId: string;
  storageKey: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
  expiresAt: string;
}

export interface SignedFileUploadCompleteResponse {
  file: AppFile;
}

export interface SignedFileReadUrlResponse {
  url: string | null;
  expiresAt: string | null;
  fallbackMode: 'signed_url' | 'stream';
}

import { apiClient, TokenManager } from '@/lib/api-client';
import type {
  AppFile,
  SignedFileReadUrlResponse,
  SignedFileUploadInitResponse,
} from '@humanly/shared';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? '/api/v1' : 'http://localhost:3001/api/v1');

export const fileApi = {
  async getPdfBlob(fileId: string, options: { viewOnly?: boolean } = {}): Promise<string> {
    if (options.viewOnly) {
      return this.getPdfBlobViaStream(fileId, options);
    }

    const readUrlResponse = await apiClient.get<{ data: SignedFileReadUrlResponse }>(`/files/${fileId}/read-url`);
    const readUrl = readUrlResponse.data.data;
    if (readUrl.fallbackMode === 'signed_url' && readUrl.url) {
      return readUrl.url;
    }

    return this.getPdfBlobViaStream(fileId);
  },

  async getPdfBlobViaStream(fileId: string, options: { viewOnly?: boolean } = {}): Promise<string> {
    const token = TokenManager.getAccessToken();
    let viewToken: string | undefined;

    if (options.viewOnly) {
      const tokenResponse = await apiClient.get(`/files/${fileId}/view-token`);
      viewToken = tokenResponse.data.data?.token;
      if (!viewToken) {
        throw new Error('Failed to prepare view-only PDF access');
      }
    }

    const contentUrl = new URL(`${API_BASE}/files/${fileId}/content`, window.location.origin);
    if (viewToken) {
      contentUrl.searchParams.set('viewToken', viewToken);
    }

    const response = await fetch(contentUrl.toString(), {
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error('Failed to load PDF');
    }

    const blob = await response.blob();
    return URL.createObjectURL(blob);
  },

  async uploadDocumentPdf(documentId: string, title: string, pdfFile: File): Promise<AppFile> {
    let checksum: string;
    try {
      checksum = await sha256Hex(pdfFile);
    } catch {
      return this.uploadDocumentPdfViaMultipart(documentId, title, pdfFile);
    }

    let upload: SignedFileUploadInitResponse;

    try {
      upload = await this.initiateDocumentPdfUpload(documentId, title, pdfFile, checksum);
    } catch (err: any) {
      if (err?.response?.status === 409) {
        return this.uploadDocumentPdfViaMultipart(documentId, title, pdfFile);
      }
      throw err;
    }

    return this.uploadDocumentPdfWithSignedUrl(pdfFile, upload);
  },

  async initiateDocumentPdfUpload(
    documentId: string,
    title: string,
    pdfFile: File,
    checksum: string
  ): Promise<SignedFileUploadInitResponse> {
    const initResponse = await apiClient.post<{ data: SignedFileUploadInitResponse }>(
      `/documents/${documentId}/files/uploads`,
      {
        title,
        filename: pdfFile.name,
        mimeType: 'application/pdf',
        fileSize: pdfFile.size,
        checksum,
      }
    );
    return initResponse.data.data;
  },

  async uploadDocumentPdfWithSignedUrl(pdfFile: File, upload: SignedFileUploadInitResponse): Promise<AppFile> {
    const uploadResponse = await fetch(upload.uploadUrl, {
      method: 'PUT',
      headers: upload.requiredHeaders,
      body: pdfFile,
    });

    if (!uploadResponse.ok) {
      throw new Error('Failed to upload PDF to storage');
    }

    const completeResponse = await apiClient.post<{ data: { file: AppFile } }>(`/files/${upload.fileId}/complete`);
    return completeResponse.data.data.file;
  },

  async uploadDocumentPdfViaMultipart(documentId: string, title: string, pdfFile: File): Promise<AppFile> {
    const formData = new FormData();
    formData.append('pdf', pdfFile);
    formData.append('title', title);

    const response = await apiClient.post(`/documents/${documentId}/files`, formData);
    return response.data.data;
  },
};

async function sha256Hex(file: File): Promise<string> {
  if (!globalThis.crypto?.subtle) {
    throw new Error('File checksum calculation is not supported in this browser');
  }

  const digest = await globalThis.crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
}

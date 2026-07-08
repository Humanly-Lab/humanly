import {
  apiClient,
  getApiUrl,
  getDocumentScopedAccessToken,
  TokenManager,
  waitForDocumentScopedAccessTokenReady,
} from '@/lib/api-client';
import type { AppFile } from '@humanly/shared';

export interface PdfDocumentSource {
  url: string;
  httpHeaders?: Record<string, string>;
  withCredentials?: boolean;
  cleanup?: () => void;
}

function buildFileContentUrl(fileId: string): string {
  return new URL(getApiUrl(`/files/${fileId}/content`), window.location.origin).toString();
}

function buildFileDownloadUrl(fileId: string): string {
  return new URL(getApiUrl(`/files/${fileId}/download`), window.location.origin).toString();
}

async function getFileAccessHeaders(
  fileId: string,
  options: { viewOnly?: boolean; documentId?: string } = {}
): Promise<Record<string, string>> {
  if (options.documentId) {
    await waitForDocumentScopedAccessTokenReady(options.documentId);
  }

  const token = options.documentId
    ? getDocumentScopedAccessToken(options.documentId)
    : TokenManager.getAccessToken();

  const headers: Record<string, string> = {};
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  if (options.viewOnly) {
    const tokenResponse = await apiClient.get(`/files/${fileId}/view-token`, {
      headers,
    });
    const viewToken = tokenResponse.data.data?.token;
    if (!viewToken) {
      throw new Error('Failed to prepare view-only PDF access');
    }
    headers['X-File-View-Token'] = viewToken;
  }

  return headers;
}

export const fileApi = {
  async getPdfDocumentSource(
    fileId: string,
    options: { viewOnly?: boolean; documentId?: string } = {}
  ): Promise<PdfDocumentSource> {
    const headers = await getFileAccessHeaders(fileId, options);

    return {
      url: buildFileContentUrl(fileId),
      httpHeaders: headers,
      withCredentials: true,
    };
  },

  async downloadPdf(
    fileId: string,
    options: { documentId?: string } = {}
  ): Promise<Blob> {
    const headers = await getFileAccessHeaders(fileId, {
      documentId: options.documentId,
      viewOnly: false,
    });

    const response = await fetch(buildFileDownloadUrl(fileId), {
      headers,
      credentials: 'include',
    });

    if (!response.ok) {
      throw new Error(`Failed to download PDF: HTTP ${response.status}`);
    }

    return response.blob();
  },

  async uploadDocumentPdf(documentId: string, title: string, pdfFile: File): Promise<AppFile> {
    const formData = new FormData();
    formData.append('pdf', pdfFile);
    formData.append('title', title);

    const response = await apiClient.post(`/documents/${documentId}/files`, formData);
    return response.data.data;
  },
};

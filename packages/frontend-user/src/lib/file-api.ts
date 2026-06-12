import { apiClient, TokenManager } from '@/lib/api-client';
import type { AppFile } from '@humanly/shared';

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ||
  (process.env.NODE_ENV === 'production' ? '/api/v1' : 'http://localhost:3001/api/v1');

export const fileApi = {
  async getPdfBlob(fileId: string, options: { viewOnly?: boolean } = {}): Promise<string> {
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
    const formData = new FormData();
    formData.append('pdf', pdfFile);
    formData.append('title', title);

    const response = await apiClient.post(`/documents/${documentId}/files`, formData);
    return response.data.data;
  },
};

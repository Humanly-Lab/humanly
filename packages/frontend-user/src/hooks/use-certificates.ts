import { useState, useEffect, useCallback } from 'react';
import { apiClient, getApiUrl } from '@/lib/api-client';
import { downloadBlobWithSavePicker, openDownloadUrl, openUrlInNewTab, type DownloadOutcome } from '@/lib/download';
import type { Certificate, AIAuthorshipStats } from '@humanly/shared';

export interface CertificatesFilters {
  documentId?: string;
  limit?: number;
  offset?: number;
  sortBy?: 'createdAt' | 'generatedAt';
  sortOrder?: 'asc' | 'desc';
}

export function useCertificates(filters?: CertificatesFilters) {
  const [certificates, setCertificates] = useState<Certificate[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);

  const fetchCertificates = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Build query parameters
      const params = new URLSearchParams();
      if (filters?.documentId) params.append('documentId', filters.documentId);
      if (filters?.limit) params.append('limit', filters.limit.toString());
      if (filters?.offset) params.append('offset', filters.offset.toString());
      if (filters?.sortBy) params.append('sortBy', filters.sortBy);
      if (filters?.sortOrder) params.append('sortOrder', filters.sortOrder);

      const queryString = params.toString();
      const url = `/certificates${queryString ? `?${queryString}` : ''}`;

      const response = await apiClient.get<any>(url);

      // Handle response structure
      const certificatesData = response.data.data || [];
      const pagination = response.data.pagination;

      setCertificates(certificatesData);
      setTotal(pagination?.total || certificatesData.length);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch certificates');
      setCertificates([]);
      console.error('Error fetching certificates:', err);
    } finally {
      setIsLoading(false);
    }
  }, [filters?.documentId, filters?.limit, filters?.offset, filters?.sortBy, filters?.sortOrder]);

  useEffect(() => {
    fetchCertificates();
  }, [fetchCertificates]);

  const generateCertificate = useCallback(async (
    documentId: string,
    options?: {
      certificateType?: 'full_authorship' | 'partial_authorship';
      signerName?: string;
      includeFullText?: boolean;
      includeEditHistory?: boolean;
      accessCode?: string;
    }
  ) => {
    try {
      const response = await apiClient.post<any>('/certificates', {
        documentId,
        certificateType: options?.certificateType || 'full_authorship',
        signerName: options?.signerName,
        includeFullText: options?.includeFullText !== undefined ? options.includeFullText : true,
        includeEditHistory: options?.includeEditHistory !== undefined ? options.includeEditHistory : true,
        accessCode: options?.accessCode,
      });

      const newCertificate = response.data.data?.certificate;
      if (newCertificate) {
        setCertificates(prev => [newCertificate, ...prev]);
        setTotal(prev => prev + 1);
      }

      return newCertificate;
    } catch (err: any) {
      throw new Error(err.response?.data?.message || 'Failed to generate certificate');
    }
  }, []);

  const deleteCertificate = useCallback(async (certificateId: string) => {
    try {
      await apiClient.delete(`/certificates/${certificateId}`);

      setCertificates(prev => prev.filter(cert => cert.id !== certificateId));
      setTotal(prev => prev - 1);
    } catch (err: any) {
      throw new Error(err.response?.data?.message || 'Failed to delete certificate');
    }
  }, []);

  return {
    certificates,
    isLoading,
    error,
    total,
    refetch: fetchCertificates,
    generateCertificate,
    deleteCertificate,
  };
}

export function useCertificate(certificateId: string) {
  const [certificate, setCertificate] = useState<Certificate | null>(null);
  const [aiStats, setAiStats] = useState<AIAuthorshipStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isLoadingAiStats, setIsLoadingAiStats] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCertificate = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await apiClient.get<any>(`/certificates/${certificateId}`);
      const certData = response.data.data?.certificate;

      setCertificate(certData || null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to fetch certificate');
      setCertificate(null);
      console.error('Error fetching certificate:', err);
    } finally {
      setIsLoading(false);
    }
  }, [certificateId]);

  const fetchAIStats = useCallback(async () => {
    try {
      setIsLoadingAiStats(true);
      const response = await apiClient.get<any>(`/certificates/${certificateId}/ai-stats`);
      setAiStats(response.data.data || null);
    } catch (err: any) {
      console.error('Error fetching AI stats:', err);
      setAiStats(null);
    } finally {
      setIsLoadingAiStats(false);
    }
  }, [certificateId]);

  useEffect(() => {
    if (certificateId) {
      fetchCertificate();
      fetchAIStats();
    }
  }, [certificateId, fetchCertificate, fetchAIStats]);

  const downloadJSON = useCallback(async (): Promise<DownloadOutcome> => {
    try {
      return await downloadBlobWithSavePicker(async () => {
        const response = await apiClient.get(`/certificates/${certificateId}/json`);
        const data = response.data;

        return new Blob([JSON.stringify(data, null, 2)], {
          type: 'application/json',
        });
      }, {
        filename: `certificate-${certificateId}.json`,
        description: 'JSON certificate',
        mimeType: 'application/json',
        extensions: ['.json'],
      });
    } catch (err: any) {
      throw new Error(err.response?.data?.message || err.message || 'Failed to download JSON');
    }
  }, [certificateId]);  

  const downloadPDF = useCallback(async (): Promise<DownloadOutcome> => {
    try {
      const safeTitle = certificate?.title
        ?.trim()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || certificateId;
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');

      return openDownloadUrl(getApiUrl(`/certificates/${certificateId}/pdf?filename=certificate-${safeTitle}-${stamp}.pdf`));
    } catch (err: any) {
      throw new Error(err.response?.data?.message || err.message || 'Failed to download PDF');
    }
  }, [certificate?.title, certificateId]);

  const openPDF = useCallback(async (): Promise<DownloadOutcome> => {
    try {
      const safeTitle = certificate?.title
        ?.trim()
        .replace(/[^a-z0-9]+/gi, '-')
        .replace(/^-+|-+$/g, '')
        .toLowerCase() || certificateId;

      return openUrlInNewTab(getApiUrl(`/certificates/${certificateId}/pdf?disposition=inline&filename=certificate-${safeTitle}.pdf`));
    } catch (err: any) {
      throw new Error(err.response?.data?.message || err.message || 'Failed to open PDF');
    }
  }, [certificate?.title, certificateId]);

  const updateAccessCode = useCallback(async (accessCode: string | null) => {
    try {
      const response = await apiClient.patch<any>(
        `/certificates/${certificateId}/access-code`,
        { accessCode }
      );

      const updatedCertificate = response.data.data?.certificate;
      if (updatedCertificate) {
        setCertificate(updatedCertificate);
      }

      return updatedCertificate;
    } catch (err: any) {
      throw new Error(err.response?.data?.message || 'Failed to update access code');
    }
  }, [certificateId]);

  const updateDisplayOptions = useCallback(async (
    includeFullText?: boolean,
    includeEditHistory?: boolean
  ) => {
    try {
      const response = await apiClient.patch<any>(
        `/certificates/${certificateId}/display-options`,
        { includeFullText, includeEditHistory }
      );

      const updatedCertificate = response.data.data?.certificate;
      if (updatedCertificate) {
        setCertificate(updatedCertificate);
      }

      return updatedCertificate;
    } catch (err: any) {
      throw new Error(err.response?.data?.message || 'Failed to update display options');
    }
  }, [certificateId]);

  return {
    certificate,
    aiStats,
    isLoading,
    isLoadingAiStats,
    error,
    refetch: fetchCertificate,
    refetchAiStats: fetchAIStats,
    downloadJSON,
    downloadPDF,
    openPDF,
    updateAccessCode,
    updateDisplayOptions,
  };
}

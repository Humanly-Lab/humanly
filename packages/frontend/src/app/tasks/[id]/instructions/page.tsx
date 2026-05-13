'use client';

import { useCallback, useEffect, useState } from 'react';
import type { ChangeEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  FileText,
  Loader2,
  RefreshCcw,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import type { Paper } from '@humanly/shared';

import api, { ApiError, apiClient } from '@/lib/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { formatDate } from '@/lib/utils';

export default function TaskInstructionsPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  const { toast } = useToast();

  const [papers, setPapers] = useState<Paper[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);
  const [deletingPaperId, setDeletingPaperId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [instructionFile, setInstructionFile] = useState<File | null>(null);
  const [instructionTitle, setInstructionTitle] = useState('');

  const instructionPapers = papers.filter((paper) => paper.keywords?.includes('instructions'));

  const fetchInstructionFiles = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get<{
        success: boolean;
        data: Paper[];
      }>(`/api/v1/tasks/${taskId}/papers`);
      setPapers(response.data);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load instruction files');
      setPapers([]);
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (taskId) {
      fetchInstructionFiles();
    }
  }, [fetchInstructionFiles, taskId]);

  const handleInstructionFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      setInstructionFile(null);
      event.target.value = '';
      toast({
        title: 'Invalid file',
        description: 'Instruction files must be uploaded as PDF.',
        variant: 'destructive',
      });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      setInstructionFile(null);
      event.target.value = '';
      toast({
        title: 'File too large',
        description: 'Instruction PDFs must be smaller than 50MB.',
        variant: 'destructive',
      });
      return;
    }

    setInstructionFile(file);
    setInstructionTitle(file.name.replace(/\.pdf$/i, ''));
  };

  const handleUpload = async () => {
    if (!instructionFile) return;

    try {
      setIsUploading(true);
      const formData = new FormData();
      formData.append('pdf', instructionFile);
      formData.append('title', instructionTitle.trim() || instructionFile.name.replace(/\.pdf$/i, ''));
      formData.append('authors', JSON.stringify([]));
      formData.append('abstract', 'Task instruction file');
      formData.append('keywords', JSON.stringify(['instructions']));

      await api.post(`/api/v1/tasks/${taskId}/papers`, formData);
      setInstructionFile(null);
      setInstructionTitle('');
      toast({
        title: 'Instruction file uploaded',
        description: 'The file is now available for enrolled users.',
      });
      await fetchInstructionFiles();
    } catch (err) {
      const apiError = err as ApiError;
      toast({
        title: 'Upload failed',
        description: apiError.message || 'Failed to upload instruction file',
        variant: 'destructive',
      });
    } finally {
      setIsUploading(false);
    }
  };

  const handleView = async (paperId: string) => {
    try {
      const response = await apiClient.get(`/api/v1/papers/${paperId}/content`, {
        responseType: 'blob',
      });
      const url = URL.createObjectURL(response.data);
      window.open(url, '_blank', 'noopener,noreferrer');
      window.setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (err) {
      const apiError = err as ApiError;
      toast({
        title: 'Unable to open file',
        description: apiError.message || 'Failed to open instruction PDF',
        variant: 'destructive',
      });
    }
  };

  const handleDelete = async (paper: Paper) => {
    if (!confirm(`Delete instruction file "${paper.title}"?`)) return;

    try {
      setDeletingPaperId(paper.id);
      await api.delete(`/api/v1/papers/${paper.id}`);
      setPapers((current) => current.filter((item) => item.id !== paper.id));
      toast({
        title: 'Instruction file deleted',
        description: 'The file was removed from this task.',
      });
    } catch (err) {
      const apiError = err as ApiError;
      toast({
        title: 'Delete failed',
        description: apiError.message || 'Failed to delete instruction file',
        variant: 'destructive',
      });
    } finally {
      setDeletingPaperId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/tasks/${taskId}`)}
          className="-ml-2 mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Task
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Instruction Files</h1>
        <p className="text-muted-foreground mt-2">
          Manage the shared PDF instructions attached to this writing task.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Upload Instruction PDF</CardTitle>
          <CardDescription>
            Uploaded instruction files are tagged separately from tracking snippets.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {instructionFile ? (
            <div className="rounded-md border bg-muted/40 p-4">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium" title={instructionFile.name}>
                    {instructionFile.name}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {(instructionFile.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => {
                    setInstructionFile(null);
                    setInstructionTitle('');
                  }}
                  disabled={isUploading}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
              <div className="mt-4 flex flex-col gap-3 sm:flex-row">
                <Input
                  value={instructionTitle}
                  onChange={(event) => setInstructionTitle(event.target.value)}
                  placeholder="Instruction title"
                  disabled={isUploading}
                />
                <Button onClick={handleUpload} disabled={isUploading}>
                  {isUploading ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Upload className="h-4 w-4 mr-2" />
                  )}
                  Upload
                </Button>
              </div>
            </div>
          ) : (
            <Input
              type="file"
              accept="application/pdf"
              onChange={handleInstructionFileChange}
              disabled={isUploading}
            />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Current Instruction Files</CardTitle>
              <CardDescription>Instruction PDFs currently attached to this task.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchInstructionFiles} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[240px] flex items-center justify-center">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">Loading instruction files...</p>
              </div>
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error loading instruction files</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : instructionPapers.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center rounded-md border">
              <div className="text-center space-y-2">
                <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
                <p className="font-medium">No instruction files yet</p>
                <p className="text-sm text-muted-foreground">Upload a PDF to make it available to enrolled users.</p>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {instructionPapers.map((paper) => (
                <div key={paper.id} className="flex flex-col gap-3 rounded-md border p-4 sm:flex-row sm:items-center">
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate font-medium" title={paper.title}>
                        {paper.title}
                      </p>
                      <Badge variant="secondary">instructions</Badge>
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Uploaded {formatDate(paper.submissionDate)} · {(paper.pdfFileSize / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleView(paper.id)}>
                      <Eye className="h-4 w-4 mr-2" />
                      View
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleDelete(paper)}
                      disabled={deletingPaperId === paper.id}
                    >
                      {deletingPaperId === paper.id ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4 mr-2" />
                      )}
                      Delete
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

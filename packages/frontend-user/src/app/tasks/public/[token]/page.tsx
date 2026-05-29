'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, FileText, Loader2, RefreshCw } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import api, { ApiError, TokenManager } from '@/lib/api-client';

interface PublicTaskStartResponse {
  success: boolean;
  data: {
    accessToken: string;
    publicSessionId: string;
    task: {
      id: string;
      name: string;
    };
    document: {
      id: string;
      title: string;
    };
  };
}

const getPublicSessionId = (token: string) => {
  const storageKey = `humanly_public_task_session_${token}`;
  const existing = typeof window !== 'undefined' ? localStorage.getItem(storageKey) : null;
  if (existing) return existing;

  const nextId = typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(36).slice(2)}`;

  if (typeof window !== 'undefined') {
    localStorage.setItem(storageKey, nextId);
  }

  return nextId;
};

export default function PublicTaskDocumentStartPage() {
  const params = useParams();
  const router = useRouter();
  const token = String(params.token || '');
  const hasStartedRef = useRef(false);
  const [taskName, setTaskName] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const startDocument = useCallback(async () => {
    if (!token) return;

    try {
      setError(null);
      const sessionId = getPublicSessionId(token);
      const response = await api.post<PublicTaskStartResponse>(
        `/tasks/public/${encodeURIComponent(token)}/start`,
        { sessionId },
        { skipAuthRedirect: true }
      );

      const documentId = response.data.document.id;
      const existingAccessToken = TokenManager.getAccessToken();
      TokenManager.setPublicDocumentAccessToken(documentId, response.data.accessToken);
      if (!existingAccessToken) {
        TokenManager.setAccessToken(response.data.accessToken);
      }
      setTaskName(response.data.task.name);
      router.replace(`/documents/${documentId}`);
    } catch (err) {
      hasStartedRef.current = false;
      const apiError = err as ApiError;
      setError(apiError.message || 'This task link is unavailable.');
    }
  }, [router, token]);

  useEffect(() => {
    if (!token || hasStartedRef.current) return;
    hasStartedRef.current = true;
    void startDocument();
  }, [startDocument, token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileText className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-normal">
            {error ? 'Task link unavailable' : 'Opening Humanly document'}
          </h1>
          {!error && (
            <p className="mt-2 text-sm text-muted-foreground">
              {taskName ? `Opening ${taskName}...` : 'Preparing your writing space...'}
            </p>
          )}
        </div>

        {error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Could not open this task</AlertTitle>
            <AlertDescription className="space-y-4">
              <p>{error}</p>
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => {
                  hasStartedRef.current = true;
                  void startDocument();
                }}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>
    </main>
  );
}

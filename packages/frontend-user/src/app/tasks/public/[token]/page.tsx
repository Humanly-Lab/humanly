'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, FileText, Loader2, LogIn, RefreshCw, UserRound } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import api, { ApiError, TokenManager } from '@/lib/api-client';
import { useAuthStore, type User } from '@/stores/auth-store';
import { getUserDisplayLabel, isGuestUserEmail } from '@/components/navigation/user-display';

type PublicTaskStartMode = 'guest' | 'signed-in';
type PublicTaskAvailabilityStatus = 'scheduled' | 'open' | 'ended';

interface PublicTaskResponse {
  success: boolean;
  data: {
    task: {
      name: string;
      description: string | null;
      startDate: string;
      endDate: string;
      allowGuestSubmissions: boolean;
      availabilityStatus: PublicTaskAvailabilityStatus;
    };
  };
}

interface PublicTaskStartResponse {
  success: boolean;
  data: {
    accessToken?: string;
    publicSessionId: string;
    mode?: PublicTaskStartMode;
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

const getSafeSharePath = (token: string) => {
  if (typeof window !== 'undefined') {
    return `${window.location.pathname}${window.location.search}`;
  }

  return `/tasks/public/${encodeURIComponent(token)}`;
};

export default function PublicTaskDocumentStartPage() {
  const params = useParams();
  const router = useRouter();
  const { checkAuth } = useAuthStore();
  const token = String(params.token || '');
  const hasStartedRef = useRef(false);
  const [task, setTask] = useState<PublicTaskResponse['data']['task'] | null>(null);
  const [signedInUser, setSignedInUser] = useState<User | null>(null);
  const [isLoadingTask, setIsLoadingTask] = useState(true);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const allowGuestSubmissions = task?.allowGuestSubmissions !== false;
  const availabilityStatus = task?.availabilityStatus || 'open';
  const isTaskOpen = availabilityStatus === 'open';
  const sharePath = getSafeSharePath(token);
  const loginHref = `/login?next=${encodeURIComponent(sharePath)}`;
  const registerHref = `/register?next=${encodeURIComponent(sharePath)}`;

  const loadTask = useCallback(async () => {
    if (!token) return;

    try {
      setIsLoadingTask(true);
      setError(null);
      const response = await api.get<PublicTaskResponse>(
        `/tasks/public/${encodeURIComponent(token)}`,
        { skipAuthRedirect: true }
      );
      setTask(response.data.task);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'This task link is unavailable.');
      setTask(null);
    } finally {
      setIsLoadingTask(false);
    }
  }, [token]);

  const checkSignedInStatus = useCallback(async () => {
    try {
      setIsCheckingAuth(true);
      await checkAuth({ forceRefresh: true });
      const latestUser = useAuthStore.getState().user;
      setSignedInUser(latestUser && !isGuestUserEmail(latestUser.email) ? latestUser : null);
    } catch {
      setSignedInUser(null);
    } finally {
      setIsCheckingAuth(false);
    }
  }, [checkAuth]);

  const startDocument = useCallback(async (mode: PublicTaskStartMode) => {
    if (!token) return;
    if (!isTaskOpen) {
      setError(
        availabilityStatus === 'scheduled'
          ? 'This task is not open for submissions yet.'
          : 'The submission deadline has passed.'
      );
      return;
    }
    if (mode === 'guest' && !allowGuestSubmissions) {
      setError('Guest submissions are not enabled for this task link.');
      return;
    }
    if (mode === 'signed-in' && !signedInUser) {
      router.replace(loginHref);
      return;
    }

    try {
      setError(null);
      setIsStarting(true);
      const sessionId = getPublicSessionId(token);
      const response = await api.post<PublicTaskStartResponse>(
        `/tasks/public/${encodeURIComponent(token)}/start`,
        { sessionId, mode },
        { skipAuthRedirect: true }
      );

      const documentId = response.data.document.id;
      const existingAccessToken = TokenManager.getAccessToken();
      if (mode === 'guest' && response.data.accessToken) {
        if (existingAccessToken && existingAccessToken !== response.data.accessToken) {
          TokenManager.setPublicDocumentPreviousAccessToken(documentId, existingAccessToken);
        }
        TokenManager.setPublicDocumentAccessToken(documentId, response.data.accessToken);
        TokenManager.setAccessToken(response.data.accessToken);
      }
      router.replace(`/documents/${documentId}`);
    } catch (err) {
      hasStartedRef.current = false;
      const apiError = err as ApiError;
      setError(apiError.message || 'This task link is unavailable.');
      setIsStarting(false);
    }
  }, [allowGuestSubmissions, availabilityStatus, isTaskOpen, loginHref, router, signedInUser, token]);

  useEffect(() => {
    void loadTask();
  }, [loadTask]);

  useEffect(() => {
    void checkSignedInStatus();
  }, [checkSignedInStatus]);

  useEffect(() => {
    if (!task || isCheckingAuth || isLoadingTask || hasStartedRef.current || !isTaskOpen) return;
    if (allowGuestSubmissions) return;

    if (!signedInUser) {
      router.replace(loginHref);
      return;
    }

    hasStartedRef.current = true;
    void startDocument('signed-in');
  }, [
    allowGuestSubmissions,
    isTaskOpen,
    isCheckingAuth,
    isLoadingTask,
    loginHref,
    router,
    signedInUser,
    startDocument,
    task,
  ]);

  const handleRetry = () => {
    hasStartedRef.current = false;
    void loadTask();
    void checkSignedInStatus();
  };

  const isInitializing = isLoadingTask || isCheckingAuth;
  const isRedirectingToAuth = task && isTaskOpen && !allowGuestSubmissions && !signedInUser && !isInitializing;
  const heading = error
    ? 'Task link unavailable'
    : isStarting || isRedirectingToAuth
      ? 'Opening Humanly document'
      : task?.name || 'Open Humanly task';

  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4 py-10 text-foreground">
      <div className="w-full max-w-lg space-y-6">
        <div className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <FileText className="h-6 w-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-normal">{heading}</h1>
          {!error && (isInitializing || isStarting || isRedirectingToAuth) && (
            <p className="mt-2 text-sm text-muted-foreground">
              {isRedirectingToAuth
                ? 'Redirecting you to sign in before writing...'
                : isStarting
                  ? 'Preparing your writing space...'
                  : 'Checking this task link...'}
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
                onClick={handleRetry}
              >
                <RefreshCw className="mr-2 h-4 w-4" />
                Try again
              </Button>
            </AlertDescription>
          </Alert>
        ) : isInitializing || isStarting || isRedirectingToAuth ? (
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : task ? (
          <div className="space-y-4 rounded-lg border border-border/70 bg-card p-5">
            <div>
              <p className="text-sm text-muted-foreground">
                {isTaskOpen
                  ? 'Choose how you want to write this submission.'
                  : availabilityStatus === 'scheduled'
                    ? 'This task is not open for submissions yet.'
                    : 'The submission deadline has passed.'}
              </p>
              {task.description ? (
                <p className="mt-2 text-sm text-foreground">{task.description}</p>
              ) : null}
            </div>

            {isTaskOpen ? (
              <div className="grid gap-3">
                {signedInUser ? (
                  <Button
                    type="button"
                    className="h-12 w-full justify-start rounded-md"
                    onClick={() => {
                      hasStartedRef.current = true;
                      void startDocument('signed-in');
                    }}
                  >
                    <UserRound className="mr-3 h-4 w-4" />
                    Continue as {getUserDisplayLabel(signedInUser)}
                  </Button>
                ) : (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Button asChild className="h-12 rounded-md">
                      <Link href={loginHref}>
                        <LogIn className="mr-2 h-4 w-4" />
                        Sign in
                      </Link>
                    </Button>
                    <Button asChild variant="outline" className="h-12 rounded-md">
                      <Link href={registerHref}>
                        <UserRound className="mr-2 h-4 w-4" />
                        Create account
                      </Link>
                    </Button>
                  </div>
                )}

                {allowGuestSubmissions ? (
                  <Button
                    type="button"
                    variant={signedInUser ? 'outline' : 'secondary'}
                    className="h-12 w-full justify-start rounded-md"
                    onClick={() => {
                      hasStartedRef.current = true;
                      void startDocument('guest');
                    }}
                  >
                    <FileText className="mr-3 h-4 w-4" />
                    Continue as guest
                  </Button>
                ) : null}
              </div>
            ) : (
              <Alert>
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>
                  {availabilityStatus === 'scheduled' ? 'Task not open yet' : 'Task ended'}
                </AlertTitle>
                <AlertDescription>
                  {availabilityStatus === 'scheduled'
                    ? 'Return after the task begins to start writing from this link.'
                    : 'This share link no longer accepts new writing sessions.'}
                </AlertDescription>
              </Alert>
            )}
          </div>
        ) : (
          <div className="flex justify-center">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        )}
      </div>
    </main>
  );
}

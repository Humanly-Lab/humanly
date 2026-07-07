'use client';

import { Suspense, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Navbar } from '@/components/navigation/navbar';
import { isGuestUserEmail } from '@/components/navigation/user-display';
import { TokenManager } from '@/lib/api-client';
import { usePublicDocumentToken } from '@/hooks/use-public-document-token';
import { isDemoDocumentId } from '@/lib/demo-workspace';

function DocumentsLoading() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
        <p className="mt-4 text-muted-foreground">Loading...</p>
      </div>
    </div>
  );
}

export default function DocumentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <Suspense fallback={<DocumentsLoading />}>
      <DocumentsLayoutInner>{children}</DocumentsLayoutInner>
    </Suspense>
  );
}

function DocumentsLayoutInner({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user, isAuthenticated, isLoading, checkAuth, clearLocalSession } = useAuthStore();
  const [hasChecked, setHasChecked] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const isWorkspacePreviewRoute = pathname === '/documents/preview';
  const documentIdMatch = pathname.match(/^\/documents\/([^/]+)/);
  const publicDocumentId = documentIdMatch?.[1] || '';
  const isDemoWorkspaceRoute =
    (pathname === '/documents/new' && searchParams.get('demo') === '1') ||
    isDemoDocumentId(publicDocumentId);
  const isPublicDocumentTokenReady = usePublicDocumentToken(publicDocumentId);
  const isPublicGuestDocumentRoute = Boolean(
    publicDocumentId && TokenManager.getPublicDocumentAccessToken(publicDocumentId)
  );
  const isGuestWorkspaceRoute =
    isAuthenticated &&
    isGuestUserEmail(user?.email) &&
    (pathname === '/documents' || pathname === '/documents/new');

  useEffect(() => {
    if (isWorkspacePreviewRoute || isDemoWorkspaceRoute) {
      return;
    }

    if (isPublicGuestDocumentRoute) {
      if (!isPublicDocumentTokenReady) {
        setIsCheckingAuth(true);
        return;
      }

      if (!hasChecked) {
        setIsCheckingAuth(true);
        checkAuth({ allowCookieRefresh: false }).finally(() => {
          setHasChecked(true);
          setIsCheckingAuth(false);
        });
        return;
      }

      setIsCheckingAuth(false);
      return;
    }

    if (!hasChecked) {
      setIsCheckingAuth(true);
      const hasSwitchSessionMarker = typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('switchSession') === '1';
      const shouldRefreshCookieSession = hasSwitchSessionMarker;

      checkAuth({ forceRefresh: shouldRefreshCookieSession }).finally(() => {
        if (hasSwitchSessionMarker) {
          router.replace(pathname);
        }
        setHasChecked(true);
        setIsCheckingAuth(false);
      });
    }
  }, [
    hasChecked,
    checkAuth,
    isPublicDocumentTokenReady,
    isPublicGuestDocumentRoute,
    isDemoWorkspaceRoute,
    isWorkspacePreviewRoute,
    pathname,
    router,
  ]);

  useEffect(() => {
    // Only redirect after we've checked auth and user is not authenticated
    if (
      !isWorkspacePreviewRoute
      && !isDemoWorkspaceRoute
      && !isPublicGuestDocumentRoute
      && hasChecked
      && !isCheckingAuth
      && !isLoading
      && !isAuthenticated
    ) {
      router.push('/login');
    }
  }, [
    isAuthenticated,
    isLoading,
    router,
    hasChecked,
    isCheckingAuth,
    isDemoWorkspaceRoute,
    isWorkspacePreviewRoute,
    isPublicGuestDocumentRoute,
  ]);

  useEffect(() => {
    if (!isWorkspacePreviewRoute && !isDemoWorkspaceRoute && hasChecked && !isCheckingAuth && !isLoading && isGuestWorkspaceRoute) {
      clearLocalSession();
      router.replace('/login');
    }
  }, [clearLocalSession, hasChecked, isCheckingAuth, isDemoWorkspaceRoute, isGuestWorkspaceRoute, isLoading, router, isWorkspacePreviewRoute]);

  if (isWorkspacePreviewRoute) {
    return <>{children}</>;
  }

  if (isDemoWorkspaceRoute) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar forceGuest />
        {children}
      </div>
    );
  }

  if ((isPublicGuestDocumentRoute && !isPublicDocumentTokenReady) || isCheckingAuth || isLoading) {
    return <DocumentsLoading />;
  }

  if ((!isAuthenticated && !isPublicGuestDocumentRoute) || isGuestWorkspaceRoute) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar forceGuest={isPublicGuestDocumentRoute} />
      {children}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Navbar } from '@/components/navigation/navbar';
import { isGuestUserEmail } from '@/components/navigation/user-display';
import { TokenManager } from '@/lib/api-client';
import { usePublicDocumentToken } from '@/hooks/use-public-document-token';

export default function DocumentsLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, isLoading, checkAuth, clearLocalSession } = useAuthStore();
  const [hasChecked, setHasChecked] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const isWorkspacePreviewRoute = pathname === '/documents/preview';
  const documentIdMatch = pathname.match(/^\/documents\/([^/]+)/);
  const publicDocumentId = documentIdMatch?.[1] || '';
  const isPublicDocumentTokenReady = usePublicDocumentToken(publicDocumentId);
  const isPublicGuestDocumentRoute = Boolean(
    publicDocumentId && TokenManager.getPublicDocumentAccessToken(publicDocumentId)
  );
  const isGuestWorkspaceRoute =
    isAuthenticated &&
    isGuestUserEmail(user?.email) &&
    (pathname === '/documents' || pathname === '/documents/new');

  useEffect(() => {
    if (isWorkspacePreviewRoute) {
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
    isWorkspacePreviewRoute,
    pathname,
    router,
  ]);

  useEffect(() => {
    // Only redirect after we've checked auth and user is not authenticated
    if (
      !isWorkspacePreviewRoute
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
    isWorkspacePreviewRoute,
    isPublicGuestDocumentRoute,
  ]);

  useEffect(() => {
    if (!isWorkspacePreviewRoute && hasChecked && !isCheckingAuth && !isLoading && isGuestWorkspaceRoute) {
      clearLocalSession();
      router.replace('/login');
    }
  }, [clearLocalSession, hasChecked, isCheckingAuth, isGuestWorkspaceRoute, isLoading, router, isWorkspacePreviewRoute]);

  if (isWorkspacePreviewRoute) {
    return <>{children}</>;
  }

  if ((isPublicGuestDocumentRoute && !isPublicDocumentTokenReady) || isCheckingAuth || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
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

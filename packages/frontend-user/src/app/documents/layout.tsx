'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Navbar } from '@/components/navigation/navbar';
import { isGuestUserEmail } from '@/components/navigation/user-display';

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
  const isGuestWorkspaceRoute =
    isAuthenticated &&
    isGuestUserEmail(user?.email) &&
    (pathname === '/documents' || pathname === '/documents/new');

  useEffect(() => {
    if (!hasChecked) {
      const shouldSwitchSession = typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('switchSession') === '1';

      checkAuth({ forceRefresh: shouldSwitchSession }).finally(() => {
        if (shouldSwitchSession) {
          router.replace(pathname);
        }
        setHasChecked(true);
        setIsCheckingAuth(false);
      });
    }
  }, [hasChecked, checkAuth, pathname, router]);

  useEffect(() => {
    // Only redirect after we've checked auth and user is not authenticated
    if (hasChecked && !isCheckingAuth && !isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router, hasChecked, isCheckingAuth]);

  useEffect(() => {
    if (hasChecked && !isCheckingAuth && !isLoading && isGuestWorkspaceRoute) {
      clearLocalSession();
      router.replace('/login');
    }
  }, [clearLocalSession, hasChecked, isCheckingAuth, isGuestWorkspaceRoute, isLoading, router]);

  if (isCheckingAuth || isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated || isGuestWorkspaceRoute) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {children}
    </div>
  );
}

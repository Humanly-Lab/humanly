'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Navbar } from '@/components/navigation/navbar';
import { TokenManager } from '@/lib/api-client';
import { isDemoCertificateId } from '@/lib/demo-workspace';

export default function CertificatesLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, checkAuth } = useAuthStore();
  const [hasChecked, setHasChecked] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const certificateIdMatch = pathname.match(/^\/certificates\/([^/]+)/);
  const publicCertificateId = certificateIdMatch?.[1] || '';
  const isDemoCertificateRoute = isDemoCertificateId(publicCertificateId);
  const isPublicGuestCertificateRoute = Boolean(
    publicCertificateId && TokenManager.getPublicCertificateAccessToken(publicCertificateId)
  );

  useEffect(() => {
    if (isDemoCertificateRoute) {
      setHasChecked(true);
      setIsCheckingAuth(false);
      return;
    }

    if (!hasChecked) {
      checkAuth().finally(() => {
        setHasChecked(true);
        setIsCheckingAuth(false);
      });
    }
  }, [hasChecked, checkAuth, isDemoCertificateRoute]);

  useEffect(() => {
    if (!isDemoCertificateRoute && hasChecked && !isCheckingAuth && !isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isAuthenticated, isLoading, router, hasChecked, isCheckingAuth, isDemoCertificateRoute]);

  if (isDemoCertificateRoute) {
    return (
      <div className="min-h-screen bg-background">
        <Navbar forceGuest guestLogoHref="/" />
        <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
          {children}
        </main>
      </div>
    );
  }

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

  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar forceGuest={isPublicGuestCertificateRoute} />
      <main className="mx-auto max-w-7xl px-4 py-4 sm:px-6 lg:px-8">
        {children}
      </main>
    </div>
  );
}

'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

interface AuthenticatedRedirectProps {
  to?: string;
}

export function AuthenticatedRedirect({ to = '/documents' }: AuthenticatedRedirectProps) {
  const router = useRouter();
  const authState = useAuthStore();
  const { checkAuth } = authState;
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    checkAuth({ allowCookieRefresh: false }).finally(() => {
      const latestAuthState = useAuthStore.getState?.() ?? authState;
      if (latestAuthState.isAuthenticated || authState.isAuthenticated) {
        router.replace(to);
      }
    });
  }, [authState, checkAuth, router, to]);

  return null;
}

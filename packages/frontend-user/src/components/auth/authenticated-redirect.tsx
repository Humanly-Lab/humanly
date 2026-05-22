'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';

interface AuthenticatedRedirectProps {
  to?: string;
}

export function AuthenticatedRedirect({ to = '/documents' }: AuthenticatedRedirectProps) {
  const router = useRouter();
  const { checkAuth, isAuthenticated } = useAuthStore();
  const [hasChecked, setHasChecked] = useState(false);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    let cancelled = false;

    checkAuth().finally(() => {
      if (!cancelled) {
        setHasChecked(true);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [checkAuth]);

  useEffect(() => {
    if (hasChecked && isAuthenticated) {
      router.replace(to);
    }
  }, [hasChecked, isAuthenticated, router, to]);

  return null;
}

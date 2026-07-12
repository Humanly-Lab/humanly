'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ClipboardList } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Navbar } from '@/components/navigation/navbar';

export default function TasksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const { isAuthenticated, isLoading, fetchUser } = useAuthStore();
  const [isValidating, setIsValidating] = useState(true);
  // The dashboard index gets the sidebar app shell (mirroring the writer
  // portal); detail/form pages keep the centered container.
  const isDashboardRoute = pathname === '/tasks';

  useEffect(() => {
    // Always validate session on mount
    const validateSession = async () => {
      const shouldSwitchSession = typeof window !== 'undefined'
        && new URLSearchParams(window.location.search).get('switchSession') === '1';

      try {
        await fetchUser({ forceRefresh: shouldSwitchSession });
        if (shouldSwitchSession) {
          router.replace('/tasks');
        }
      } catch (error) {
        router.push('/login');
      } finally {
        setIsValidating(false);
      }
    };

    validateSession();
  }, [fetchUser, router]);

  // Show loading state while checking authentication
  if (isLoading || isValidating) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  // Don't render children until authenticated
  if (!isAuthenticated) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      {isDashboardRoute ? (
        <div className="flex min-h-[calc(100vh-73px)] w-full">
          <aside className="hidden w-[236px] shrink-0 border-r border-border/55 px-4 py-7 lg:block xl:w-[252px]">
            <nav className="sticky top-24 flex flex-col gap-1">
              <Link
                href="/tasks"
                className="flex h-11 items-center gap-3 rounded-md bg-secondary px-3 text-sm font-medium"
              >
                <ClipboardList className="h-4 w-4" />
                <span>Tasks</span>
              </Link>
            </nav>
          </aside>
          <main className="min-w-0 flex-1 px-5 py-7 sm:px-8 lg:px-10">
            <div className="mx-auto w-full max-w-7xl">{children}</div>
          </main>
        </div>
      ) : (
        <main className="humanly-dashboard-page">{children}</main>
      )}
    </div>
  );
}

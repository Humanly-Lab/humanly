'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { BRAND } from '@humanly/shared';
import { Loader2 } from 'lucide-react';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center justify-center gap-3 hover:opacity-80 transition-opacity">
            <img src="/humanly.svg" alt="" className="h-9 w-9" />
            <h1 className="text-3xl font-semibold">
              {BRAND.name}
            </h1>
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            {BRAND.taglineUser}
          </p>
        </div>
        <Suspense fallback={
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin" />
          </div>
        }>
          {children}
        </Suspense>
      </div>
    </div>
  );
}

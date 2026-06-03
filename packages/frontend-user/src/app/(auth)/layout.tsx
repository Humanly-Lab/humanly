'use client';

import { Suspense } from 'react';
import Link from 'next/link';
import { Loader2 } from 'lucide-react';
import { HumanlyWordmark } from '@/components/brand/humanly-wordmark';
import { marketingHref } from '@/lib/app-origin';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-background px-4 py-8 text-foreground">
      <div className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-md flex-col justify-center">
        <div className="mb-8 text-center">
          <Link
            href={marketingHref('/')}
            className="inline-flex items-center justify-center transition-opacity hover:opacity-80"
          >
            <HumanlyWordmark size="lg" />
          </Link>
          <p className="mx-auto mt-5 max-w-sm text-sm leading-7 text-muted-foreground">
            Write with AI. Prove your process.
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

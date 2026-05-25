import Link from 'next/link';
import { BRAND } from '@humanly/shared';
import { HumanlyWordmark } from '@/components/brand/humanly-wordmark';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-7">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center justify-center gap-3 transition-opacity hover:opacity-80">
            <HumanlyWordmark admin size="lg" />
          </Link>
          <p className="mt-3 text-sm text-muted-foreground">
            {BRAND.taglineAdmin}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

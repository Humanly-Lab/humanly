import Link from 'next/link';
import { BRAND } from '@humanly/shared';

export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <Link href="/" className="inline-flex items-center justify-center gap-3 transition-opacity hover:opacity-80">
            <img src="/humanly.svg" alt="" className="h-9 w-9" />
            <h1 className="text-3xl font-semibold">
              {BRAND.name} Admin
            </h1>
          </Link>
          <p className="mt-2 text-sm text-muted-foreground">
            {BRAND.taglineAdmin}
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

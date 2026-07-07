import Link from 'next/link';
import { HumanlyWordmark } from '@/components/brand/humanly-wordmark';

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
            href="/"
            className="inline-flex items-center justify-center gap-3 transition-opacity hover:opacity-80"
          >
            <HumanlyWordmark admin size="lg" />
          </Link>
          <p className="mx-auto mt-5 max-w-sm text-sm leading-7 text-muted-foreground">
            A verifiable workspace for human writing.
          </p>
        </div>
        {children}
      </div>
    </div>
  );
}

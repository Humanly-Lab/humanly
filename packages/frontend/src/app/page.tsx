import Link from 'next/link';
import { HumanlyWordmark } from '@/components/brand/humanly-wordmark';

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-16">
      <div className="absolute top-6 left-8">
        <Link href="/" className="flex items-center rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <HumanlyWordmark admin size="md" />
        </Link>
      </div>
      <div className="z-10 max-w-5xl w-full items-center justify-between text-sm">
        <div className="text-center">
          <div className="humanly-eyebrow mb-5 inline-flex rounded-full border border-border/80 bg-muted/40 px-3 py-1">
            Publisher Portal
          </div>
          <h1 className="mx-auto max-w-4xl text-4xl font-semibold tracking-[-0.035em] sm:text-5xl lg:text-6xl">
            Manage writing tasks, submissions, and AI usage.
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
            Create invite-code tasks, upload instructions, configure model access, and monitor student writing activity from one publisher workspace.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-transform hover:-translate-y-0.5"
            >
              Publisher Login
            </Link>
            <Link
              href="/tasks/new"
              className="inline-flex items-center justify-center rounded-md border border-border bg-transparent px-6 py-3 text-sm font-medium text-foreground transition-colors hover:bg-white/60"
            >
              Create Task
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

import Link from 'next/link';
import { BRAND } from '@humanly/shared';

export default function HomePage() {
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center px-6 py-20">
      <div className="absolute top-6 left-8">
        <Link href="/" className="flex items-center gap-2 text-xl font-bold">
          <img src="/humanly.svg" alt={BRAND.name} className="h-8 w-8" />
          {BRAND.name} Admin
        </Link>
      </div>
      <div className="z-10 max-w-5xl w-full items-center justify-between text-sm">
        <div className="text-center">
          <div className="mb-4 inline-flex rounded-full border px-3 py-1 text-sm text-muted-foreground">
            Admin Portal
          </div>
          <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
            Manage writing tasks, submissions, and AI usage.
          </h1>
          <p className="mx-auto mt-5 max-w-2xl text-lg text-muted-foreground">
            Create invite-code tasks, upload instructions, configure model access, and monitor student writing activity from one admin workspace.
          </p>
          <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:justify-center">
            <Link
              href="/login"
              className="rounded-md bg-primary px-6 py-3 text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Admin Login
            </Link>
            <Link
              href="/tasks/new"
              className="rounded-md bg-secondary px-6 py-3 text-secondary-foreground transition-colors hover:bg-secondary/90"
            >
              Create Task
            </Link>
          </div>
        </div>
      </div>
    </main>
  );
}

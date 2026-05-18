import Link from 'next/link';
import { BRAND } from '@humanly/shared';

export default function HomePage() {
  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="mx-auto flex w-full max-w-6xl items-center justify-between px-6 py-6 sm:px-8">
        <Link href="/" className="flex items-center gap-3 text-lg font-semibold">
          <img src="/humanly.svg" alt="" className="h-8 w-8" />
          <span>{BRAND.name}</span>
        </Link>
        <nav className="flex items-center gap-2 text-sm">
          <Link
            href="/login"
            className="px-4 py-2 text-muted-foreground transition-colors hover:text-foreground"
          >
            Login
          </Link>
          <Link
            href="/register"
            className="rounded-lg bg-primary px-4 py-2 font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Get started
          </Link>
        </nav>
      </header>

      <section className="mx-auto flex min-h-[calc(100vh-5.5rem)] max-w-3xl flex-col items-center justify-center px-6 pb-24 pt-12 text-center sm:px-8">
        <h1 className="text-6xl font-semibold leading-none sm:text-7xl">
          {BRAND.name}
        </h1>
        <p className="mt-6 text-2xl font-medium leading-tight sm:text-3xl">
          {BRAND.taglineUser}
        </p>
        <p className="mx-auto mt-5 max-w-2xl text-base leading-7 text-muted-foreground sm:text-lg">
          Humanly lets writers collaborate with AI in a tracked workspace and generate verifiable authorship certificates.
        </p>
        <div className="mt-9 flex w-full max-w-sm flex-col justify-center gap-3 sm:w-auto sm:max-w-none sm:flex-row">
          <Link
            href="/register"
            className="rounded-lg bg-primary px-6 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Start writing
          </Link>
          <Link
            href="/login"
            className="rounded-lg border border-border px-6 py-3 text-sm font-medium transition-colors hover:bg-muted"
          >
            Sign in
          </Link>
        </div>
        <div className="mt-10 grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
          <span>Human-AI collaboration</span>
          <span>Tracked writing process</span>
          <span>Verifiable certificates</span>
        </div>
      </section>
    </main>
  );
}

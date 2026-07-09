'use client';

// Animated visual for the statement section: an AI detector scanning finished
// text and flip-flopping on its verdict, versus Humanly's steady live record.
import { useEffect, useState } from 'react';

const GUESSES = [
  { label: 'AI likelihood: 68%', tone: 'amber' },
  { label: 'Human likelihood: 41%', tone: 'amber' },
  { label: 'AI likelihood: 87%', tone: 'red' },
  { label: 'Inconclusive…', tone: 'neutral' },
] as const;

const EVENTS: Array<[string, string, string, string, string]> = [
  ['12:41:48', 'input', '+64', 'var(--hly-green-tint)', 'var(--hly-green-strong)'],
  ['12:42:03', 'paste', '+186', 'var(--hly-paste-bg)', 'var(--hly-paste-text)'],
  ['12:42:08', 'ai chat', '1', 'var(--hly-ai-bg)', 'var(--hly-ai-text)'],
  ['12:42:14', 'input', '+42', 'var(--hly-green-tint)', 'var(--hly-green-strong)'],
];

const TONE: Record<string, string> = {
  amber: 'border-[var(--hly-amber-border)] bg-[var(--hly-amber-bg)] text-[var(--hly-amber-text)]',
  red: 'border-[var(--hly-red-border)] bg-[var(--hly-red-bg)] text-[var(--hly-red-text)]',
  neutral: 'border-border bg-muted text-muted-foreground',
};

// finished-text skeleton lines (shared by both panels)
const LINES = [100, 92, 97, 74, 0, 96, 88, 60];

export function StatementVisual() {
  const [guess, setGuess] = useState(0);
  const [eventStep, setEventStep] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setEventStep(EVENTS.length);
      return;
    }
    const a = setInterval(() => setGuess((v) => (v + 1) % GUESSES.length), 1200);
    const b = setInterval(() => setEventStep((v) => (v + 1) % (EVENTS.length + 3)), 950);
    return () => {
      clearInterval(a);
      clearInterval(b);
    };
  }, []);

  const g = GUESSES[guess];
  const eventCount = Math.min(eventStep, EVENTS.length);
  const logComplete = eventCount >= EVENTS.length;

  return (
    <div className="mt-8 grid max-w-[760px] items-stretch gap-3 text-left sm:mt-12 sm:grid-cols-2 sm:gap-4">
      {/* a detector, guessing after the fact */}
      <div className="flex flex-col rounded-[12px] border border-[var(--hly-hairline)] bg-white p-3 shadow-[0_20px_50px_-30px_rgba(35,32,25,0.3)] sm:p-4">
        <div className="flex items-center justify-between gap-3 text-[10.5px] sm:text-[11px]">
          <span className="font-medium text-muted-foreground">AI detector</span>
          <span className="truncate text-[9.5px] text-[var(--hly-neutral)]">sees only the pure text</span>
        </div>
        <div className="relative mt-3 h-[148px] overflow-hidden rounded-md border border-border/60 p-3 sm:h-[190px]">
          {LINES.map((w, i) => (
            <div
              key={i}
              className="mb-1.5 h-1.5 rounded-full bg-[rgba(35,32,25,0.12)] last:mb-0 sm:mb-2"
              style={{ width: `${w}%` }}
            />
          ))}
          {/* scanning beam */}
          <div className="humanly-scanline absolute inset-x-0 h-5 bg-gradient-to-b from-transparent via-[rgba(176,141,132,0.22)] to-transparent" />
        </div>
        <div
          className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-medium transition-colors duration-300 sm:text-[10.5px] ${TONE[g.tone]}`}
        >
          <span className="humanly-pulse">?</span> {g.label}
        </div>
      </div>

      {/* Humanly, recording as it happens */}
      <div className="flex flex-col rounded-[12px] border border-[var(--hly-green-border)] bg-white p-3 shadow-[0_20px_50px_-30px_rgba(35,32,25,0.3)] sm:p-4">
        <div className="flex items-center justify-between gap-3 text-[10.5px] sm:text-[11px]">
          <span className="font-medium">Humanly</span>
          <span className="inline-flex min-w-0 items-center gap-1 text-[9.5px] text-[var(--hly-green-text)]">
            <span className="humanly-pulse h-1.5 w-1.5 rounded-full bg-current" />
            <span className="truncate">records the process</span>
          </span>
        </div>
        <div className="mt-3 h-[148px] rounded-md border border-border/60 p-3 sm:h-[190px]">
          {EVENTS.slice(0, eventCount).map(([t, kind, n, bg, fg]) => (
            <div
              key={`${t}-${kind}`}
              className="grid grid-cols-[50px_1fr_auto] items-center gap-1.5 border-t border-dashed border-[var(--hly-hairline)] py-[4px] text-[9.5px] first:border-t-0 sm:grid-cols-[52px_1fr_auto] sm:py-[5px] sm:text-[10px]"
            >
              <span className="tabular-nums text-muted-foreground">{t}</span>
              <span
                className="w-fit rounded-[4px] px-1.5 py-px text-[9px] font-medium"
                style={{ backgroundColor: bg, color: fg }}
              >
                {kind}
              </span>
              <span className="tabular-nums text-muted-foreground">{n}</span>
            </div>
          ))}
        </div>
        <div
          className={`mt-3 inline-flex w-full items-center justify-center gap-1.5 rounded-md border px-2.5 py-1 text-[10px] font-medium transition-colors duration-300 sm:text-[10.5px] ${
            logComplete
              ? 'border-[var(--hly-green-border)] bg-[var(--hly-green-bg)] text-[var(--hly-green-text)]'
              : 'border-border bg-background text-muted-foreground'
          }`}
        >
          {logComplete ? '93% human, 7% AI' : 'Recording process...'}
        </div>
      </div>
    </div>
  );
}

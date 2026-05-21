'use client';

import React from 'react';
import { diffWords } from 'diff';
import { cn } from '@/lib/utils';

interface QuickActionDiffProps {
  before: string;
  after: string;
  className?: string;
}

/**
 * Word-level inline diff for selection-menu quick-action reviews.
 *
 * Renders `before` and `after` as a single span: unchanged words stay
 * neutral, deletions are red strike-through, additions are green
 * underlined. Word-level is the right default for short selections —
 * character-level is too noisy (every letter difference re-flows),
 * sentence-level is too coarse (loses individual edits).
 *
 * `diffWords` ships in the `diff` npm package (~20KB) and is synchronous.
 */
export function QuickActionDiff({ before, after, className }: QuickActionDiffProps) {
  if (!after) {
    return <span className="text-muted-foreground">Waiting for AI response...</span>;
  }

  const parts = diffWords(before, after);

  return (
    <span className={cn('whitespace-pre-wrap', className)}>
      {parts.map((part, idx) => {
        if (part.added) {
          return (
            <span
              key={idx}
              className="rounded-sm bg-[#eef3ed] px-0.5 text-[#58715f] underline decoration-[#9daf9d] decoration-1 underline-offset-2"
            >
              {part.value}
            </span>
          );
        }
        if (part.removed) {
          return (
            <span
              key={idx}
              className="rounded-sm bg-red-100 px-0.5 text-red-900 line-through decoration-red-400"
            >
              {part.value}
            </span>
          );
        }
        return <span key={idx}>{part.value}</span>;
      })}
    </span>
  );
}

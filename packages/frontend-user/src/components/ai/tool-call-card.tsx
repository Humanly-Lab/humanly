'use client';

import { useState } from 'react';
import { CheckCircle2, ChevronRight, Loader2, XCircle } from 'lucide-react';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import type { ToolCallEntry } from '@/stores/ai-store';

export interface ToolCallCardProps {
  entry: ToolCallEntry;
}

export interface ToolCallTimelineProps {
  entries?: ToolCallEntry[];
}

export interface ReasoningBlockProps {
  thinking?: string;
}

function tryPrettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export function ReasoningBlock({ thinking }: ReasoningBlockProps): JSX.Element | null {
  const [open, setOpen] = useState(false);
  const trimmed = thinking?.trim();
  if (!trimmed) return null;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div className="mb-1.5 rounded-md border bg-background/60 px-2.5 py-1.5 text-xs shadow-sm">
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-2 text-left"
            aria-label="Reasoning"
          >
            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-90'
              )}
              aria-hidden="true"
            />
            <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium">
              Reasoning
            </span>
            <span className="shrink-0 tabular-nums text-muted-foreground">
              {trimmed.length} chars
            </span>
          </button>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <pre className="mt-1.5 max-h-64 max-w-full overflow-auto whitespace-pre-wrap rounded bg-muted/70 px-2 py-1.5 text-[11px] leading-relaxed">
            <code>{trimmed}</code>
          </pre>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function ToolCallCard({ entry }: ToolCallCardProps): JSX.Element {
  const [open, setOpen] = useState(false);
  const isError = entry.status === 'done' && entry.isError;
  const hasResult = typeof entry.result === 'string' && entry.result.length > 0;

  return (
    <Collapsible open={open} onOpenChange={setOpen}>
      <div
        className={cn(
          'rounded-md border bg-background/60 px-2.5 py-1.5 text-xs shadow-sm',
          isError && 'border-red-300 bg-red-50/70 dark:bg-red-950/20'
        )}
      >
        <CollapsibleTrigger asChild>
          <button
            type="button"
            className="flex w-full min-w-0 items-center gap-2 text-left"
            aria-label={`${entry.toolName} tool call`}
          >
            {entry.status === 'pending' && (
              <Loader2
                className="h-3.5 w-3.5 shrink-0 animate-spin text-muted-foreground"
                data-testid="tool-call-spinner"
              />
            )}
            {entry.status === 'done' && !entry.isError && (
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0 text-[#58715f]" />
            )}
            {isError && (
              <XCircle className="h-3.5 w-3.5 shrink-0 text-red-600" />
            )}

            <span className="min-w-0 flex-1 truncate font-mono text-[11px] font-medium">
              {entry.toolName}
            </span>

            {typeof entry.durationMs === 'number' && (
              <span className="shrink-0 tabular-nums text-muted-foreground">
                {entry.durationMs}ms
              </span>
            )}

            <ChevronRight
              className={cn(
                'h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform',
                open && 'rotate-90'
              )}
              aria-hidden="true"
            />
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="mt-1.5 space-y-1.5">
            <pre className="max-w-full overflow-x-auto rounded bg-muted/70 px-2 py-1.5 text-[11px] leading-relaxed">
              <code>{JSON.stringify(entry.args, null, 2)}</code>
            </pre>
            {hasResult && (
              <pre
                className={cn(
                  'max-h-64 max-w-full overflow-auto rounded bg-muted/70 px-2 py-1.5 text-[11px] leading-relaxed',
                  isError && 'bg-red-100/80 text-red-950 dark:bg-red-950/40 dark:text-red-100'
                )}
              >
                <code>{tryPrettyJson(entry.result!)}</code>
              </pre>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

export function ToolCallTimeline({ entries }: ToolCallTimelineProps): JSX.Element | null {
  if (!entries || entries.length === 0) return null;

  return (
    <div className="mb-2 space-y-1">
      {entries.map((entry) => (
        <ToolCallCard key={entry.toolCallId} entry={entry} />
      ))}
    </div>
  );
}

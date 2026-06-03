'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  CornerDownLeft,
  Copy,
  FileText,
  Keyboard,
  Loader2,
  RefreshCcw,
  RefreshCw,
  Sparkles,
  TrendingUp,
  Trash2,
  Type,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import api, { ApiError } from '@/lib/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils';
import type {
  AIInteractionLog,
  DocumentEventTimelineItem,
  DocumentEventTimelineRawEvent,
} from '@humanly/shared';

interface Submission {
  id: string;
  userEmail?: string | null;
  documentId: string;
  documentTitle?: string | null;
  certificateVerificationToken?: string | null;
  submittedAt: string;
  status: 'active' | 'historical';
}

interface DocumentEvent {
  id: string;
  eventType: string;
  timestamp: string;
  keyCode?: string | null;
  keyChar?: string | null;
  textBefore?: string | null;
  textAfter?: string | null;
  cursorPosition?: number | null;
  metadata?: Record<string, unknown> | null;
}

const EVENT_GROUPS = [
  { label: 'Typing', eventTypes: ['keydown', 'keyup', 'input'] },
  { label: 'Paste', eventTypes: ['paste'] },
  { label: 'Copy', eventTypes: ['copy', 'cut'] },
  { label: 'Focus', eventTypes: ['focus', 'blur'] },
] as const;

const WRITING_TIMELINE_KINDS = new Set<DocumentEventTimelineItem['kind']>([
  'typing_burst',
  'line_break',
  'ai_insert',
  'replace',
  'paste',
  'delete',
]);

const FOLD_POINT_MIN_RAW_EVENT_COUNT = 4;
const LONG_TEXT_PREVIEW_THRESHOLD = 110;
const LINE_BREAK_COLLAPSE_THRESHOLD = 4;

const TIMELINE_COLORS: Partial<Record<DocumentEventTimelineItem['kind'], string>> = {
  typing_burst: 'bg-teal-100 text-teal-800',
  line_break: 'bg-sky-100 text-sky-800',
  ai_insert: 'bg-violet-100 text-violet-800',
  replace: 'bg-indigo-100 text-indigo-800',
  paste: 'bg-yellow-100 text-yellow-800',
  delete: 'bg-red-100 text-red-800',
};

const TIMELINE_ICONS: Partial<Record<DocumentEventTimelineItem['kind'], JSX.Element>> = {
  typing_burst: <Type className="h-3 w-3" />,
  line_break: <CornerDownLeft className="h-3 w-3" />,
  ai_insert: <Sparkles className="h-3 w-3" />,
  replace: <RefreshCw className="h-3 w-3" />,
  paste: <Copy className="h-3 w-3" />,
  delete: <Trash2 className="h-3 w-3" />,
};

const AI_ACTION_LABELS: Record<string, string> = {
  grammar_check: 'Fix grammar',
  spelling_check: 'Fix spelling',
  rewrite: 'Rewrite',
  summarize: 'Summarize',
  expand: 'Expand',
  translate: 'Translate',
  format: 'Format',
  question: 'Question',
  reference: 'Reference',
  other: 'Chat',
};

type HistoryItem =
  | {
      kind: 'timeline';
      id: string;
      timestamp: string | Date;
      item: DocumentEventTimelineItem;
    }
  | {
      kind: 'ai';
      id: string;
      timestamp: string | Date;
      log: AIInteractionLog;
    };

type FoldPointItem = {
  kind: 'fold';
  id: string;
  timestamp: string | Date;
  startTimestamp: string | Date;
  endTimestamp: string | Date;
  items: DocumentEventTimelineItem[];
  rawEvents: DocumentEventTimelineRawEvent[];
  rawEventCount: number;
};

type RawEventDisplayItem = {
  kind: 'raw';
  id: string;
  timestamp: string | Date;
  event: DocumentEventTimelineRawEvent;
};

type TimelineDisplayItem = HistoryItem | FoldPointItem | RawEventDisplayItem;

const formatDuration = (secondsValue: number) => {
  const seconds = Math.max(0, Math.floor(secondsValue || 0));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};

const formatPercent = (value: number) => `${Math.round(value)}%`;

const eventTime = (event: DocumentEvent) => new Date(event.timestamp).getTime();

const calculateTextDeltaMetrics = (events: DocumentEvent[]) => {
  let typedCharacters = 0;
  let pastedCharacters = 0;

  for (const event of events) {
    const beforeLength = event.textBefore?.length || 0;
    const afterLength = event.textAfter?.length || 0;
    const difference = afterLength - beforeLength;

    if (difference <= 0) continue;

    if (event.eventType === 'paste') {
      pastedCharacters += difference;
    } else if (event.eventType === 'keydown' || event.eventType === 'keyup' || event.eventType === 'input') {
      typedCharacters += difference;
    }
  }

  return { typedCharacters, pastedCharacters };
};

const buildActivityTimeline = (events: DocumentEvent[]) => {
  const buckets = events.reduce<Record<string, number>>((groups, event) => {
    const date = new Date(event.timestamp);
    const label = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    groups[label] = (groups[label] || 0) + 1;
    return groups;
  }, {});

  return Object.entries(buckets).map(([time, eventCount]) => ({ time, eventCount }));
};

const formatTimelineTime = (value: string | Date) => (
  new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(new Date(value))
);

const formatRawEventTime = (value: string | Date) => (
  new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
    hour12: false,
  }).format(new Date(value))
);

function getSelectionText(log: AIInteractionLog) {
  return log.modifications?.[0]?.before || log.contextSnapshot?.selection?.text || '';
}

function getSuggestedText(log: AIInteractionLog) {
  return log.modifications?.[0]?.after || log.response || '';
}

function normalizeVisibleText(text?: string) {
  if (!text) return '';
  return text.replace(/\r\n/g, '\n').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatSnippet(text?: string, fallback = 'No text detail', maxLength = 160) {
  if (!text) return fallback;
  const singleLine = normalizeVisibleText(text);
  if (!singleLine) return fallback;
  return singleLine.length > maxLength ? `${singleLine.slice(0, maxLength)}...` : singleLine;
}

function normalizeForComparison(text?: string) {
  return normalizeVisibleText(text);
}

function isAIAppliedMirrorReplace(
  item: DocumentEventTimelineItem,
  aiLogs: AIInteractionLog[]
) {
  if (item.kind !== 'replace') return false;

  const replacedText = normalizeForComparison(getReplacedText(item));
  const newText = normalizeForComparison(item.text);
  if (!replacedText || !newText) return false;

  return aiLogs.some((log) => {
    if (!log.modificationsApplied) return false;

    return (
      normalizeForComparison(getSelectionText(log)) === replacedText &&
      normalizeForComparison(getSuggestedText(log)) === newText
    );
  });
}

function getAILogLabel(log: AIInteractionLog) {
  if (log.queryType === 'grammar_check') return 'Fix grammar';
  if (log.queryType === 'other') return 'Chat';
  if (log.query.toLowerCase().includes('simplify')) return 'Simplify';
  if (log.query.toLowerCase().includes('formal')) return 'Make formal';
  if (log.query.toLowerCase().includes('improve')) return 'Improve writing';
  return AI_ACTION_LABELS[log.queryType] || log.queryType;
}

function getAIStatusLabel(log: AIInteractionLog) {
  if (log.modificationsApplied) return 'Applied';
  if (log.status === 'cancelled') return 'Discarded';
  return log.status;
}

function canExpandAILog(log: AIInteractionLog) {
  return getAIStatusLabel(log) !== 'Discarded';
}

function formatTimeRange(item: DocumentEventTimelineItem) {
  const startText = formatTimelineTime(item.startTimestamp);
  const endText = formatTimelineTime(item.endTimestamp);
  return startText === endText ? startText : `${startText} - ${endText}`;
}

type TextPreviewPart =
  | {
      kind: 'text';
      text: string;
    }
  | {
      kind: 'lineBreak';
      count: number;
    };

function getTextPreviewParts(text?: string, maxTextCharacters = 160) {
  if (!text) {
    return { parts: [] as TextPreviewPart[], truncated: false };
  }

  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const parts: TextPreviewPart[] = [];
  let index = 0;
  let remainingTextCharacters = maxTextCharacters;
  let truncated = false;

  while (index < normalized.length) {
    if (normalized[index] === '\n') {
      let count = 0;
      while (normalized[index] === '\n') {
        count += 1;
        index += 1;
      }
      parts.push({ kind: 'lineBreak', count });
      continue;
    }

    let nextLineBreakIndex = normalized.indexOf('\n', index);
    if (nextLineBreakIndex === -1) {
      nextLineBreakIndex = normalized.length;
    }

    const segment = normalized.slice(index, nextLineBreakIndex).replace(/\s+/g, ' ').trim();
    if (segment) {
      if (remainingTextCharacters <= 0) {
        truncated = true;
        break;
      }

      if (segment.length > remainingTextCharacters) {
        parts.push({
          kind: 'text',
          text: `${segment.slice(0, remainingTextCharacters)}...`,
        });
        truncated = true;
        break;
      }

      parts.push({ kind: 'text', text: segment });
      remainingTextCharacters -= segment.length;
    }

    index = nextLineBreakIndex;
  }

  return { parts, truncated };
}

function expandTextPreviewParts(parts: TextPreviewPart[]) {
  return parts.flatMap((part): TextPreviewPart[] => {
    if (part.kind !== 'lineBreak' || part.count < LINE_BREAK_COLLAPSE_THRESHOLD) {
      if (part.kind === 'lineBreak') {
        return Array.from({ length: part.count }, () => ({ kind: 'lineBreak', count: 1 }));
      }
      return [part];
    }

    return [part];
  });
}

function LineBreakToken({ count }: { count: number }) {
  return (
    <span className="inline-flex shrink-0 items-center rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
      Line break{count >= LINE_BREAK_COLLAPSE_THRESHOLD ? ` x ${count}` : ''}
    </span>
  );
}

function renderTextPreview(text?: string, fallback = 'No text detail', maxTextCharacters = 160): ReactNode {
  if (!text) return fallback;
  if (!/[\r\n]/.test(text)) {
    return `"${formatSnippet(text, fallback, maxTextCharacters)}"`;
  }

  const { parts } = getTextPreviewParts(text, maxTextCharacters);
  const displayParts = expandTextPreviewParts(parts);

  if (displayParts.length === 0) return fallback;

  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-1 overflow-hidden align-middle">
      {displayParts.map((part, index) => (
        <Fragment key={`${part.kind}-${index}`}>
          {index > 0 && <span className="shrink-0 text-muted-foreground/70">+</span>}
          {part.kind === 'lineBreak' ? (
            <LineBreakToken count={part.count} />
          ) : (
            <span className="min-w-0 truncate">&quot;{part.text}&quot;</span>
          )}
        </Fragment>
      ))}
    </span>
  );
}

function getReplacedText(item: DocumentEventTimelineItem) {
  const replacedText = item.metadata?.replacedText;
  return typeof replacedText === 'string' ? replacedText : '';
}

function isMultilineText(text?: string) {
  return Boolean(text && /[\r\n]/.test(text));
}

function renderReplacePreview(item: DocumentEventTimelineItem, maxTextCharacters = 80) {
  return (
    <span className="inline-flex min-w-0 max-w-full items-center gap-2 overflow-hidden align-middle">
      <span className="min-w-0 truncate">
        {renderTextPreview(getReplacedText(item), 'Previous text', maxTextCharacters)}
      </span>
      <span className="shrink-0 text-muted-foreground">-&gt;</span>
      <span className="min-w-0 truncate">
        {renderTextPreview(item.text, 'New text', maxTextCharacters)}
      </span>
    </span>
  );
}

function getTimelineLineBreakCount(item: DocumentEventTimelineItem) {
  const metadataCount = item.metadata?.lineBreakCount;
  return typeof metadataCount === 'number' && metadataCount > 0
    ? metadataCount
    : item.charCount || 1;
}

function renderTimelineDetail(item: DocumentEventTimelineItem) {
  if (item.kind === 'typing_burst') {
    return renderTextPreview(item.text, '');
  }

  if (item.kind === 'line_break') {
    const lineBreakCount = getTimelineLineBreakCount(item);
    return lineBreakCount > 1 ? 'Inserted blank line' : 'Inserted line break';
  }

  if (item.kind === 'replace') {
    return renderReplacePreview(item);
  }

  if (item.kind === 'ai_insert') {
    return renderTextPreview(item.text, 'AI inserted text');
  }

  if (item.kind === 'paste') {
    return renderTextPreview(item.text, '');
  }

  if (item.kind === 'delete') {
    if (item.metadata?.deleteScope === 'all_text') return 'Deleted all text';
    return item.text ? renderTextPreview(item.text, '') : 'Text deleted';
  }

  return formatSnippet(item.text, item.label);
}

function getTimelineActivityLabel(item: DocumentEventTimelineItem) {
  if (item.kind === 'typing_burst') return 'Typed';
  if (item.kind === 'line_break') {
    return getTimelineLineBreakCount(item) > 1 ? 'Blank line' : 'Line break';
  }
  if (item.kind === 'ai_insert') return 'AI inserted';
  if (item.kind === 'replace') return 'Replaced';
  if (item.kind === 'paste') return 'Pasted';
  if (item.kind === 'delete') {
    if (item.metadata?.deleteScope === 'all_text') return 'Deleted all';
    if (item.metadata?.deleteScope === 'selection') return 'Deleted selection';
    return 'Deleted';
  }
  return item.label;
}

function getTimelineCount(item: DocumentEventTimelineItem) {
  if (item.kind === 'line_break') {
    const lineBreakCount = getTimelineLineBreakCount(item);
    return `${lineBreakCount} line break${lineBreakCount === 1 ? '' : 's'}`;
  }

  if (item.kind === 'replace') {
    const replacedCharCount = getReplacedText(item).length;
    const insertedCharCount = item.text?.length || 0;
    return `${replacedCharCount} -> ${insertedCharCount} chars`;
  }

  const parts: string[] = [];

  if (item.wordCount !== undefined) {
    parts.push(`${item.wordCount} word${item.wordCount === 1 ? '' : 's'}`);
  }

  if (item.charCount !== undefined) {
    parts.push(`${item.charCount} char${item.charCount === 1 ? '' : 's'}`);
  }

  return parts.join(' · ') || '-';
}

function canExpandTimelineText(item: DocumentEventTimelineItem) {
  if (item.kind === 'replace') {
    return (
      isMultilineText(getReplacedText(item)) ||
      isMultilineText(item.text) ||
      normalizeVisibleText(getReplacedText(item)).length > LONG_TEXT_PREVIEW_THRESHOLD ||
      normalizeVisibleText(item.text).length > LONG_TEXT_PREVIEW_THRESHOLD
    );
  }

  if (item.kind !== 'paste' && item.kind !== 'delete' && item.kind !== 'ai_insert') return false;
  return normalizeVisibleText(item.text).length > LONG_TEXT_PREVIEW_THRESHOLD;
}

function getTimelineTextPreview(item: DocumentEventTimelineItem) {
  if (item.kind === 'replace') {
    if (isMultilineText(getReplacedText(item)) || isMultilineText(item.text)) {
      return getMultilineReplaceSummary(item);
    }
    return renderReplacePreview(item, LONG_TEXT_PREVIEW_THRESHOLD);
  }
  if (item.kind === 'delete' && !item.text) return 'Text deleted';
  if (item.kind === 'delete' && item.metadata?.deleteScope === 'all_text') return 'Deleted all text';
  return renderTextPreview(item.text, '', LONG_TEXT_PREVIEW_THRESHOLD);
}

function getFullTextHeader(item: DocumentEventTimelineItem) {
  if (item.kind === 'replace') return 'Replacement';
  if (item.kind === 'ai_insert') return 'AI inserted text';
  if (item.kind === 'paste') return 'Pasted text';
  if (item.kind === 'delete' && item.metadata?.deleteScope === 'all_text') return 'Deleted all text';
  if (item.kind === 'delete') return 'Deleted text';
  return 'Full text';
}

function countTextLines(text?: string) {
  if (!text) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

function getMultilineReplaceSummary(item: DocumentEventTimelineItem) {
  const previousLineCount = countTextLines(getReplacedText(item));
  const newLineCount = countTextLines(item.text);
  const lineLabel = (count: number) => `${count} line${count === 1 ? '' : 's'}`;

  return `${lineLabel(previousLineCount)} -> ${lineLabel(newLineCount)}`;
}

function getFullTextMeta(item: DocumentEventTimelineItem) {
  if (item.kind === 'replace') {
    return `${getReplacedText(item).length} chars replaced · ${item.text?.length || 0} chars inserted`;
  }

  const parts: string[] = [];
  const charCount = item.charCount ?? item.text?.length ?? 0;
  const lineCount = countTextLines(item.text);

  if (charCount > 0) {
    parts.push(`${charCount} char${charCount === 1 ? '' : 's'}`);
  }

  if (lineCount > 1) {
    parts.push(`${lineCount} lines`);
  }

  return parts.join(' · ');
}

function renderRawDetail(event: DocumentEventTimelineRawEvent) {
  if (event.eventType === 'delete' && event.insertedText) {
    return <>Replaced with {renderTextPreview(event.insertedText, '')}</>;
  }

  if (event.insertedText) {
    return <>Inserted {renderTextPreview(event.insertedText, '')}</>;
  }
  if (event.deletedText) {
    return <>Deleted {renderTextPreview(event.deletedText, '')}</>;
  }
  if (event.keyChar) return `Key "${event.keyChar}"`;
  if (event.keyCode) return event.keyCode;
  return '-';
}

function getHiddenEventCategory(item: DocumentEventTimelineItem) {
  const eventTypes = item.rawEvents.map((event) => event.eventType);

  if (eventTypes.some((eventType) => eventType === 'focus' || eventType === 'blur')) {
    return 'focus/blur';
  }

  if (eventTypes.some((eventType) => ['select', 'copy', 'cut'].includes(eventType))) {
    return 'selection/copy/cut';
  }

  if (eventTypes.some((eventType) => eventType.startsWith('ai_'))) {
    return 'AI system';
  }

  if (item.label.toLowerCase().includes('line break')) {
    return 'line break';
  }

  return 'other';
}

function summarizeFoldPoint(items: DocumentEventTimelineItem[]) {
  const counts = items.reduce<Record<string, number>>((acc, item) => {
    const category = getHiddenEventCategory(item);

    acc[category] = (acc[category] || 0) + item.rawEventCount;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([label, count]) => `${count} ${label}`)
    .join(' · ');
}

function makeFoldPoint(items: DocumentEventTimelineItem[]): FoldPointItem {
  const sortedItems = [...items].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const rawEvents = sortedItems
    .flatMap((item) => item.rawEvents)
    .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const startTimestamp =
    sortedItems[sortedItems.length - 1]?.startTimestamp || sortedItems[0]?.timestamp;
  const endTimestamp = sortedItems[0]?.endTimestamp || sortedItems[0]?.timestamp;
  const rawEventCount = sortedItems.reduce((total, item) => total + item.rawEventCount, 0);

  return {
    kind: 'fold',
    id: `fold-${sortedItems[0]?.id || 'empty'}-${
      sortedItems[sortedItems.length - 1]?.id || 'empty'
    }`,
    timestamp: sortedItems[0]?.timestamp || new Date().toISOString(),
    startTimestamp,
    endTimestamp,
    items: sortedItems,
    rawEvents,
    rawEventCount,
  };
}

function formatFoldTimeRange(item: FoldPointItem) {
  const startText = formatTimelineTime(item.startTimestamp);
  const endText = formatTimelineTime(item.endTimestamp);
  return startText === endText ? startText : `${startText} - ${endText}`;
}

function RawEventTableRow({ event }: { event: DocumentEventTimelineRawEvent }) {
  return (
    <tr className="bg-muted/20 text-xs text-muted-foreground hover:bg-muted/30">
      <td className="whitespace-nowrap px-4 py-2">
        {formatRawEventTime(event.timestamp)}
      </td>
      <td className="px-4 py-2">
        <span className="inline-flex whitespace-nowrap items-center rounded border bg-background px-2 py-0.5 font-medium">
          raw event
        </span>
      </td>
      <td className="max-w-[760px] px-4 py-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="shrink-0 font-medium text-foreground/70">{event.eventType}</span>
          <span className="min-w-0 truncate">{renderRawDetail(event)}</span>
        </div>
      </td>
      <td className="px-4 py-2">
        {event.cursorPosition == null ? '-' : `Cursor ${event.cursorPosition}`}
      </td>
    </tr>
  );
}

export default function TaskSubmissionAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = params.id as string;
  const submissionId = params.submissionId as string;
  const cameFromAnalytics = searchParams.get('from') === 'analytics';
  const cameFromSubmission = searchParams.get('from') === 'submission';

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [events, setEvents] = useState<DocumentEvent[]>([]);
  const [timelineItems, setTimelineItems] = useState<DocumentEventTimelineItem[]>([]);
  const [aiLogs, setAiLogs] = useState<AIInteractionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  const fetchSubmissionEvents = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get<{
        success: boolean;
        data: {
          submission: Submission;
          events: DocumentEvent[];
          totalEvents: number;
          timeline?: {
            items?: DocumentEventTimelineItem[];
          };
          aiLogs?: AIInteractionLog[];
        };
      }>(`/api/v1/tasks/${taskId}/submissions/${submissionId}/events`);

      setSubmission(response.data.submission);
      setEvents(response.data.events || []);
      setTimelineItems(Array.isArray(response.data.timeline?.items) ? response.data.timeline.items : []);
      setAiLogs(Array.isArray(response.data.aiLogs) ? response.data.aiLogs : []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load submission analytics');
      setSubmission(null);
      setEvents([]);
      setTimelineItems([]);
      setAiLogs([]);
    } finally {
      setIsLoading(false);
    }
  }, [submissionId, taskId]);

  useEffect(() => {
    if (taskId && submissionId) {
      fetchSubmissionEvents();
    }
  }, [fetchSubmissionEvents, submissionId, taskId]);

  const sortedEvents = useMemo(() => [...events].sort((a, b) => eventTime(a) - eventTime(b)), [events]);
  const textMetrics = useMemo(() => calculateTextDeltaMetrics(sortedEvents), [sortedEvents]);
  const activityTimeline = useMemo(() => buildActivityTimeline(sortedEvents), [sortedEvents]);
  const eventCounts = sortedEvents.reduce<Record<string, number>>((counts, event) => {
    counts[event.eventType] = (counts[event.eventType] || 0) + 1;
    return counts;
  }, {});
  const composition = EVENT_GROUPS.map((group) => {
    const count = group.eventTypes.reduce((sum, eventType) => sum + (eventCounts[eventType] || 0), 0);
    const percentage = sortedEvents.length > 0 ? (count / sortedEvents.length) * 100 : 0;
    return { ...group, count, percentage };
  });
  const firstEventAt = sortedEvents[0] ? eventTime(sortedEvents[0]) : null;
  const lastEventAt = sortedEvents[sortedEvents.length - 1] ? eventTime(sortedEvents[sortedEvents.length - 1]) : null;
  const editingDurationSeconds = firstEventAt && lastEventAt
    ? Math.max(0, Math.round((lastEventAt - firstEventAt) / 1000))
    : 0;
  const authoredCharacters = textMetrics.typedCharacters + textMetrics.pastedCharacters;
  const pasteShare = authoredCharacters > 0
    ? (textMetrics.pastedCharacters / authoredCharacters) * 100
    : 0;
  const pasteActivity = pasteShare >= 25 ? 'Paste activity high' : pasteShare >= 10 ? 'Paste activity moderate' : 'Paste activity low';
  const insightText = `${pasteActivity} · Activity captured before submit · ${submission?.status === 'active' ? 'Latest submission' : 'Historical submission'}`;

  const visibleAILogs = useMemo(() => {
    return aiLogs.filter((log) => {
      const selectionText = getSelectionText(log);
      const suggestedText = getSuggestedText(log);

      if (!log.modificationsApplied && log.status === 'success' && selectionText && suggestedText) {
        const hasMirrorActionLog = aiLogs.some((candidate) => {
          if (candidate.id === log.id) return false;

          return (
            candidate.queryType === log.queryType &&
            getSelectionText(candidate) === selectionText &&
            getSuggestedText(candidate) === suggestedText &&
            (candidate.modificationsApplied || candidate.status === 'cancelled')
          );
        });

        if (hasMirrorActionLog) return false;
      }

      return true;
    });
  }, [aiLogs]);

  const timelineDisplayItems = useMemo<TimelineDisplayItem[]>(() => {
    type TimelineSourceItem =
      | {
          kind: 'primary';
          timestamp: string | Date;
          item: HistoryItem;
        }
      | {
          kind: 'hidden';
          timestamp: string | Date;
          item: DocumentEventTimelineItem;
        };

    const visibleTimelineItems = timelineItems.filter(
      (item) => !isAIAppliedMirrorReplace(item, visibleAILogs)
    );

    const sourceItems: TimelineSourceItem[] = [
      ...visibleTimelineItems.map((item) => {
        if (WRITING_TIMELINE_KINDS.has(item.kind)) {
          return {
            kind: 'primary' as const,
            timestamp: item.timestamp,
            item: {
              kind: 'timeline' as const,
              id: item.id,
              timestamp: item.timestamp,
              item,
            },
          };
        }

        return {
          kind: 'hidden' as const,
          timestamp: item.timestamp,
          item,
        };
      }),
      ...visibleAILogs.map((log) => {
        return {
          kind: 'primary' as const,
          timestamp: log.timestamp,
          item: {
            kind: 'ai' as const,
            id: log.id,
            timestamp: log.timestamp,
            log,
          },
        };
      }),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const displayItems: TimelineDisplayItem[] = [];
    let hiddenBuffer: DocumentEventTimelineItem[] = [];

    const flushHiddenBuffer = () => {
      if (hiddenBuffer.length === 0) return;
      const rawEvents = hiddenBuffer
        .flatMap((item) => item.rawEvents)
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (rawEvents.length >= FOLD_POINT_MIN_RAW_EVENT_COUNT) {
        displayItems.push(makeFoldPoint(hiddenBuffer));
      } else {
        displayItems.push(
          ...rawEvents.map((event) => ({
            kind: 'raw' as const,
            id: `raw-${event.id}`,
            timestamp: event.timestamp,
            event,
          }))
        );
      }

      hiddenBuffer = [];
    };

    sourceItems.forEach((sourceItem) => {
      if (sourceItem.kind === 'hidden') {
        hiddenBuffer.push(sourceItem.item);
        return;
      }

      flushHiddenBuffer();
      displayItems.push(sourceItem.item);
    });

    flushHiddenBuffer();

    return displayItems;
  }, [timelineItems, visibleAILogs]);

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleBack = () => {
    if (cameFromAnalytics) {
      router.push(`/tasks/${taskId}?tab=analytics`);
      return;
    }
    if (cameFromSubmission) {
      router.push(`/tasks/${taskId}?tab=submission`);
      return;
    }
    router.back();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="-ml-2 mb-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {cameFromAnalytics ? 'Back to Analytics' : cameFromSubmission ? 'Back to Submission' : 'Back'}
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Submission Analytics</h1>
          {submission && (
            <p className="mt-2 text-muted-foreground">
              {[submission.userEmail, submission.documentTitle || 'Untitled submission', `Submitted ${formatDateTime(submission.submittedAt)}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
        {submission?.certificateVerificationToken && (
          <Button asChild variant="outline">
            <a href={`/verify/${submission.certificateVerificationToken}`}>
              Open Certificate
            </a>
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading analytics</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Events before submit</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
              <div className="text-2xl font-semibold">{sortedEvents.length.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Editing duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
              <div className="text-2xl font-semibold">{formatDuration(editingDurationSeconds)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Typed characters</CardTitle>
            <Keyboard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
              <div className="text-2xl font-semibold">{textMetrics.typedCharacters.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paste share</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
              <div className="text-2xl font-semibold">{formatPercent(pasteShare)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Writing Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-[280px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : activityTimeline.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No events recorded before this submission.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={activityTimeline}>
                  <defs>
                    <linearGradient id="submissionActivity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.16} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    width={36}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="eventCount"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#submissionActivity)"
                    name="Events"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Composition</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex h-[280px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : composition.every((item) => item.count === 0) ? (
              <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No event data yet.
              </div>
            ) : (
              composition.map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-muted-foreground">{formatPercent(item.percentage)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${Math.min(100, item.percentage)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
        {insightText}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Event Log</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={fetchSubmissionEvents} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-[300px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : timelineDisplayItems.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed">
              <p className="text-sm text-muted-foreground">No events recorded before this submission.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-md border bg-background">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-52 px-4 py-2 text-left">Time</th>
                    <th className="w-44 px-4 py-2 text-left">Activity</th>
                    <th className="px-4 py-2 text-left">Text / Detail</th>
                    <th className="w-40 px-4 py-2 text-left">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {timelineDisplayItems.map((historyItem) => {
                    if (historyItem.kind === 'fold') {
                      const isExpanded = expandedIds.has(historyItem.id);
                      const summary = summarizeFoldPoint(historyItem.items);

                      return (
                        <Fragment key={historyItem.id}>
                          <tr>
                            <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                              {formatFoldTimeRange(historyItem)}
                            </td>
                            <td className="px-4 py-2.5" />
                            <td className="min-w-0 px-4 py-2.5">
                              <div className="flex min-w-0 items-center gap-2 text-xs text-muted-foreground">
                                <button
                                  type="button"
                                  className="group inline-flex shrink-0 items-center gap-1.5 text-left font-medium underline underline-offset-4 hover:text-foreground"
                                  onClick={() => toggleExpanded(historyItem.id)}
                                  aria-expanded={isExpanded}
                                >
                                  {isExpanded ? (
                                    <ChevronDown className="h-3.5 w-3.5" />
                                  ) : (
                                    <ChevronRight className="h-3.5 w-3.5" />
                                  )}
                                  {isExpanded ? 'Hide' : 'Show'}{' '}
                                  {historyItem.rawEventCount.toLocaleString()} other event
                                  {historyItem.rawEventCount === 1 ? '' : 's'}
                                </button>
                                {summary && (
                                  <span className="min-w-0 truncate">
                                    · {summary}
                                  </span>
                                )}
                              </div>
                            </td>
                            <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                              {historyItem.rawEventCount.toLocaleString()} event
                              {historyItem.rawEventCount === 1 ? '' : 's'}
                            </td>
                          </tr>
                          {isExpanded &&
                            historyItem.rawEvents.map((event) => (
                              <RawEventTableRow key={event.id} event={event} />
                            ))}
                        </Fragment>
                      );
                    }

                    if (historyItem.kind === 'raw') {
                      return (
                        <RawEventTableRow key={historyItem.id} event={historyItem.event} />
                      );
                    }

                    if (historyItem.kind === 'timeline') {
                      const item = historyItem.item;
                      const colorClass = TIMELINE_COLORS[item.kind] || 'bg-gray-100 text-gray-700';
                      const icon = TIMELINE_ICONS[item.kind] || null;
                      const canExpandText = canExpandTimelineText(item);
                      const isExpanded = expandedIds.has(item.id);

                      return (
                        <Fragment key={item.id}>
                          <tr className="hover:bg-muted/30">
                            <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                              {formatTimeRange(item)}
                            </td>
                            <td className="px-4 py-3">
                              <span className={`inline-flex whitespace-nowrap items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${colorClass}`}>
                                {icon}
                                {getTimelineActivityLabel(item)}
                              </span>
                            </td>
                            <td className="max-w-[760px] px-4 py-3 text-sm text-foreground">
                              {canExpandText ? (
                                <div className="flex min-w-0 items-center gap-2">
                                  <span className="min-w-0 flex-1 truncate">
                                    {getTimelineTextPreview(item)}
                                  </span>
                                  <button
                                    type="button"
                                    className="shrink-0 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
                                    onClick={() => toggleExpanded(item.id)}
                                    aria-expanded={isExpanded}
                                  >
                                    {isExpanded ? 'Hide full text' : 'View full text'}
                                  </button>
                                </div>
                              ) : (
                                <span className="block truncate">{renderTimelineDetail(item)}</span>
                              )}
                            </td>
                            <td className="px-4 py-3 text-xs text-muted-foreground">
                              {getTimelineCount(item)}
                            </td>
                          </tr>
                          {canExpandText && isExpanded && (
                            <tr className="bg-muted/20">
                              <td colSpan={4} className="px-4 py-3">
                                <div className="rounded-md border bg-background p-3">
                                  <div className="mb-2 flex items-center justify-between gap-3">
                                    <p className="text-xs font-medium text-muted-foreground">
                                      {getFullTextHeader(item)}
                                    </p>
                                    {getFullTextMeta(item) && (
                                      <span className="text-xs text-muted-foreground">
                                        {getFullTextMeta(item)}
                                      </span>
                                    )}
                                  </div>
                                  {item.kind === 'replace' ? (
                                    <div className="grid gap-3 md:grid-cols-2">
                                      <div>
                                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                                          Before
                                        </p>
                                        <div className="max-h-80 overflow-auto rounded border bg-muted/20 p-3 whitespace-pre-wrap break-words text-sm">
                                          {getReplacedText(item) || '-'}
                                        </div>
                                      </div>
                                      <div>
                                        <p className="mb-1 text-xs font-medium text-muted-foreground">
                                          After
                                        </p>
                                        <div className="max-h-80 overflow-auto rounded border bg-muted/20 p-3 whitespace-pre-wrap break-words text-sm">
                                          {item.text || '-'}
                                        </div>
                                      </div>
                                    </div>
                                  ) : (
                                    <div className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">
                                      {item.text}
                                    </div>
                                  )}
                                </div>
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    }

                    const { log } = historyItem;
                    const isExpanded = expandedIds.has(log.id);
                    const beforeText = getSelectionText(log);
                    const afterText = getSuggestedText(log);
                    const label = getAILogLabel(log);
                    const isChatLog = log.queryType === 'other';
                    const detailBeforeText = isChatLog ? log.query : beforeText;
                    const canExpand = canExpandAILog(log);

                    return (
                      <Fragment key={log.id}>
                        <tr
                          className={canExpand ? 'cursor-pointer hover:bg-muted/30' : 'hover:bg-muted/30'}
                          onClick={canExpand ? () => toggleExpanded(log.id) : undefined}
                        >
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            <div className="flex items-center gap-2">
                              {canExpand && (
                                isExpanded ? (
                                  <ChevronDown className="h-3 w-3" />
                                ) : (
                                  <ChevronRight className="h-3 w-3" />
                                )
                              )}
                              {formatTimelineTime(log.timestamp)}
                            </div>
                          </td>
                          <td className="px-4 py-3">
                            <span className="inline-flex whitespace-nowrap items-center gap-1 rounded bg-violet-100 px-2 py-0.5 text-xs font-medium text-violet-800">
                              <Sparkles className="h-3 w-3" />
                              {label}
                            </span>
                          </td>
                          <td className="max-w-[760px] px-4 py-3 text-sm text-foreground">
                            <span className="block truncate">
                              {formatSnippet(detailBeforeText || log.query, 'AI interaction')}
                            </span>
                          </td>
                          <td className="px-4 py-3 text-xs text-muted-foreground">
                            {getAIStatusLabel(log)}
                          </td>
                        </tr>
                        {canExpand && isExpanded && (
                          <tr className="bg-muted/20">
                            <td colSpan={4} className="px-4 py-3">
                              <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                                    {isChatLog ? 'Question' : 'Previous text'}
                                  </p>
                                  <div className="rounded border bg-background p-3 text-sm whitespace-pre-wrap">
                                    {detailBeforeText || '-'}
                                  </div>
                                </div>
                                <div>
                                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                                    {isChatLog ? 'AI response' : 'AI modified text'}
                                  </p>
                                  <div className="rounded border bg-background p-3 text-sm whitespace-pre-wrap">
                                    {afterText || '-'}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

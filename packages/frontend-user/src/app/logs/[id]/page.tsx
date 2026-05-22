'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  ArrowLeft,
  ChevronDown,
  ChevronRight,
  Clock,
  CornerDownLeft,
  Copy,
  RefreshCw,
  Sparkles,
  Trash2,
  Type,
} from 'lucide-react';
import { format } from 'date-fns';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { MarkdownContent } from '@/components/markdown-content';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import type {
  AIInteractionLog,
  DocumentEventTimelineItem,
  DocumentEventTimelineRawEvent,
  DocumentEventTimelineSummary,
} from '@humanly/shared';

const EMPTY_SUMMARY: DocumentEventTimelineSummary = {
  rawEventTotal: 0,
  timelineItemTotal: 0,
  typingBursts: 0,
  typedCharacters: 0,
  typedWords: 0,
  pasteCharacters: 0,
  deletedCharacters: 0,
};

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

function getSelectionText(log: AIInteractionLog) {
  return log.modifications?.[0]?.before || log.contextSnapshot?.selection?.text || '';
}

function getSuggestedText(log: AIInteractionLog) {
  return log.modifications?.[0]?.after || log.response || '';
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
  const start = new Date(item.startTimestamp);
  const end = new Date(item.endTimestamp);
  const startText = format(start, 'HH:mm:ss');
  const endText = format(end, 'HH:mm:ss');
  return startText === endText ? startText : `${startText} - ${endText}`;
}

function hasExplicitTimezone(value: string) {
  return /(?:z|[+-]\d{2}:?\d{2})$/i.test(value.trim());
}

function parseAILogTimestamp(value: string | Date) {
  if (value instanceof Date) return value;
  const trimmed = String(value).trim();
  if (!trimmed) return new Date(value);

  const normalized = trimmed.includes('T') ? trimmed : trimmed.replace(' ', 'T');
  return new Date(hasExplicitTimezone(normalized) ? normalized : `${normalized}Z`);
}

function formatAILogTime(value: string | Date) {
  return format(parseAILogTimestamp(value), 'HH:mm:ss');
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
    <span className="inline-flex shrink-0 items-center rounded border bg-muted px-1.5 py-0.5 font-mono text-[11px] text-muted-foreground">
      Line break{count >= LINE_BREAK_COLLAPSE_THRESHOLD ? ` × ${count}` : ''}
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
      <span className="shrink-0 text-muted-foreground">→</span>
      <span className="min-w-0 truncate">
        {renderTextPreview(item.text, 'New text', maxTextCharacters)}
      </span>
    </span>
  );
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

function getTimelineLineBreakCount(item: DocumentEventTimelineItem) {
  const metadataCount = item.metadata?.lineBreakCount;
  return typeof metadataCount === 'number' && metadataCount > 0
    ? metadataCount
    : item.charCount || 1;
}

function getTimelineCount(item: DocumentEventTimelineItem) {
  if (item.kind === 'line_break') {
    const lineBreakCount = getTimelineLineBreakCount(item);
    return `${lineBreakCount} line break${lineBreakCount === 1 ? '' : 's'}`;
  }

  if (item.kind === 'replace') {
    const replacedCharCount = getReplacedText(item).length;
    const insertedCharCount = item.text?.length || 0;
    return `${replacedCharCount} → ${insertedCharCount} chars`;
  }

  const parts: string[] = [];

  if (item.wordCount !== undefined) {
    parts.push(`${item.wordCount} word${item.wordCount === 1 ? '' : 's'}`);
  }

  if (item.charCount !== undefined) {
    parts.push(`${item.charCount} char${item.charCount === 1 ? '' : 's'}`);
  }

  return parts.join(' · ') || '—';
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

  return `${lineLabel(previousLineCount)} → ${lineLabel(newLineCount)}`;
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
    return (
      <>
        Replaced with {renderTextPreview(event.insertedText, '')}
      </>
    );
  }

  if (event.insertedText) {
    return (
      <>
        Inserted {renderTextPreview(event.insertedText, '')}
      </>
    );
  }
  if (event.deletedText) {
    return (
      <>
        Deleted {renderTextPreview(event.deletedText, '')}
      </>
    );
  }
  if (event.keyChar) return `Key "${event.keyChar}"`;
  if (event.keyCode) return event.keyCode;
  return '—';
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

  if (
    eventTypes.some((eventType) =>
      [
        'bold',
        'italic',
        'underline',
        'strikethrough',
        'code',
        'subscript',
        'superscript',
        'heading-change',
        'font-family-change',
        'font-size-change',
        'text-color-change',
        'highlight-color-change',
        'list-create',
        'list-delete',
        'list-indent',
        'list-outdent',
        'list-item-check',
        'alignment-change',
        'line-spacing-change',
        'indent-change',
        'clear-formatting',
      ].includes(eventType)
    )
  ) {
    return 'formatting';
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
  const start = new Date(item.startTimestamp);
  const end = new Date(item.endTimestamp);
  const startText = format(start, 'HH:mm:ss');
  const endText = format(end, 'HH:mm:ss');
  return startText === endText ? startText : `${startText} - ${endText}`;
}

function RawEventTableRow({ event }: { event: DocumentEventTimelineRawEvent }) {
  return (
    <tr className="bg-muted/20 text-xs text-muted-foreground hover:bg-muted/30">
      <td className="whitespace-nowrap px-4 py-2 font-mono">
        {format(new Date(event.timestamp), 'HH:mm:ss.SSS')}
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
        {event.cursorPosition === undefined ? '—' : `Cursor ${event.cursorPosition}`}
      </td>
    </tr>
  );
}

export default function DocumentLogsPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.id as string;
  const { checkAuth } = useAuthStore();

  const [documentTitle, setDocumentTitle] = useState<string>('Document');
  const [timelineItems, setTimelineItems] = useState<DocumentEventTimelineItem[]>([]);
  const [timelineSummary, setTimelineSummary] = useState<DocumentEventTimelineSummary>(EMPTY_SUMMARY);
  const [aiLogs, setAiLogs] = useState<AIInteractionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const [docRes, timelineRes, aiLogsRes] = await Promise.all([
        apiClient.get(`/documents/${documentId}`),
        apiClient.get(`/documents/${documentId}/events/timeline?limit=10000`),
        apiClient
          .get(`/ai/logs?documentId=${documentId}&limit=50&offset=0`)
          .catch(() => ({ data: { data: [] } })),
      ]);

      setDocumentTitle(docRes.data.data?.document?.title || 'Document');

      const timelineData = timelineRes.data.data || {};
      setTimelineItems(Array.isArray(timelineData.items) ? timelineData.items : []);
      setTimelineSummary(timelineData.summary || EMPTY_SUMMARY);

      const aiLogData = aiLogsRes.data.data || [];
      setAiLogs(Array.isArray(aiLogData) ? aiLogData : []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load logs');
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

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
        const timestamp = parseAILogTimestamp(log.timestamp);

        return {
          kind: 'primary' as const,
          timestamp,
          item: {
            kind: 'ai' as const,
            id: log.id,
            timestamp,
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

  return (
    <div className="min-h-screen bg-background">
      <div className="border-b px-4 py-3 flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => router.push(`/documents/${documentId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="font-semibold text-sm">{documentTitle}</h1>
          <p className="text-xs text-muted-foreground">Document and AI Activity Timeline</p>
        </div>
      </div>

      <div className="max-w-7xl mx-auto p-4 space-y-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Event Summary
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <p className="text-sm text-muted-foreground">
              Total recorded events:{' '}
              <span className="font-medium text-foreground">
                {timelineSummary.rawEventTotal.toLocaleString()}
              </span>
            </p>
            <p className="text-sm text-muted-foreground">
              AI actions logged:{' '}
              <span className="font-medium text-foreground">{visibleAILogs.length.toLocaleString()}</span>
            </p>
          </CardContent>
        </Card>

        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading logs...</div>
        ) : error ? (
          <div className="text-center py-12 text-destructive text-sm">{error}</div>
        ) : timelineDisplayItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No events recorded yet.</div>
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
                          <td className="whitespace-nowrap px-4 py-2.5 font-mono text-xs text-muted-foreground">
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
                          <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
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
                                        {getReplacedText(item) || '—'}
                                      </div>
                                    </div>
                                    <div>
                                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                                        After
                                      </p>
                                      <div className="max-h-80 overflow-auto rounded border bg-muted/20 p-3 whitespace-pre-wrap break-words text-sm">
                                        {item.text || '—'}
                                      </div>
                                    </div>
                                  </div>
                                ) : item.kind === 'ai_insert' ? (
                                  <div className="max-h-80 overflow-auto text-sm">
                                    <MarkdownContent>
                                      {item.text || ''}
                                    </MarkdownContent>
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
                        <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted-foreground">
                          <div className="flex items-center gap-2">
                            {canExpand && (
                              isExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )
                            )}
                            {formatAILogTime(log.timestamp)}
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
                                  {detailBeforeText || '—'}
                                </div>
                              </div>
                              <div>
                                <p className="mb-1 text-xs font-medium text-muted-foreground">
                                  {isChatLog ? 'AI response' : 'AI modified text'}
                                </p>
                                <div className="rounded border bg-background p-3 text-sm whitespace-pre-wrap">
                                  {afterText || '—'}
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
      </div>
    </div>
  );
}

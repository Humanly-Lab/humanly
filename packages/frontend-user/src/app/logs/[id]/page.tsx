'use client';

import { Fragment, useCallback, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
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
import { API_URL, TokenManager, apiClient } from '@/lib/api-client';
import { usePublicDocumentToken } from '@/hooks/use-public-document-token';
import { useAuthStore } from '@/stores/auth-store';
import type {
  AIInteractionLog,
  DocumentEventTimelineItem,
  DocumentEventTimelineRawEvent,
  DocumentEventTimelineSummary,
  TextRenderMode,
  WritingAnomalyFlag,
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
const AI_MIRROR_REPLACE_TIME_WINDOW_MS = 10 * 60 * 1000;

const TIMELINE_COLORS: Partial<Record<DocumentEventTimelineItem['kind'], CSSProperties>> = {
  typing_burst: { backgroundColor: '#EEF1F4', borderColor: '#C8D1DC', color: '#576777' },
  line_break: { backgroundColor: '#EFF2EF', borderColor: '#CBD5CE', color: '#5B6B63' },
  ai_insert: { backgroundColor: '#F0EDF2', borderColor: '#D0C8D7', color: '#655D70' },
  replace: { backgroundColor: '#EEF1F4', borderColor: '#C8D1DC', color: '#576777' },
  paste: { backgroundColor: '#F2EFE8', borderColor: '#D8CCBA', color: '#6A6256' },
  delete: { backgroundColor: '#F2EDEE', borderColor: '#D6C5C7', color: '#6F5D61' },
};
const DEFAULT_TIMELINE_COLOR: CSSProperties = {
  backgroundColor: '#EEEDEA',
  borderColor: '#D1CDC7',
  color: '#605D58',
};
const AI_LOG_BADGE_COLOR: CSSProperties = {
  backgroundColor: '#F0EDF2',
  borderColor: '#D0C8D7',
  color: '#655D70',
};
const ANOMALY_BADGE_COLOR: CSSProperties = {
  backgroundColor: '#F4ECEA',
  borderColor: '#D9BDB8',
  color: '#7A5550',
};

const TIMELINE_ICONS: Partial<Record<DocumentEventTimelineItem['kind'], JSX.Element>> = {
  typing_burst: <Type className="h-3 w-3" />,
  line_break: <CornerDownLeft className="h-3 w-3" />,
  ai_insert: <Sparkles className="h-3 w-3" />,
  replace: <RefreshCw className="h-3 w-3" />,
  paste: <Copy className="h-3 w-3" />,
  delete: <Trash2 className="h-3 w-3" />,
};

const getRawEventColor = (eventType: string): CSSProperties => {
  if (eventType === 'ai_policy_refusal' || eventType === 'blocked_copy_paste_attempt') {
    return ANOMALY_BADGE_COLOR;
  }
  if (eventType === 'paste') return TIMELINE_COLORS.paste || DEFAULT_TIMELINE_COLOR;
  if (eventType === 'copy' || eventType === 'cut' || eventType === 'select') {
    return { backgroundColor: '#F1EEE8', borderColor: '#D7CDC0', color: '#6B6255' };
  }
  if (
    eventType === 'focus' ||
    eventType === 'blur' ||
    eventType === 'page_hidden' ||
    eventType === 'page_visible'
  ) {
    return TIMELINE_COLORS.line_break || DEFAULT_TIMELINE_COLOR;
  }
  if (eventType === 'delete') return TIMELINE_COLORS.delete || DEFAULT_TIMELINE_COLOR;
  if (eventType.startsWith('ai_')) return TIMELINE_COLORS.ai_insert || DEFAULT_TIMELINE_COLOR;
  if (eventType === 'keydown' || eventType === 'keyup' || eventType === 'input') {
    return TIMELINE_COLORS.typing_burst || DEFAULT_TIMELINE_COLOR;
  }

  return DEFAULT_TIMELINE_COLOR;
};

const AI_ACTION_LABELS: Record<string, string> = {
  grammar_check: 'Fix grammar',
  spelling_check: 'Fix spelling',
  rewrite: 'Rewrite',
  summarize: 'Summarize',
  expand: 'Expand',
  translate: 'Translate',
  format: 'Format',
  question: 'Chat',
  reference: 'Chat',
  other: 'Chat',
};

const CHAT_QUERY_TYPES = new Set<AIInteractionLog['queryType']>([
  'question',
  'reference',
  'other',
]);

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
  event: DisplayRawEvent;
};

type TimelineDisplayItem = HistoryItem | FoldPointItem | RawEventDisplayItem;

type RawEventDisplayOverride = {
  code: 'rapid_text_accumulation';
  detail: string;
  count: string;
};

type DisplayRawEvent = DocumentEventTimelineRawEvent & {
  displayAnomaly?: RawEventDisplayOverride;
};

function getSelectionText(log: AIInteractionLog) {
  return log.modifications?.[0]?.before || log.contextSnapshot?.selection?.text || '';
}

function getSuggestedText(log: AIInteractionLog) {
  return log.modifications?.[0]?.after || log.response || '';
}

function formatDuration(ms?: unknown) {
  if (typeof ms !== 'number' || !Number.isFinite(ms) || ms < 0) {
    return '';
  }

  const totalSeconds = Math.max(1, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const parts: string[] = [];

  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (seconds > 0 || parts.length === 0) parts.push(`${seconds}s`);

  return parts.join(' ');
}

function getPageVisibleDetail(metadata?: Record<string, any>) {
  const duration = formatDuration(metadata?.hiddenDurationMs);
  return duration ? `Returned after ${duration}` : 'Returned to the document page';
}

function isPageVisibilityEventType(eventType?: string) {
  return eventType === 'page_hidden' || eventType === 'page_visible';
}

function getTimelinePageVisibilityEventType(item: DocumentEventTimelineItem) {
  const eventType = item.rawEvents[0]?.eventType;
  return isPageVisibilityEventType(eventType) ? eventType : null;
}

function isPageVisibilityTimelineItem(item: DocumentEventTimelineItem) {
  return Boolean(getTimelinePageVisibilityEventType(item));
}

function normalizeForComparison(text?: string) {
  return normalizeVisibleText(text);
}

function normalizeAIMirrorBoundaryText(text?: string) {
  return normalizeForComparison(text)
    .replace(/^[\s"'“”‘’.,!?;:…。！？；：、，]+/g, '')
    .replace(/[\s"'“”‘’.,!?;:…。！？；：、，]+$/g, '')
    .trim();
}

function textMatchesAIMirror(logText?: string, timelineText?: string) {
  const normalizedLogText = normalizeForComparison(logText);
  const normalizedTimelineText = normalizeForComparison(timelineText);
  if (!normalizedLogText || !normalizedTimelineText) return false;
  if (normalizedLogText === normalizedTimelineText) return true;

  return (
    normalizeAIMirrorBoundaryText(normalizedLogText) ===
    normalizeAIMirrorBoundaryText(normalizedTimelineText)
  );
}

function getMinimalTextDelta(beforeText?: string, afterText?: string) {
  const before = normalizeForComparison(beforeText);
  const after = normalizeForComparison(afterText);
  let prefix = 0;

  while (prefix < before.length && prefix < after.length && before[prefix] === after[prefix]) {
    prefix += 1;
  }

  let suffix = 0;
  while (
    suffix < before.length - prefix &&
    suffix < after.length - prefix &&
    before[before.length - 1 - suffix] === after[after.length - 1 - suffix]
  ) {
    suffix += 1;
  }

  return {
    deletedText: before.slice(prefix, before.length - suffix),
    insertedText: after.slice(prefix, after.length - suffix),
  };
}

function aiMirrorReplacementMatches(
  logBeforeText: string,
  logAfterText: string,
  timelineBeforeText: string,
  timelineAfterText: string
) {
  if (
    textMatchesAIMirror(logBeforeText, timelineBeforeText) &&
    textMatchesAIMirror(logAfterText, timelineAfterText)
  ) {
    return true;
  }

  const logDelta = getMinimalTextDelta(logBeforeText, logAfterText);
  return (
    textMatchesAIMirror(logDelta.deletedText, timelineBeforeText) &&
    textMatchesAIMirror(logDelta.insertedText, timelineAfterText)
  );
}

function timestampMs(value?: string | Date) {
  if (!value) return null;
  const time = value instanceof Date ? value.getTime() : new Date(value).getTime();
  return Number.isFinite(time) ? time : null;
}

function isNearAIReplacement(item: DocumentEventTimelineItem, log: AIInteractionLog) {
  const itemTimes = [item.timestamp, item.startTimestamp, item.endTimestamp]
    .map(timestampMs)
    .filter((time): time is number => time !== null);
  const logTimes = [log.timestamp, ...(log.modifications || []).map((modification) => modification.timestamp)]
    .map(timestampMs)
    .filter((time): time is number => time !== null);

  if (itemTimes.length === 0 || logTimes.length === 0) return true;

  return itemTimes.some((itemTime) =>
    logTimes.some((logTime) => Math.abs(itemTime - logTime) <= AI_MIRROR_REPLACE_TIME_WINDOW_MS)
  );
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
    if (!isNearAIReplacement(item, log)) return false;

    return (
      aiMirrorReplacementMatches(getSelectionText(log), getSuggestedText(log), replacedText, newText)
    );
  });
}

function getAILogLabel(log: AIInteractionLog) {
  if (isChatAILog(log)) return 'Chat';
  if (log.queryType === 'grammar_check') return 'Fix grammar';
  if (log.query.toLowerCase().includes('simplify')) return 'Simplify';
  if (log.query.toLowerCase().includes('formal')) return 'Make formal';
  if (log.query.toLowerCase().includes('improve')) return 'Improve writing';
  return AI_ACTION_LABELS[log.queryType] || log.queryType;
}

function isChatAILog(log: AIInteractionLog) {
  return CHAT_QUERY_TYPES.has(log.queryType);
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
    <span className="inline-flex shrink-0 items-center rounded border bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">
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

function getMetadataText(item: DocumentEventTimelineItem, key: string) {
  const value = item.metadata?.[key];
  return typeof value === 'string' ? value : '';
}

function getRawEventMetadataText(event: DocumentEventTimelineRawEvent, key: string) {
  const value = event.metadata?.[key];
  return typeof value === 'string' ? value : '';
}

function isPolicyRefusalEvent(event: DocumentEventTimelineRawEvent) {
  return event.eventType === 'ai_policy_refusal';
}

function isBlockedCopyPasteAttempt(event: DocumentEventTimelineRawEvent) {
  return event.eventType === 'blocked_copy_paste_attempt';
}

function isAnomalyRawEvent(event: DocumentEventTimelineRawEvent) {
  return Boolean((event as DisplayRawEvent).displayAnomaly) || isPolicyRefusalEvent(event) || isBlockedCopyPasteAttempt(event);
}

function getBlockedCopyPasteAction(event: DocumentEventTimelineRawEvent) {
  const action = event.metadata?.action;
  return action === 'copy' || action === 'cut' || action === 'paste' ? action : 'copy-paste';
}

function getPolicyRefusalLogId(event: DocumentEventTimelineRawEvent) {
  const logId = event.metadata?.logId;
  return typeof logId === 'string' ? logId : '';
}

function getPolicyRefusalQuestion(
  event: DocumentEventTimelineRawEvent,
  aiLogsById?: Map<string, AIInteractionLog>
) {
  return (
    getRawEventMetadataText(event, 'userMessage') ||
    getRawEventMetadataText(event, 'query') ||
    getRawEventMetadataText(event, 'message') ||
    aiLogsById?.get(getPolicyRefusalLogId(event))?.query ||
    ''
  );
}

function canExpandRawEvent(event: DocumentEventTimelineRawEvent, aiLogsById?: Map<string, AIInteractionLog>) {
  if (!isPolicyRefusalEvent(event)) return false;
  return normalizeVisibleText(getPolicyRefusalQuestion(event, aiLogsById)).length > LONG_TEXT_PREVIEW_THRESHOLD;
}

function getFlagEvidenceString(flag: WritingAnomalyFlag, key: string) {
  const value = flag.evidence?.[key];
  return typeof value === 'string' ? value : '';
}

function getFlagEvidenceNumber(flag: WritingAnomalyFlag, key: string) {
  const value = flag.evidence?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function getRapidTextCount(flag: WritingAnomalyFlag) {
  return (
    getFlagEvidenceNumber(flag, 'untrackedAddedCharacters') ??
    getFlagEvidenceNumber(flag, 'refocusAddedCharacters') ??
    getFlagEvidenceNumber(flag, 'maxCharactersInWindow')
  );
}

function isSameTimestamp(a?: string | Date, b?: string | Date) {
  if (!a || !b) return false;
  const aTime = new Date(a).getTime();
  const bTime = new Date(b).getTime();
  return Number.isFinite(aTime) && Number.isFinite(bTime) && aTime === bTime;
}

function matchesRapidTextFlag(event: DocumentEventTimelineRawEvent, flag: WritingAnomalyFlag) {
  if (flag.code !== 'rapid_text_accumulation') return false;

  const untrackedEventType = getFlagEvidenceString(flag, 'untrackedEventType');
  const untrackedTimestamp = getFlagEvidenceString(flag, 'untrackedTimestamp');
  if (untrackedEventType && untrackedTimestamp) {
    return event.eventType === untrackedEventType && isSameTimestamp(event.timestamp, untrackedTimestamp);
  }

  const focusTimestamp = getFlagEvidenceString(flag, 'focusTimestamp');
  if (focusTimestamp) {
    return event.eventType === 'focus' && isSameTimestamp(event.timestamp, focusTimestamp);
  }

  return false;
}

function annotateRawEventForAnomaly(
  event: DocumentEventTimelineRawEvent,
  anomalyFlags: WritingAnomalyFlag[]
): DisplayRawEvent {
  const rapidTextFlag = anomalyFlags.find((flag) => matchesRapidTextFlag(event, flag));
  if (!rapidTextFlag) return event;

  const addedCharacters = getRapidTextCount(rapidTextFlag);
  const count = addedCharacters == null
    ? '—'
    : `${addedCharacters.toLocaleString()} char${addedCharacters === 1 ? '' : 's'}`;

  return {
    ...event,
    displayAnomaly: {
      code: 'rapid_text_accumulation',
      detail: rapidTextFlag.description || 'A large amount of text appeared within a short time window.',
      count,
    },
  };
}

function getRawEventFullText(event: DocumentEventTimelineRawEvent, aiLogsById?: Map<string, AIInteractionLog>) {
  if (isPolicyRefusalEvent(event)) return getPolicyRefusalQuestion(event, aiLogsById);
  return '';
}

function getRawEventFullTextHeader(event: DocumentEventTimelineRawEvent) {
  if (isPolicyRefusalEvent(event)) return 'Refused chat request';
  return 'Event detail';
}

function getTimelineTextRenderMode(item: DocumentEventTimelineItem): TextRenderMode {
  if (item.kind === 'ai_insert') return 'markdown';
  return 'plain';
}

function getTimelineSourceText(item: DocumentEventTimelineItem) {
  const sourceText = getMetadataText(item, 'sourceText');
  return sourceText || item.text || '';
}

function getReplacementAfterText(item: DocumentEventTimelineItem) {
  return getTimelineSourceText(item);
}

function getReplacementBeforeText(item: DocumentEventTimelineItem) {
  return getMetadataText(item, 'replacedSourceText') || getReplacedText(item);
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
  const pageVisibilityEventType = getTimelinePageVisibilityEventType(item);
  if (pageVisibilityEventType === 'page_hidden') {
    return 'User switched away from the document page';
  }
  if (pageVisibilityEventType === 'page_visible') {
    return getPageVisibleDetail(item.metadata);
  }

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
  const pageVisibilityEventType = getTimelinePageVisibilityEventType(item);
  if (pageVisibilityEventType === 'page_hidden') return 'Left page';
  if (pageVisibilityEventType === 'page_visible') return 'Returned';

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
    const previousText = getReplacementBeforeText(item);
    const newText = getReplacementAfterText(item);

    return (
      isMultilineText(previousText) ||
      isMultilineText(newText) ||
      normalizeVisibleText(previousText).length > LONG_TEXT_PREVIEW_THRESHOLD ||
      normalizeVisibleText(newText).length > LONG_TEXT_PREVIEW_THRESHOLD
    );
  }

  if (item.kind !== 'paste' && item.kind !== 'delete' && item.kind !== 'ai_insert') return false;
  if (item.kind === 'delete' && item.metadata?.deleteScope === 'all_text' && item.text) return true;
  const sourceText = getTimelineSourceText(item);
  if ((item.kind === 'paste' || item.kind === 'ai_insert') && isMultilineText(sourceText)) return true;
  return normalizeVisibleText(sourceText).length > LONG_TEXT_PREVIEW_THRESHOLD;
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
  if (item.kind === 'paste' && isMultilineText(item.text)) {
    return getMultilineContentSummary(item.text, 'pasted');
  }
  if (item.kind === 'ai_insert' && isMultilineText(item.text)) {
    return getMultilineContentSummary(item.text, 'inserted');
  }
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

function getMultilineContentSummary(
  text: string | undefined,
  action: 'pasted' | 'inserted',
  maxTextCharacters = LONG_TEXT_PREVIEW_THRESHOLD
) {
  const lineCount = countTextLines(text);
  const lineLabel = `${lineCount} line${lineCount === 1 ? '' : 's'} ${action}`;
  const snippet = formatSnippet(text, '', maxTextCharacters);

  return snippet ? `${lineLabel} · "${snippet}"` : lineLabel;
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

function RenderableFullText({
  text,
  renderMode,
  className = '',
}: {
  text: string;
  renderMode: TextRenderMode;
  className?: string;
}) {
  if (renderMode === 'markdown') {
    return (
      <div className={`max-h-80 overflow-auto text-sm ${className}`}>
        <MarkdownContent>{text || '—'}</MarkdownContent>
      </div>
    );
  }

  return (
    <div className={`max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm ${className}`}>
      {text || '—'}
    </div>
  );
}

function renderRawDetail(
  event: DocumentEventTimelineRawEvent,
  aiLogsById?: Map<string, AIInteractionLog>
) {
  if ((event as DisplayRawEvent).displayAnomaly) {
    return (event as DisplayRawEvent).displayAnomaly?.detail || null;
  }

  if (isPolicyRefusalEvent(event)) {
    const question = getPolicyRefusalQuestion(event, aiLogsById);
    return question
      ? renderTextPreview(question, 'Policy-conflicting chat request')
      : 'Chat request refused by policy';
  }

  if (isBlockedCopyPasteAttempt(event)) {
    const action = getBlockedCopyPasteAction(event);
    return `Blocked ${action} by copy-paste policy`;
  }

  if (event.eventType === 'ai_query_sent') {
    const query = getRawEventMetadataText(event, 'query');
    return query ? renderTextPreview(query, 'AI question') : null;
  }
  if (event.eventType === 'ai_response_received') return null;
  if (event.eventType === 'ai_panel_open') return null;
  if (event.eventType === 'ai_panel_close') return null;

  if (event.eventType === 'page_hidden') return 'User switched away from the document page';
  if (event.eventType === 'page_visible') return getPageVisibleDetail(event.metadata);
  if (event.eventType === 'focus') return 'Editor focused';
  if (event.eventType === 'blur') return 'Editor lost focus';
  if (event.eventType === 'select') {
    const selectedText =
      typeof event.metadata?.selectedText === 'string'
        ? event.metadata.selectedText
        : typeof event.metadata?.selection?.text === 'string'
          ? event.metadata.selection.text
          : '';
    const selectedLineCount = countTextLines(selectedText);
    const selectedCharCount = selectedText.length;
    const shouldSummarizeSelection =
      selectedLineCount > 1 || normalizeVisibleText(selectedText).length > LONG_TEXT_PREVIEW_THRESHOLD;

    if (!selectedText) return 'Selection changed';
    if (shouldSummarizeSelection) {
      const summaryParts = [
        selectedLineCount > 1
          ? `${selectedLineCount} line${selectedLineCount === 1 ? '' : 's'}`
          : null,
        `${selectedCharCount} char${selectedCharCount === 1 ? '' : 's'}`,
      ].filter(Boolean);

      return `${summaryParts.join(' · ')} selected`;
    }

    return <>{renderTextPreview(selectedText, '')} selected</>;
  }

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

function getRawEventDisplayType(event: DocumentEventTimelineRawEvent) {
  if ((event as DisplayRawEvent).displayAnomaly) {
    return (event as DisplayRawEvent).displayAnomaly?.code || event.eventType;
  }
  if (isPolicyRefusalEvent(event)) return 'chat_refusal';
  if (isBlockedCopyPasteAttempt(event)) return 'blocked_copy_paste_attempt';
  if (event.eventType === 'page_hidden') return 'Left page';
  if (event.eventType === 'page_visible') return 'Returned';
  if (event.eventType === 'ai_query_sent') return 'AI question sent';
  if (event.eventType === 'ai_response_received') return 'AI response received';
  if (event.eventType === 'ai_panel_open') return 'AI panel opened';
  if (event.eventType === 'ai_panel_close') return 'AI panel closed';
  if (event.eventType === 'ai_selection_action') return 'AI quick action';
  if (event.eventType === 'ai_insert_from_chat') return 'AI inserted text';
  return event.eventType;
}

function isDuplicateAIQueryRawEvent(
  event: DocumentEventTimelineRawEvent,
  visibleAILogIds: Set<string>
) {
  if (event.eventType !== 'ai_query_sent') return false;
  const logId = event.metadata?.logId;
  return typeof logId === 'string' && visibleAILogIds.has(logId);
}

function getRawEventActivityLabel(event: DocumentEventTimelineRawEvent) {
  return isAnomalyRawEvent(event) ? 'anomaly' : 'raw event';
}

function getRawEventActivityIcon(event: DocumentEventTimelineRawEvent) {
  if (isAnomalyRawEvent(event)) return <AlertCircle className="h-3 w-3" />;
  return null;
}

function getRawEventActivityStyle(event: DocumentEventTimelineRawEvent): CSSProperties | undefined {
  if (isAnomalyRawEvent(event)) return ANOMALY_BADGE_COLOR;
  return undefined;
}

function getRawEventCount(event: DocumentEventTimelineRawEvent) {
  if ((event as DisplayRawEvent).displayAnomaly) {
    return (event as DisplayRawEvent).displayAnomaly?.count || '—';
  }
  if (isPolicyRefusalEvent(event)) return '1 refusal';
  if (isBlockedCopyPasteAttempt(event)) return '1 attempt';
  return event.cursorPosition == null ? '—' : `Cursor ${event.cursorPosition}`;
}

function getHiddenRawEventCategory(event: DocumentEventTimelineRawEvent) {
  const eventType = event.eventType;

  if (eventType === 'focus' || eventType === 'blur') {
    return 'focus/blur';
  }

  if (isPageVisibilityEventType(eventType)) {
    return 'page visibility';
  }

  if (['select', 'copy', 'cut'].includes(eventType)) {
    return 'selection/copy/cut';
  }

  if (eventType.startsWith('ai_')) {
    return 'AI system';
  }

  if (eventType === 'keydown' && (event.keyCode === 'Enter' || event.keyChar === 'Enter')) {
    return 'line break';
  }

  if (
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
  ) {
    return 'formatting';
  }

  return 'other';
}

function summarizeFoldPoint(rawEvents: DocumentEventTimelineRawEvent[]) {
  const counts = rawEvents.reduce<Record<string, number>>((acc, event) => {
    const category = getHiddenRawEventCategory(event);

    acc[category] = (acc[category] || 0) + 1;
    return acc;
  }, {});

  return Object.entries(counts)
    .map(([label, count]) => `${count} ${label}`)
    .join(' · ');
}

function makeFoldPoint(
  items: DocumentEventTimelineItem[],
  rawEventsOverride?: DocumentEventTimelineRawEvent[]
): FoldPointItem {
  const sortedItems = [...items].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const rawEvents =
    rawEventsOverride ||
    sortedItems
      .flatMap((item) => item.rawEvents)
      .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const startTimestamp =
    sortedItems[sortedItems.length - 1]?.startTimestamp || sortedItems[0]?.timestamp;
  const endTimestamp = sortedItems[0]?.endTimestamp || sortedItems[0]?.timestamp;
  const rawEventCount = rawEvents.length;

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

function RawEventTableRow({
  event,
  aiLogsById,
  isExpanded = false,
  onToggleExpanded,
}: {
  event: DocumentEventTimelineRawEvent;
  aiLogsById?: Map<string, AIInteractionLog>;
  isExpanded?: boolean;
  onToggleExpanded?: () => void;
}) {
  const detail = renderRawDetail(event, aiLogsById);
  const eventColor = getRawEventColor(event.eventType);
  const canExpand = canExpandRawEvent(event, aiLogsById);
  const fullText = getRawEventFullText(event, aiLogsById);
  const activityStyle = getRawEventActivityStyle(event);
  const activityIcon = getRawEventActivityIcon(event);

  return (
    <>
      <tr className="bg-muted/20 text-xs text-muted-foreground hover:bg-muted/30">
        <td className="whitespace-nowrap px-4 py-2">
          {format(new Date(event.timestamp), 'HH:mm:ss.SSS')}
        </td>
        <td className="px-4 py-2">
          <span
            className="inline-flex whitespace-nowrap items-center gap-1 rounded border bg-background px-2 py-0.5 font-medium"
            style={activityStyle}
          >
            {activityIcon}
            {getRawEventActivityLabel(event)}
          </span>
        </td>
        <td className="max-w-[760px] px-4 py-2">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className="inline-flex shrink-0 items-center rounded border px-2 py-0.5 font-medium"
              style={eventColor}
            >
              {getRawEventDisplayType(event)}
            </span>
            {detail && <span className="min-w-0 truncate">{detail}</span>}
            {canExpand && onToggleExpanded && (
              <button
                type="button"
                className="shrink-0 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
                onClick={onToggleExpanded}
                aria-expanded={isExpanded}
              >
                {isExpanded ? 'Hide Full Text' : 'View Full Text'}
              </button>
            )}
          </div>
        </td>
        <td className="whitespace-nowrap px-4 py-2">
          {getRawEventCount(event)}
        </td>
      </tr>
      {canExpand && isExpanded && (
        <tr className="bg-muted/20">
          <td colSpan={4} className="px-4 py-3">
            <div className="rounded-md border bg-background p-3">
              <p className="mb-2 text-xs font-medium text-muted-foreground">
                {getRawEventFullTextHeader(event)}
              </p>
              <RenderableFullText text={fullText} renderMode="plain" />
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export default function DocumentLogsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const documentId = params.id as string;
  const returnTo = searchParams.get('returnTo');
  const certificateId = searchParams.get('certificateId');
  const certificateToken = searchParams.get('certificateToken');
  const publicCertificateId = searchParams.get('publicCertificateId') || certificateId;
  const isPublicCertificateLogs = Boolean(certificateToken);
  const backHref = isPublicCertificateLogs && certificateToken
    ? `/verify/${certificateToken}`
    : returnTo === 'certificate' && certificateId
    ? `/certificates/${certificateId}`
    : `/documents/${documentId}`;
  const { checkAuth } = useAuthStore();
  usePublicDocumentToken(documentId);

  const [documentTitle, setDocumentTitle] = useState<string>('Document');
  const [timelineItems, setTimelineItems] = useState<DocumentEventTimelineItem[]>([]);
  const [timelineSummary, setTimelineSummary] = useState<DocumentEventTimelineSummary>(EMPTY_SUMMARY);
  const [aiLogs, setAiLogs] = useState<AIInteractionLog[]>([]);
  const [certificateAnomalyFlags, setCertificateAnomalyFlags] = useState<WritingAnomalyFlag[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (isPublicCertificateLogs) return;
    checkAuth();
  }, [checkAuth, isPublicCertificateLogs]);

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      if (isPublicCertificateLogs && certificateToken) {
        const headers: HeadersInit = {};
        const accessCode = publicCertificateId
          ? TokenManager.getPublicCertificateAccessToken(publicCertificateId)
          : null;
        if (accessCode) {
          headers['X-Access-Code'] = accessCode;
        }

        const response = await fetch(
          `${API_URL}/certificates/verify/${encodeURIComponent(certificateToken)}/logs?limit=10000`,
          { headers }
        );
        const data = await response.json().catch(() => ({}));

        if (!response.ok) {
          throw new Error(
            data?.message ||
            data?.error ||
            data?.data?.message ||
            'Failed to load certificate logs'
          );
        }

        const payload = data.data || {};
        const timelineData = payload.timeline || {};
        setDocumentTitle(payload.title || 'Certificate logs');
        setTimelineItems(Array.isArray(timelineData.items) ? timelineData.items : []);
        setTimelineSummary(timelineData.summary || EMPTY_SUMMARY);
        setAiLogs(Array.isArray(payload.aiLogs) ? payload.aiLogs : []);
        setCertificateAnomalyFlags(Array.isArray(payload.anomalyFlags) ? payload.anomalyFlags : []);
        return;
      }

      const [docRes, timelineRes, aiLogsRes, certificateRes] = await Promise.all([
        apiClient.get(`/documents/${documentId}`),
        apiClient.get(`/documents/${documentId}/events/timeline?limit=10000`),
        apiClient
          .get(`/ai/logs?documentId=${documentId}&limit=50&offset=0`)
          .catch(() => ({ data: { data: [] } })),
        certificateId
          ? apiClient.get(`/certificates/${certificateId}`).catch(() => null)
          : Promise.resolve(null),
      ]);

      setDocumentTitle(docRes.data.data?.document?.title || 'Document');

      const timelineData = timelineRes.data.data || {};
      setTimelineItems(Array.isArray(timelineData.items) ? timelineData.items : []);
      setTimelineSummary(timelineData.summary || EMPTY_SUMMARY);

      const aiLogData = aiLogsRes.data.data || [];
      setAiLogs(Array.isArray(aiLogData) ? aiLogData : []);
      const certificate = certificateRes?.data?.data?.certificate;
      setCertificateAnomalyFlags(Array.isArray(certificate?.anomalyFlags) ? certificate.anomalyFlags : []);
    } catch (err: any) {
      setError(err.response?.data?.message || err.message || 'Failed to load logs');
    } finally {
      setIsLoading(false);
    }
  }, [certificateId, certificateToken, documentId, isPublicCertificateLogs, publicCertificateId]);

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

  const aiLogsById = useMemo(() => {
    return new Map(aiLogs.map((log) => [log.id, log]));
  }, [aiLogs]);

  const timelineDisplayItems = useMemo<TimelineDisplayItem[]>(() => {
    const visibleAILogIds = new Set(visibleAILogs.map((log) => log.id));

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
        if (WRITING_TIMELINE_KINDS.has(item.kind) || isPageVisibilityTimelineItem(item)) {
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
        .filter((event) => !isDuplicateAIQueryRawEvent(event, visibleAILogIds))
        .map((event) => annotateRawEventForAnomaly(event, certificateAnomalyFlags))
        .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

      if (rawEvents.length === 0) {
        hiddenBuffer = [];
        return;
      }

      if (rawEvents.length >= FOLD_POINT_MIN_RAW_EVENT_COUNT) {
        displayItems.push(makeFoldPoint(hiddenBuffer, rawEvents));
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
  }, [certificateAnomalyFlags, timelineItems, visibleAILogs]);

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
        <Button
          variant="ghost"
          size="sm"
          className="-ml-2 px-2 text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={() => router.push(backHref)}
        >
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
                    const summary = summarizeFoldPoint(historyItem.rawEvents);

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
                            <RawEventTableRow
                              key={event.id}
                              event={event}
                              aiLogsById={aiLogsById}
                              isExpanded={expandedIds.has(event.id)}
                              onToggleExpanded={() => toggleExpanded(event.id)}
                            />
                          ))}
                      </Fragment>
                    );
                  }

                  if (historyItem.kind === 'raw') {
                    return (
                      <RawEventTableRow
                        key={historyItem.id}
                        event={historyItem.event}
                        aiLogsById={aiLogsById}
                        isExpanded={expandedIds.has(historyItem.id)}
                        onToggleExpanded={() => toggleExpanded(historyItem.id)}
                      />
                    );
                  }

                  if (historyItem.kind === 'timeline') {
                    const item = historyItem.item;
                    const colorStyle = TIMELINE_COLORS[item.kind] || DEFAULT_TIMELINE_COLOR;
                    const icon = TIMELINE_ICONS[item.kind] || null;
                    const canExpandText = canExpandTimelineText(item);
                    const isExpanded = expandedIds.has(item.id);
                    const expandButtonLabel =
                      item.kind === 'delete' && item.metadata?.deleteScope === 'all_text'
                        ? isExpanded ? 'Hide all text' : 'View all text'
                        : isExpanded ? 'Hide full text' : 'View full text';

                    return (
                      <Fragment key={item.id}>
                        <tr className="hover:bg-muted/30">
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {formatTimeRange(item)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-flex whitespace-nowrap items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium"
                              style={colorStyle}
                            >
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
                                  {expandButtonLabel}
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
                                      <RenderableFullText
                                        text={getReplacementBeforeText(item)}
                                        renderMode={getTimelineTextRenderMode(item)}
                                        className="rounded border bg-muted/20 p-3"
                                      />
                                    </div>
                                    <div>
                                      <p className="mb-1 text-xs font-medium text-muted-foreground">
                                        After
                                      </p>
                                      <RenderableFullText
                                        text={getReplacementAfterText(item)}
                                        renderMode={getTimelineTextRenderMode(item)}
                                        className="rounded border bg-muted/20 p-3"
                                      />
                                    </div>
                                  </div>
                                ) : (
                                  <RenderableFullText
                                    text={getTimelineSourceText(item)}
                                    renderMode={getTimelineTextRenderMode(item)}
                                  />
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
                  const isChatLog = isChatAILog(log);
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
                            {formatAILogTime(log.timestamp)}
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <span
                            className="inline-flex whitespace-nowrap items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium"
                            style={AI_LOG_BADGE_COLOR}
                          >
                            <Sparkles className="h-3 w-3" />
                            {label}
                          </span>
                        </td>
                        <td className="max-w-[760px] px-4 py-3 text-sm text-foreground">
                          <div className="flex min-w-0 items-center gap-3">
                            <span className="block min-w-0 flex-1 truncate">
                              {formatSnippet(detailBeforeText || log.query, 'AI interaction')}
                            </span>
                            {canExpand && (
                              <button
                                type="button"
                                className="shrink-0 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleExpanded(log.id);
                                }}
                                aria-expanded={isExpanded}
                              >
                                {isExpanded ? 'Hide Full Text' : 'View Full Text'}
                              </button>
                            )}
                          </div>
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
                                {isChatLog ? (
                                  <div className="rounded border bg-background p-3 text-sm">
                                    <MarkdownContent>{afterText || '—'}</MarkdownContent>
                                  </div>
                                ) : (
                                  <div className="rounded border bg-background p-3 text-sm whitespace-pre-wrap">
                                    {afterText || '—'}
                                  </div>
                                )}
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

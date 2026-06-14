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
  EyeOff,
  FileText,
  Keyboard,
  Loader2,
  MousePointer2,
  RefreshCcw,
  RefreshCw,
  ShieldAlert,
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
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ANALYTICS_CHART_COLORS } from '@/lib/analytics-palette';
import { buildCertificateVerifyUrl } from '@/lib/certificate-url';
import { formatDateTime } from '@/lib/utils';
import { getReviewSignals } from '@/lib/review-signals';
import { getCopiedTextFromEventMetadata } from '@humanly/shared';
import type {
  AIInteractionLog,
  DocumentEventTimelineItem,
  DocumentEventTimelineRawEvent,
  WritingAnomalyFlag,
} from '@humanly/shared';

interface Submission {
  id: string;
  userEmail?: string | null;
  documentId: string;
  documentTitle?: string | null;
  certificateVerificationToken?: string | null;
  submittedAt: string;
  anomalyFlags?: WritingAnomalyFlag[] | null;
  aiPolicyRefusalCount?: number;
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

const LONG_TEXT_PREVIEW_THRESHOLD = 110;
const LINE_BREAK_COLLAPSE_THRESHOLD = 4;
const MINOR_ACTIVITY_FOLD_MIN_RAW_EVENT_COUNT = 1;
const FULL_TEXT_TOGGLE_LABELS = {
  view: 'View full text',
  hide: 'Hide full text',
} as const;
const ALL_TEXT_TOGGLE_LABELS = {
  view: 'View all text',
  hide: 'Hide all text',
} as const;

function getFullTextToggleLabel(isExpanded: boolean, scope: 'full' | 'all' = 'full') {
  const labels = scope === 'all' ? ALL_TEXT_TOGGLE_LABELS : FULL_TEXT_TOGGLE_LABELS;
  return isExpanded ? labels.hide : labels.view;
}

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
const SELECTION_BADGE_COLOR: CSSProperties = {
  backgroundColor: '#F1EEE8',
  borderColor: '#D7CDC0',
  color: '#6B6255',
};

const FORMAT_EVENT_TYPES = new Set<string>([
  'font-family-change',
  'font-size-change',
  'text-color-change',
  'highlight-color-change',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'code',
  'subscript',
  'superscript',
  'heading-change',
  'list-create',
  'list-delete',
  'list-indent',
  'list-outdent',
  'list-item-check',
  'alignment-change',
  'line-spacing-change',
  'indent-change',
  'clear-formatting',
]);

const MINOR_RAW_EVENT_TYPES = new Set<string>([
  'select',
  'selection',
  'focus',
  'blur',
  'ai_panel_open',
  'ai_panel_close',
  'ai_response_received',
  'ai_suggestion_shown',
  'ai_suggestion_accepted',
  'ai_suggestion_rejected',
  'ai_logs_viewed',
  'ai_logs_exported',
  'keyup',
  'find-open',
  'find-search',
  'find-next',
  'find-previous',
  'replace',
  'replace-all',
  'find-close',
  'contextmenu',
]);

const SYNTHETIC_LOG_ANOMALY_CODES = new Set<string>([
  'rapid_tab_switching',
]);

const FLAG_BADGE_STYLES: Record<WritingAnomalyFlag['severity'], string> = {
  info: 'border-[#c8d1dc] bg-[#eef1f4] text-[#576777]',
  warning: 'border-[#d8ccba] bg-[#f2efe8] text-[#6a6256]',
  critical: 'border-[#d6c5c7] bg-[#f2edee] text-[#6f5d61]',
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
  if (eventType === 'copy' || eventType === 'cut' || eventType === 'select' || eventType === 'selection') {
    return SELECTION_BADGE_COLOR;
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
  grammar: 'Fix grammar',
  improve: 'Improve writing',
  simplify: 'Simplify',
  formal: 'Make formal',
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

type AnomalyDisplayItem = {
  kind: 'anomaly';
  id: string;
  timestamp: string | Date;
  flag: WritingAnomalyFlag;
};

type TimelineDisplayItem = HistoryItem | FoldPointItem | RawEventDisplayItem | AnomalyDisplayItem;

type RawEventDisplayOverride = {
  code: 'rapid_text_accumulation';
  detail: string;
  count: string;
};

type DisplayRawEvent = DocumentEventTimelineRawEvent & {
  displayAnomaly?: RawEventDisplayOverride;
};

const formatDuration = (secondsValue: number) => {
  const seconds = Math.max(0, Math.floor(secondsValue || 0));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};

function formatDurationMs(ms?: unknown) {
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
  const duration = formatDurationMs(metadata?.hiddenDurationMs);
  return duration ? `Returned after ${duration}` : 'Returned to the workspace';
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
  if (isChatAILog(log)) return 'Chat';
  if (log.queryType === 'grammar_check') return 'Fix grammar';
  if (log.query.toLowerCase().includes('simplify')) return 'Simplify';
  if (log.query.toLowerCase().includes('formal')) return 'Make formal';
  if (log.query.toLowerCase().includes('improve')) return 'Improve writing';
  return AI_ACTION_LABELS[log.queryType] || log.queryType;
}

function getAIActionLabel(actionType: string) {
  return AI_ACTION_LABELS[actionType] || humanizeCode(actionType);
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
    return <span className="italic">&quot;{formatSnippet(text, fallback, maxTextCharacters)}&quot;</span>;
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
            <span className="min-w-0 truncate italic">&quot;{part.text}&quot;</span>
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

function isFormattingRawEvent(event: DocumentEventTimelineRawEvent) {
  return FORMAT_EVENT_TYPES.has(event.eventType) || event.eventType.startsWith('format_');
}

function isMinorRawEvent(event: DocumentEventTimelineRawEvent) {
  if (isAnomalyRawEvent(event)) return false;
  return MINOR_RAW_EVENT_TYPES.has(event.eventType) || isFormattingRawEvent(event);
}

function isSelectionRawEvent(event: DocumentEventTimelineRawEvent) {
  const eventType = event.eventType as string;
  return eventType === 'select' || eventType === 'selection';
}

function getSelectedRawEventText(event: DocumentEventTimelineRawEvent) {
  const selectedText = event.metadata?.selectedText;
  if (typeof selectedText === 'string') return selectedText;

  const selection = event.metadata?.selection;
  if (selection && typeof selection === 'object' && 'text' in selection) {
    const selectionText = (selection as { text?: unknown }).text;
    return typeof selectionText === 'string' ? selectionText : '';
  }

  return '';
}

function humanizeCode(value: string) {
  return value.replace(/[_-]+/g, ' ');
}

function getAnomalyTagLabel(code: string) {
  if (code === 'chat_refusal' || code === 'ai_policy_refusal') return 'chat refusal';
  if (code === 'blocked_copy_paste_attempt' || code === 'paste_policy_violation') return 'blocked copy-paste';
  if (code === 'rapid_text_accumulation') return 'rapid text accumulation';
  if (code === 'large_paste_volume') return 'large paste volume';
  if (code === 'rapid_tab_switching') return 'rapid tab switching';
  if (code === 'long_or_repeated_away_from_workspace' || code === 'away_from_workspace') {
    return 'away from workspace';
  }
  return humanizeCode(code);
}

function getFormattingTagLabel(eventType: string) {
  const normalizedEventType = eventType.replace(/^format_/, '');
  if (
    [
      'bold',
      'italic',
      'underline',
      'strikethrough',
      'code',
      'subscript',
      'superscript',
    ].includes(normalizedEventType)
  ) {
    return 'text style';
  }

  if (
    [
      'font-family-change',
      'font-size-change',
      'text-color-change',
      'highlight-color-change',
    ].includes(normalizedEventType)
  ) {
    return 'appearance';
  }

  return 'structure';
}

function getFormattingDetail(eventType: string) {
  const normalizedEventType = eventType.replace(/^format_/, '');
  const details: Record<string, string> = {
    bold: 'Bold formatting applied',
    italic: 'Italic formatting applied',
    underline: 'Underline formatting applied',
    strikethrough: 'Strikethrough formatting applied',
    code: 'Inline code formatting applied',
    subscript: 'Subscript formatting applied',
    superscript: 'Superscript formatting applied',
    'heading-change': 'Heading style changed',
    'font-family-change': 'Font family changed',
    'font-size-change': 'Font size changed',
    'text-color-change': 'Text color changed',
    'highlight-color-change': 'Highlight color changed',
    'list-create': 'List created',
    'list-delete': 'List removed',
    'list-indent': 'List indented',
    'list-outdent': 'List outdented',
    'list-item-check': 'Checklist item changed',
    'alignment-change': 'Alignment changed',
    'line-spacing-change': 'Line spacing changed',
    'indent-change': 'Indent changed',
    'clear-formatting': 'Formatting cleared',
  };

  return details[normalizedEventType] || `${humanizeCode(normalizedEventType)} changed`;
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

function getCopiedText(event: DocumentEventTimelineRawEvent) {
  return event.eventType === 'copy'
    ? getCopiedTextFromEventMetadata(event.metadata)
    : '';
}

function canExpandCopiedText(copiedText: string) {
  return isMultilineText(copiedText) || normalizeVisibleText(copiedText).length > LONG_TEXT_PREVIEW_THRESHOLD;
}

function getMultilineCopiedTextSummary(text: string) {
  const lineCount = countTextLines(text);
  const lineLabel = `${lineCount} line${lineCount === 1 ? '' : 's'} copied`;
  const snippet = formatSnippet(text, '', LONG_TEXT_PREVIEW_THRESHOLD);

  return snippet ? `${lineLabel} · "${snippet}"` : lineLabel;
}

function renderCopiedTextDetail(copiedText: string) {
  if (!copiedText) return 'Copied text';
  if (isMultilineText(copiedText)) return getMultilineCopiedTextSummary(copiedText);

  return <>{renderTextPreview(copiedText, '', LONG_TEXT_PREVIEW_THRESHOLD)} copied</>;
}

function getFlagEvidenceString(flag: WritingAnomalyFlag, key: string) {
  const value = flag.evidence?.[key];
  return typeof value === 'string' ? value : '';
}

function getFlagEvidenceNumber(flag: WritingAnomalyFlag, key: string) {
  const value = flag.evidence?.[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function shouldRenderSyntheticAnomalyFlag(flag: WritingAnomalyFlag) {
  return SYNTHETIC_LOG_ANOMALY_CODES.has(flag.code);
}

function getSyntheticAnomalyTimestamp(flag: WritingAnomalyFlag) {
  return (
    getFlagEvidenceString(flag, 'windowEnd') ||
    getFlagEvidenceString(flag, 'windowStart') ||
    getFlagEvidenceString(flag, 'untrackedTimestamp') ||
    getFlagEvidenceString(flag, 'focusTimestamp') ||
    new Date().toISOString()
  );
}

function getSyntheticAnomalyCount(flag: WritingAnomalyFlag) {
  if (flag.code === 'rapid_tab_switching') {
    const switchCount = getFlagEvidenceNumber(flag, 'switchCount');
    const duration = getFlagEvidenceString(flag, 'windowDuration');
    if (switchCount != null && duration) return `${switchCount} switches · ${duration}`;
    if (switchCount != null) return `${switchCount} switches`;
  }

  return '—';
}

function getSyntheticAnomalyDetail(flag: WritingAnomalyFlag) {
  return flag.description || flag.label || getAnomalyTagLabel(flag.code);
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
  if (event.eventType === 'copy') return getCopiedText(event);
  if (isPolicyRefusalEvent(event)) return getPolicyRefusalQuestion(event, aiLogsById);
  if (event.eventType === 'cut' || isSelectionRawEvent(event)) {
    return getSelectedRawEventText(event);
  }
  return '';
}

function getRawEventFullTextHeader(event: DocumentEventTimelineRawEvent) {
  if (isPolicyRefusalEvent(event)) return 'Refused chat request';
  if (event.eventType === 'copy') return 'Copied text';
  if (event.eventType === 'cut') return 'Cut text';
  if (isSelectionRawEvent(event)) return 'Selected text';
  return 'Event detail';
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

function getTimelineLineBreakCount(item: DocumentEventTimelineItem) {
  const metadataCount = item.metadata?.lineBreakCount;
  return typeof metadataCount === 'number' && metadataCount > 0
    ? metadataCount
    : item.charCount || 1;
}

function renderTimelineDetail(item: DocumentEventTimelineItem) {
  const pageVisibilityEventType = getTimelinePageVisibilityEventType(item);
  if (pageVisibilityEventType === 'page_hidden') {
    return 'The writing workspace was no longer visible';
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
    return item.text ? <>Deleted {renderTextPreview(item.text, '')}</> : 'Text deleted';
  }

  return formatSnippet(item.text, item.label);
}

function getTimelineActivityLabel(item: DocumentEventTimelineItem) {
  const pageVisibilityEventType = getTimelinePageVisibilityEventType(item);
  if (pageVisibilityEventType === 'page_hidden') return 'Left workspace';
  if (pageVisibilityEventType === 'page_visible') return 'Returned';

  if (item.kind === 'typing_burst') return 'Typed';
  if (item.kind === 'line_break') {
    return getTimelineLineBreakCount(item) > 1 ? 'Blank line' : 'Line break';
  }
  if (item.kind === 'ai_insert') return 'AI inserted';
  if (item.kind === 'replace') return 'Replaced';
  if (item.kind === 'paste') return 'Pasted';
  if (item.kind === 'delete') {
    return 'Delete';
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

  if (event.eventType === 'copy') {
    return renderCopiedTextDetail(getCopiedText(event));
  }

  if (event.eventType === 'cut') {
    const selectedText = getSelectedRawEventText(event);
    return selectedText ? <>Cut {renderTextPreview(selectedText, '')}</> : 'Cut selected text';
  }

  if (event.eventType === 'ai_query_sent') {
    const query = getRawEventMetadataText(event, 'query');
    return query ? <>Asked {renderTextPreview(query, 'AI question')}</> : 'Asked AI';
  }
  if (event.eventType === 'ai_response_received') return null;
  if (event.eventType === 'ai_panel_open') return null;
  if (event.eventType === 'ai_panel_close') return null;

  if (event.eventType === 'page_hidden') return 'The writing workspace was no longer visible';
  if (event.eventType === 'page_visible') return getPageVisibleDetail(event.metadata);
  if (event.eventType === 'focus') return 'Editor focused';
  if (event.eventType === 'blur') return 'Editor lost focus';
  if (isSelectionRawEvent(event)) {
    const selectedText = getSelectedRawEventText(event);
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

    return <>Selected {renderTextPreview(selectedText, '')}</>;
  }

  if (isFormattingRawEvent(event)) return getFormattingDetail(event.eventType);

  if (event.eventType === 'ai_selection_action') {
    const actionType = getRawEventMetadataText(event, 'actionType');
    const originalText = getRawEventMetadataText(event, 'originalText');
    return originalText
      ? renderTextPreview(originalText, `${getRawEventDisplayType(event)} applied to selected text`)
      : `${actionType ? getAIActionLabel(actionType) : 'AI quick action'} applied`;
  }

  if (event.eventType === 'ai_insert_from_chat') return 'Inserted chat response at cursor';

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
  return '—';
}

function getRawEventDisplayType(event: DocumentEventTimelineRawEvent) {
  if ((event as DisplayRawEvent).displayAnomaly) {
    return getAnomalyTagLabel((event as DisplayRawEvent).displayAnomaly?.code || event.eventType);
  }
  if (isPolicyRefusalEvent(event)) return 'chat refusal';
  if (isBlockedCopyPasteAttempt(event)) return 'blocked copy-paste';
  if (isFormattingRawEvent(event)) return 'Formatted';
  if (event.eventType === 'page_hidden') return 'Left workspace';
  if (event.eventType === 'page_visible') return 'Returned';
  if (event.eventType === 'ai_query_sent') return 'Chat';
  if (event.eventType === 'ai_response_received') return 'AI response';
  if (event.eventType === 'ai_panel_open') return 'AI panel opened';
  if (event.eventType === 'ai_panel_close') return 'AI panel closed';
  if (event.eventType === 'ai_selection_action') {
    const actionType = getRawEventMetadataText(event, 'actionType');
    return actionType ? getAIActionLabel(actionType) : 'AI quick action';
  }
  if (event.eventType === 'ai_insert_from_chat') return 'AI inserted';
  if (event.eventType === 'copy') return 'Copied';
  if (event.eventType === 'cut') return 'Cut';
  if (isSelectionRawEvent(event)) return 'Selected';
  if (event.eventType === 'focus') return 'Focused';
  if (event.eventType === 'blur') return 'Unfocused';
  if (event.eventType === 'input' || event.eventType === 'keydown') return 'Typed';
  if (event.eventType === 'delete') return 'Delete';
  return humanizeCode(event.eventType);
}

function getRawEventActivityLabel(event: DocumentEventTimelineRawEvent) {
  return isAnomalyRawEvent(event) ? 'Anomaly' : getRawEventDisplayType(event);
}

function getRawEventActivityIcon(event: DocumentEventTimelineRawEvent) {
  if (isAnomalyRawEvent(event)) return <AlertCircle className="h-3 w-3" />;
  if (event.eventType === 'copy' || event.eventType === 'cut') return <Copy className="h-3 w-3" />;
  if (isSelectionRawEvent(event)) return <MousePointer2 className="h-3 w-3" />;
  if (event.eventType === 'blur' || event.eventType === 'page_hidden') return <EyeOff className="h-3 w-3" />;
  if (event.eventType === 'focus') return <Type className="h-3 w-3" />;
  if (event.eventType.startsWith('ai_')) return <Sparkles className="h-3 w-3" />;
  if (event.eventType === 'delete') return <Trash2 className="h-3 w-3" />;
  return null;
}

function getRawEventActivityStyle(event: DocumentEventTimelineRawEvent): CSSProperties | undefined {
  if (isAnomalyRawEvent(event)) return ANOMALY_BADGE_COLOR;
  if (event.eventType === 'copy' || event.eventType === 'cut' || isSelectionRawEvent(event)) {
    return SELECTION_BADGE_COLOR;
  }
  if (event.eventType.startsWith('ai_')) return AI_LOG_BADGE_COLOR;
  if (isFormattingRawEvent(event)) return DEFAULT_TIMELINE_COLOR;
  if (event.eventType === 'focus' || event.eventType === 'blur') return TIMELINE_COLORS.line_break;
  return undefined;
}

function getRawEventCount(event: DocumentEventTimelineRawEvent) {
  if ((event as DisplayRawEvent).displayAnomaly) {
    return (event as DisplayRawEvent).displayAnomaly?.count || '—';
  }
  if (isPolicyRefusalEvent(event)) return '1 refusal';
  if (isBlockedCopyPasteAttempt(event)) return '1 attempt';
  if (event.eventType === 'copy') {
    const copiedText = getCopiedText(event);
    return copiedText ? `${copiedText.length.toLocaleString()} char${copiedText.length === 1 ? '' : 's'}` : '—';
  }
  if (event.eventType === 'cut' || isSelectionRawEvent(event)) {
    const selectedLength = getSelectedRawEventText(event).length;
    return selectedLength > 0 ? `${selectedLength} char${selectedLength === 1 ? '' : 's'}` : '—';
  }
  return event.cursorPosition == null ? '—' : `Cursor ${event.cursorPosition}`;
}

function getRawEventDetailTag(event: DocumentEventTimelineRawEvent) {
  if ((event as DisplayRawEvent).displayAnomaly) {
    return getAnomalyTagLabel((event as DisplayRawEvent).displayAnomaly?.code || event.eventType);
  }

  if (isPolicyRefusalEvent(event)) return 'chat refusal';
  if (isBlockedCopyPasteAttempt(event)) return 'blocked copy-paste';
  if (isFormattingRawEvent(event)) return getFormattingTagLabel(event.eventType);
  return null;
}

function canExpandRawEvent(event: DocumentEventTimelineRawEvent, aiLogsById?: Map<string, AIInteractionLog>) {
  if (isPolicyRefusalEvent(event)) {
    return normalizeVisibleText(getPolicyRefusalQuestion(event, aiLogsById)).length > LONG_TEXT_PREVIEW_THRESHOLD;
  }

  if (event.eventType === 'copy') {
    return canExpandCopiedText(getCopiedText(event));
  }

  if (event.eventType === 'cut' || isSelectionRawEvent(event)) {
    return normalizeVisibleText(getSelectedRawEventText(event)).length > LONG_TEXT_PREVIEW_THRESHOLD;
  }

  return false;
}

function getHiddenRawEventCategory(event: DocumentEventTimelineRawEvent) {
  const eventType = event.eventType as string;

  if (eventType === 'focus' || eventType === 'blur') {
    return 'focus';
  }

  if (isPageVisibilityEventType(eventType)) {
    return 'workspace';
  }

  if (eventType === 'select' || eventType === 'selection') {
    return 'selection';
  }

  if (eventType.startsWith('ai_')) {
    return 'AI system';
  }

  if (eventType === 'keydown' && (event.keyCode === 'Enter' || event.keyChar === 'Enter')) {
    return 'line break';
  }

  if (isFormattingRawEvent(event)) {
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

function makeRawEventsFoldPoint(rawEvents: DisplayRawEvent[]): FoldPointItem {
  const sortedRawEvents = [...rawEvents].sort(
    (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
  );
  const oldest = sortedRawEvents[sortedRawEvents.length - 1];
  const newest = sortedRawEvents[0];

  return {
    kind: 'fold',
    id: `fold-minor-${newest?.id || 'empty'}-${oldest?.id || 'empty'}`,
    timestamp: newest?.timestamp || new Date().toISOString(),
    startTimestamp: oldest?.timestamp || newest?.timestamp || new Date().toISOString(),
    endTimestamp: newest?.timestamp || oldest?.timestamp || new Date().toISOString(),
    items: [],
    rawEvents: sortedRawEvents,
    rawEventCount: sortedRawEvents.length,
  };
}

function formatFoldTimeRange(item: FoldPointItem) {
  const startText = formatTimelineTime(item.startTimestamp);
  const endText = formatTimelineTime(item.endTimestamp);
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
  const canExpand = canExpandRawEvent(event, aiLogsById);
  const fullText = getRawEventFullText(event, aiLogsById);
  const activityStyle = getRawEventActivityStyle(event);
  const activityIcon = getRawEventActivityIcon(event);
  const detailTag = getRawEventDetailTag(event);

  return (
    <>
      <tr className="bg-muted/20 text-xs text-muted-foreground hover:bg-muted/30">
        <td className="whitespace-nowrap px-4 py-2.5">
          {formatRawEventTime(event.timestamp)}
        </td>
        <td className="px-4 py-2.5">
          <span
            className="inline-flex whitespace-nowrap items-center gap-1 rounded border bg-background px-2 py-0.5 font-medium"
            style={activityStyle}
          >
            {activityIcon}
            {getRawEventActivityLabel(event)}
          </span>
        </td>
        <td className="max-w-[760px] px-4 py-2.5">
          <div className="flex min-w-0 items-center gap-2">
            {detailTag && (
              <span
                className="inline-flex shrink-0 items-center rounded border px-2 py-0.5 font-medium"
                style={isAnomalyRawEvent(event) ? ANOMALY_BADGE_COLOR : getRawEventColor(event.eventType)}
              >
                {detailTag}
              </span>
            )}
            {detail && <span className="min-w-0 truncate">{detail}</span>}
            {canExpand && onToggleExpanded && (
              <button
                type="button"
                className="shrink-0 text-xs font-medium text-muted-foreground underline underline-offset-4 hover:text-foreground"
                onClick={onToggleExpanded}
                aria-expanded={isExpanded}
              >
                {getFullTextToggleLabel(isExpanded)}
              </button>
            )}
          </div>
        </td>
        <td className="whitespace-nowrap px-4 py-2.5">
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
              <div className="max-h-80 overflow-auto whitespace-pre-wrap break-words text-sm">
                {fullText || '—'}
              </div>
            </div>
          </td>
        </tr>
      )}
    </>
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
  const reviewSignals = useMemo(
    () => getReviewSignals(submission?.anomalyFlags),
    [submission?.anomalyFlags]
  );

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
    return new Map(visibleAILogs.map((log) => [log.id, log]));
  }, [visibleAILogs]);

  const timelineDisplayItems = useMemo<TimelineDisplayItem[]>(() => {
    const visibleAILogIds = new Set(visibleAILogs.map((log) => log.id));
    const anomalyFlags = Array.isArray(submission?.anomalyFlags) ? submission.anomalyFlags : [];

    type TimelineSourceItem =
      | {
          kind: 'primary';
          timestamp: string | Date;
          item: HistoryItem;
        }
      | {
          kind: 'raw';
          timestamp: string | Date;
          event: DisplayRawEvent;
        }
      | {
          kind: 'minor';
          timestamp: string | Date;
          events: DisplayRawEvent[];
        }
      | {
          kind: 'anomaly';
          timestamp: string | Date;
          flag: WritingAnomalyFlag;
        };

    const visibleTimelineItems = timelineItems.filter(
      (item) => !isAIAppliedMirrorReplace(item, visibleAILogs)
    );

    const sourceItems: TimelineSourceItem[] = [
      ...visibleTimelineItems.flatMap((item): TimelineSourceItem[] => {
        if (WRITING_TIMELINE_KINDS.has(item.kind) || isPageVisibilityTimelineItem(item)) {
          return [{
            kind: 'primary' as const,
            timestamp: item.timestamp,
            item: {
              kind: 'timeline' as const,
              id: item.id,
              timestamp: item.timestamp,
              item,
            },
          }];
        }

        const rawEvents = item.rawEvents
          .filter((event) => {
            if (event.eventType !== 'ai_query_sent') return true;
            const logId = event.metadata?.logId;
            return !(typeof logId === 'string' && visibleAILogIds.has(logId));
          })
          .map((event) => annotateRawEventForAnomaly(event, anomalyFlags))
          .sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
        const promotedRawEvents = rawEvents.filter((event) => !isMinorRawEvent(event));
        const minorRawEvents = rawEvents.filter(isMinorRawEvent);

        return [
          ...promotedRawEvents.map((event) => ({
            kind: 'raw' as const,
            timestamp: event.timestamp,
            event,
          })),
          ...(minorRawEvents.length > 0
            ? [{
                kind: 'minor' as const,
                timestamp: minorRawEvents[0].timestamp,
                events: minorRawEvents,
              }]
            : []),
        ];
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
      ...anomalyFlags
        .filter(shouldRenderSyntheticAnomalyFlag)
        .map((flag) => ({
          kind: 'anomaly' as const,
          timestamp: getSyntheticAnomalyTimestamp(flag),
          flag,
        })),
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    const displayItems: TimelineDisplayItem[] = [];
    let hiddenBuffer: DisplayRawEvent[] = [];

    const flushHiddenBuffer = () => {
      if (hiddenBuffer.length === 0) return;

      if (hiddenBuffer.length >= MINOR_ACTIVITY_FOLD_MIN_RAW_EVENT_COUNT) {
        displayItems.push(makeRawEventsFoldPoint(hiddenBuffer));
      } else {
        displayItems.push(
          ...hiddenBuffer.map((event) => ({
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
      if (sourceItem.kind === 'minor') {
        hiddenBuffer.push(...sourceItem.events);
        return;
      }

      flushHiddenBuffer();
      if (sourceItem.kind === 'raw') {
        displayItems.push({
          kind: 'raw',
          id: `raw-${sourceItem.event.id}`,
          timestamp: sourceItem.event.timestamp,
          event: sourceItem.event,
        });
        return;
      }

      if (sourceItem.kind === 'anomaly') {
        displayItems.push({
          kind: 'anomaly',
          id: `anomaly-${sourceItem.flag.code}-${new Date(sourceItem.timestamp).getTime()}`,
          timestamp: sourceItem.timestamp,
          flag: sourceItem.flag,
        });
        return;
      }

      displayItems.push(sourceItem.item);
    });

    flushHiddenBuffer();

    return displayItems;
  }, [submission?.anomalyFlags, timelineItems, visibleAILogs]);

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
            <a href={buildCertificateVerifyUrl(submission.certificateVerificationToken)}>
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

      {!error && submission && (
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ShieldAlert className="h-4 w-4 text-muted-foreground" />
              Review Signals
            </CardTitle>
          </CardHeader>
          <CardContent>
            {reviewSignals.length === 0 && !(submission.aiPolicyRefusalCount || 0) ? (
              <p className="text-sm text-muted-foreground">
                No advisory review signals were detected for this submission certificate.
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {reviewSignals.map((flag, index) => (
                  <Badge
                    key={`${flag.code}-${index}`}
                    variant="outline"
                    className={`capitalize ${FLAG_BADGE_STYLES[flag.severity]}`}
                    title={flag.description}
                  >
                    {flag.severity} · {flag.label}
                  </Badge>
                ))}
                {(submission.aiPolicyRefusalCount || 0) > 0 &&
                  !reviewSignals.some((flag) => flag.code === 'chat_refusal') && (
                    <Badge
                      variant="outline"
                      className="border-[#B56F5C]/35 bg-[#B56F5C]/10 text-[#6E3F35]"
                      title="In-platform AI refused a request because it conflicted with the writing policy."
                    >
                      Chat refusals · {submission.aiPolicyRefusalCount}
                    </Badge>
                  )}
              </div>
            )}
          </CardContent>
        </Card>
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
                      <stop offset="5%" stopColor={ANALYTICS_CHART_COLORS.activityFill} stopOpacity={0.14} />
                      <stop offset="95%" stopColor={ANALYTICS_CHART_COLORS.activityFill} stopOpacity={0} />
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
                    stroke={ANALYTICS_CHART_COLORS.activity}
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
                      const summary = summarizeFoldPoint(historyItem.rawEvents);

                      return (
                        <Fragment key={historyItem.id}>
                          <tr>
                            <td className="whitespace-nowrap px-4 py-2.5 text-xs text-muted-foreground">
                              {formatFoldTimeRange(historyItem)}
                            </td>
                            <td className="px-4 py-2.5">
                              <span
                                className="inline-flex whitespace-nowrap items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium"
                                style={DEFAULT_TIMELINE_COLOR}
                              >
                                <Clock className="h-3 w-3" />
                                Minor activity
                              </span>
                            </td>
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
                                  {isExpanded ? 'Hide details' : 'Show details'}
                                </button>
                                {summary && (
                                  <span className="min-w-0 truncate">
                                    {historyItem.rawEventCount.toLocaleString()} grouped event
                                    {historyItem.rawEventCount === 1 ? '' : 's'} · {summary}
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

                    if (historyItem.kind === 'anomaly') {
                      const tag = getAnomalyTagLabel(historyItem.flag.code);

                      return (
                        <tr key={historyItem.id} className="hover:bg-muted/30">
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {formatRawEventTime(historyItem.timestamp)}
                          </td>
                          <td className="px-4 py-3">
                            <span
                              className="inline-flex whitespace-nowrap items-center gap-1 rounded border px-2 py-0.5 text-xs font-medium"
                              style={ANOMALY_BADGE_COLOR}
                            >
                              <AlertCircle className="h-3 w-3" />
                              Anomaly
                            </span>
                          </td>
                          <td className="max-w-[760px] px-4 py-3 text-sm text-foreground">
                            <div className="flex min-w-0 items-center gap-2">
                              <span
                                className="inline-flex shrink-0 items-center rounded border px-2 py-0.5 text-xs font-medium"
                                style={ANOMALY_BADGE_COLOR}
                              >
                                {tag}
                              </span>
                              <span className="min-w-0 truncate">
                                {getSyntheticAnomalyDetail(historyItem.flag)}
                              </span>
                            </div>
                          </td>
                          <td className="whitespace-nowrap px-4 py-3 text-xs text-muted-foreground">
                            {getSyntheticAnomalyCount(historyItem.flag)}
                          </td>
                        </tr>
                      );
                    }

                    if (historyItem.kind === 'timeline') {
                      const item = historyItem.item;
                      const colorStyle = TIMELINE_COLORS[item.kind] || DEFAULT_TIMELINE_COLOR;
                      const icon = TIMELINE_ICONS[item.kind] || null;
                      const canExpandText = canExpandTimelineText(item);
                      const isExpanded = expandedIds.has(item.id);
                      const fullTextScope =
                        item.kind === 'delete' && item.metadata?.deleteScope === 'all_text' ? 'all' : 'full';
                      const expandButtonLabel = getFullTextToggleLabel(isExpanded, fullTextScope);

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
                              {formatTimelineTime(log.timestamp)}
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
                            <span className="block truncate">
                              {renderTextPreview(detailBeforeText || log.query, 'AI interaction')}
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

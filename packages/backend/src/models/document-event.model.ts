import { query, queryOne } from '../config/database';
import {
  AuthorshipComposition,
  AuthorshipCompositionAiType,
  AuthorshipTextSourceSpan,
  DocumentEvent,
  DocumentEventInsertData,
  DocumentEventQueryFilters,
  AwayFromWorkspaceStats,
  WritingAnomalyThresholds,
} from '@humanly/shared';

const VIEW_LOGS_NAVIGATION_SOURCE = 'view_logs_navigation';

export interface EventMetrics {
  totalEvents: number;
  typingEvents: number;
  pasteEvents: number;
  copyEvents: number;
  cutEvents: number;
  blockedCopyPasteAttempts: number;
  firstEvent: Date | null;
  lastEvent: Date | null;
  editingDurationSeconds: number;
}

export interface AnomalyTypingSpeedFeature {
  maxCharsInWindow: number;
  windowSeconds: number;
  charsPerMinute: number;
}

export interface AnomalyCadenceFeature {
  intervalCount: number;
  meanIntervalMs: number | null;
  stddevIntervalMs: number | null;
  minIntervalMs: number | null;
  maxIntervalMs: number | null;
}

export interface AnomalyTextInfluxFeature {
  eventType: string | null;
  timestamp: Date | null;
  addedCharacters: number;
}

export interface AnomalyFocusInfluxFeature {
  blurTimestamp: Date | null;
  focusTimestamp: Date | null;
  addedCharacters: number;
}

export interface AnomalyClockSkewFeature {
  sessionId: string | null;
  eventCount: number;
  clientSpanSeconds: number;
  serverSpanSeconds: number;
}

export interface DocumentAnomalyAnalysisFeatures {
  totalEvents: number;
  typingEvents: number;
  pasteEvents: number;
  speed: AnomalyTypingSpeedFeature;
  cadence: AnomalyCadenceFeature;
  textInflux: AnomalyTextInfluxFeature;
  focusInflux: AnomalyFocusInfluxFeature;
  awayFromWorkspace: AwayFromWorkspaceStats;
  clockSkew: AnomalyClockSkewFeature;
  copyPaste: {
    pasteEvents: number;
    copyEvents: number;
    cutEvents: number;
    blockedAttempts: number;
    pastedCharacters: number;
    totalCharacters: number;
  };
}

type VisibilityTraceEvent = {
  eventType: 'page_hidden' | 'page_visible';
  timestamp: Date | string;
  awayMs: number;
};

type SourceSpan = {
  text: string;
  source: AuthorshipTextSourceSpan['source'];
  aiType?: AuthorshipCompositionAiType;
};

type TextCompositionEvent = {
  eventType: string;
  textBefore: string | null;
  textAfter: string | null;
  selectionStart: number | null;
  selectionEnd: number | null;
  metadata: Record<string, any> | null;
};

type SourceInfo = {
  source: AuthorshipTextSourceSpan['source'];
  aiType?: AuthorshipCompositionAiType;
};

export interface AuthorshipCompositionMetrics {
  finalTextComposition: AuthorshipComposition;
  finalTextSourceSpans: AuthorshipTextSourceSpan[];
  processInputVolume: AuthorshipComposition;
}

const TEXT_DIFF_MAX_CELLS = 1_000_000;

function emptyComposition(): AuthorshipComposition {
  return {
    typedCharacters: 0,
    pastedCharacters: 0,
    aiAssistedCharacters: 0,
    aiAssistedByType: {
      chatInsert: 0,
      grammar: 0,
      improve: 0,
      simplify: 0,
      formal: 0,
      other: 0,
    },
  };
}

function addCompositionCharacters(
  composition: AuthorshipComposition,
  source: AuthorshipTextSourceSpan['source'],
  count: number,
  aiType: AuthorshipCompositionAiType = 'other'
): void {
  if (count <= 0) return;
  if (source === 'typed') {
    composition.typedCharacters += count;
    return;
  }
  if (source === 'pasted') {
    composition.pastedCharacters += count;
    return;
  }
  composition.aiAssistedCharacters += count;
  composition.aiAssistedByType[aiType] += count;
}

function compositionFromSpans(spans: SourceSpan[]): AuthorshipComposition {
  const composition = emptyComposition();
  for (const span of spans) {
    addCompositionCharacters(composition, span.source, span.text.length, span.aiType);
  }
  return composition;
}

function compactSourceSpans(spans: SourceSpan[]): AuthorshipTextSourceSpan[] {
  const compacted: AuthorshipTextSourceSpan[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const previous = compacted[compacted.length - 1];
    if (previous && previous.source === span.source && previous.aiType === span.aiType) {
      previous.text += span.text;
      continue;
    }
    compacted.push({
      text: span.text,
      source: span.source,
      ...(span.aiType ? { aiType: span.aiType } : {}),
    });
  }
  return compacted;
}

function normalizeAiType(value: unknown): AuthorshipCompositionAiType {
  if (value === 'grammar' || value === 'improve' || value === 'simplify' || value === 'formal') {
    return value;
  }
  return 'other';
}

function getSourceInfo(event: TextCompositionEvent): SourceInfo {
  if (event.eventType === 'paste') {
    return { source: 'pasted' };
  }

  if (event.eventType === 'ai_insert_from_chat') {
    return { source: 'ai_assisted', aiType: 'chatInsert' };
  }

  if (event.eventType === 'ai_selection_action' || event.eventType === 'ai_modification_applied') {
    return {
      source: 'ai_assisted',
      aiType: normalizeAiType(event.metadata?.actionType),
    };
  }

  return { source: 'typed' };
}

function mergeAdjacentSpans(spans: SourceSpan[]): SourceSpan[] {
  const merged: SourceSpan[] = [];
  for (const span of spans) {
    if (!span.text) continue;
    const previous = merged[merged.length - 1];
    if (previous && previous.source === span.source && previous.aiType === span.aiType) {
      previous.text += span.text;
    } else {
      merged.push({ ...span });
    }
  }
  return merged;
}

function textFromSpans(spans: SourceSpan[]): string {
  return spans.map((span) => span.text).join('');
}

function sliceSpans(spans: SourceSpan[], start: number, end: number): SourceSpan[] {
  if (end <= start) return [];
  const result: SourceSpan[] = [];
  let offset = 0;

  for (const span of spans) {
    const spanStart = offset;
    const spanEnd = offset + span.text.length;
    offset = spanEnd;

    if (spanEnd <= start) continue;
    if (spanStart >= end) break;

    const localStart = Math.max(0, start - spanStart);
    const localEnd = Math.min(span.text.length, end - spanStart);
    result.push({
      text: span.text.slice(localStart, localEnd),
      source: span.source,
      aiType: span.aiType,
    });
  }

  return result;
}

function replaceSpanRange(
  spans: SourceSpan[],
  start: number,
  end: number,
  replacement: SourceSpan[]
): SourceSpan[] {
  return mergeAdjacentSpans([
    ...sliceSpans(spans, 0, start),
    ...replacement,
    ...sliceSpans(spans, end, textFromSpans(spans).length),
  ]);
}

function commonPrefixLength(left: string, right: string): number {
  const max = Math.min(left.length, right.length);
  let index = 0;
  while (index < max && left[index] === right[index]) {
    index += 1;
  }
  return index;
}

function commonSuffixLength(left: string, right: string, prefixLength: number): number {
  const max = Math.min(left.length, right.length) - prefixLength;
  let count = 0;
  while (
    count < max &&
    left[left.length - 1 - count] === right[right.length - 1 - count]
  ) {
    count += 1;
  }
  return count;
}

function spansToCharacterSpans(spans: SourceSpan[]): SourceSpan[] {
  const chars: SourceSpan[] = [];
  for (const span of spans) {
    for (let index = 0; index < span.text.length; index += 1) {
      chars.push({
        text: span.text[index],
        source: span.source,
        aiType: span.aiType,
      });
    }
  }
  return chars;
}

function buildInsertedSpan(text: string, sourceInfo: SourceInfo): SourceSpan {
  return {
    text,
    source: sourceInfo.source,
    aiType: sourceInfo.source === 'ai_assisted' ? sourceInfo.aiType || 'other' : undefined,
  };
}

function diffMiddleSpans(
  oldSpans: SourceSpan[],
  oldText: string,
  newText: string,
  sourceInfo: SourceInfo,
  processInputVolume: AuthorshipComposition
): SourceSpan[] {
  if (!newText) return [];
  if (!oldText) {
    addCompositionCharacters(processInputVolume, sourceInfo.source, newText.length, sourceInfo.aiType);
    return [buildInsertedSpan(newText, sourceInfo)];
  }

  if (oldText.length * newText.length > TEXT_DIFF_MAX_CELLS) {
    addCompositionCharacters(processInputVolume, sourceInfo.source, newText.length, sourceInfo.aiType);
    return [buildInsertedSpan(newText, sourceInfo)];
  }

  const oldChars = spansToCharacterSpans(oldSpans);
  const rowCount = oldText.length + 1;
  const colCount = newText.length + 1;
  const dp = Array.from({ length: rowCount }, () => new Uint32Array(colCount));

  for (let i = oldText.length - 1; i >= 0; i -= 1) {
    for (let j = newText.length - 1; j >= 0; j -= 1) {
      if (oldText[i] === newText[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  const result: SourceSpan[] = [];
  let i = 0;
  let j = 0;

  while (i < oldText.length || j < newText.length) {
    if (i < oldText.length && j < newText.length && oldText[i] === newText[j]) {
      result.push(oldChars[i]);
      i += 1;
      j += 1;
      continue;
    }

    if (j < newText.length && (i >= oldText.length || dp[i][j + 1] >= dp[i + 1][j])) {
      const inserted = buildInsertedSpan(newText[j], sourceInfo);
      result.push(inserted);
      addCompositionCharacters(processInputVolume, inserted.source, 1, inserted.aiType);
      j += 1;
      continue;
    }

    i += 1;
  }

  return mergeAdjacentSpans(result);
}

function applyTextTransition(
  spans: SourceSpan[],
  beforeText: string,
  afterText: string,
  sourceInfo: SourceInfo,
  processInputVolume: AuthorshipComposition
): SourceSpan[] {
  const prefix = commonPrefixLength(beforeText, afterText);
  const suffix = commonSuffixLength(beforeText, afterText, prefix);
  const beforeMiddleStart = prefix;
  const beforeMiddleEnd = beforeText.length - suffix;
  const afterMiddleStart = prefix;
  const afterMiddleEnd = afterText.length - suffix;
  const oldMiddleSpans = sliceSpans(spans, beforeMiddleStart, beforeMiddleEnd);
  const oldMiddleText = beforeText.slice(beforeMiddleStart, beforeMiddleEnd);
  const newMiddleText = afterText.slice(afterMiddleStart, afterMiddleEnd);
  const replacement = diffMiddleSpans(oldMiddleSpans, oldMiddleText, newMiddleText, sourceInfo, processInputVolume);

  return replaceSpanRange(spans, beforeMiddleStart, beforeMiddleEnd, replacement);
}

function findEventRange(event: TextCompositionEvent, currentText: string): { start: number; end: number } | null {
  const start = event.selectionStart;
  const end = event.selectionEnd;
  const beforeText = event.textBefore || '';

  if (
    typeof start === 'number' &&
    typeof end === 'number' &&
    start >= 0 &&
    end >= start &&
    end <= currentText.length &&
    (!beforeText || currentText.slice(start, end) === beforeText)
  ) {
    return { start, end };
  }

  if (beforeText) {
    const matchIndex = currentText.indexOf(beforeText);
    if (matchIndex >= 0 && currentText.indexOf(beforeText, matchIndex + 1) === -1) {
      return { start: matchIndex, end: matchIndex + beforeText.length };
    }
  }

  return null;
}

function timestampMs(timestamp: Date | string) {
  return new Date(timestamp).getTime();
}

function timestampIso(timestamp: Date | string) {
  return new Date(timestamp).toISOString();
}

function computeRapidVisibilityWindow(
  events: VisibilityTraceEvent[],
  windowSeconds: number
): Pick<
  AwayFromWorkspaceStats,
  'rapidSwitchCount' | 'rapidSwitchWindowMs' | 'rapidSwitchWindowStart' | 'rapidSwitchWindowEnd'
> {
  const windowMs = Math.max(0, windowSeconds * 1000);
  if (events.length === 0 || windowMs <= 0) {
    return {
      rapidSwitchCount: 0,
      rapidSwitchWindowMs: 0,
      rapidSwitchWindowStart: null,
      rapidSwitchWindowEnd: null,
    };
  }

  let startIndex = 0;
  let bestStartIndex = 0;
  let bestEndIndex = 0;
  let bestCount = 0;

  for (let endIndex = 0; endIndex < events.length; endIndex += 1) {
    const endTime = timestampMs(events[endIndex].timestamp);

    while (
      startIndex < endIndex &&
      endTime - timestampMs(events[startIndex].timestamp) > windowMs
    ) {
      startIndex += 1;
    }

    const windowEvents = events.slice(startIndex, endIndex + 1);
    const hasLeft = windowEvents.some((event) => event.eventType === 'page_hidden');
    const hasReturned = windowEvents.some((event) => event.eventType === 'page_visible');
    const switchCount = windowEvents.length;

    if (hasLeft && hasReturned && switchCount > bestCount) {
      bestCount = switchCount;
      bestStartIndex = startIndex;
      bestEndIndex = endIndex;
    }
  }

  if (bestCount === 0) {
    return {
      rapidSwitchCount: 0,
      rapidSwitchWindowMs: 0,
      rapidSwitchWindowStart: null,
      rapidSwitchWindowEnd: null,
    };
  }

  const start = events[bestStartIndex].timestamp;
  const end = events[bestEndIndex].timestamp;

  return {
    rapidSwitchCount: bestCount,
    rapidSwitchWindowMs: Math.max(0, timestampMs(end) - timestampMs(start)),
    rapidSwitchWindowStart: timestampIso(start),
    rapidSwitchWindowEnd: timestampIso(end),
  };
}

export class DocumentEventModel {
  /**
   * Batch insert document events efficiently using multi-value INSERT
   */
  static async batchInsert(events: DocumentEventInsertData[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    // Process in chunks of 1000 events to avoid query size limits
    const chunkSize = 1000;

    for (let i = 0; i < events.length; i += chunkSize) {
      const chunk = events.slice(i, i + chunkSize);
      await this.insertChunk(chunk);
    }
  }

  /**
   * Insert a chunk of events
   */
  private static async insertChunk(events: DocumentEventInsertData[]): Promise<void> {
    if (events.length === 0) {
      return;
    }

    // Build multi-value INSERT query
    const values: string[] = [];
    const params: any[] = [];
    let paramCount = 0;

    for (const event of events) {
      const valueGroup: string[] = [];

      valueGroup.push(`$${++paramCount}`); // document_id
      params.push(event.documentId);

      valueGroup.push(`$${++paramCount}`); // user_id
      params.push(event.userId);

      valueGroup.push(`$${++paramCount}`); // session_id
      params.push(event.sessionId || null);

      valueGroup.push(`$${++paramCount}`); // event_type
      params.push(event.eventType);

      valueGroup.push(`$${++paramCount}`); // timestamp
      params.push(event.timestamp);

      valueGroup.push(`$${++paramCount}`); // key_code
      params.push(event.keyCode || null);

      valueGroup.push(`$${++paramCount}`); // key_char
      params.push(event.keyChar || null);

      valueGroup.push(`$${++paramCount}`); // text_before
      params.push(event.textBefore ?? null);

      valueGroup.push(`$${++paramCount}`); // text_after
      params.push(event.textAfter ?? null);

      valueGroup.push(`$${++paramCount}`); // cursor_position
      params.push(event.cursorPosition ?? null);

      valueGroup.push(`$${++paramCount}`); // selection_start
      params.push(event.selectionStart ?? null);

      valueGroup.push(`$${++paramCount}`); // selection_end
      params.push(event.selectionEnd ?? null);

      valueGroup.push(`$${++paramCount}`); // editor_state_before
      params.push(event.editorStateBefore ? JSON.stringify(event.editorStateBefore) : null);

      valueGroup.push(`$${++paramCount}`); // editor_state_after
      params.push(event.editorStateAfter ? JSON.stringify(event.editorStateAfter) : null);

      valueGroup.push(`$${++paramCount}`); // metadata
      params.push(event.metadata ? JSON.stringify(event.metadata) : null);

      values.push(`(${valueGroup.join(', ')})`);
    }

    const sql = `
      INSERT INTO document_events (
        document_id, user_id, session_id, event_type, timestamp,
        key_code, key_char, text_before, text_after,
        cursor_position, selection_start, selection_end,
        editor_state_before, editor_state_after, metadata
      )
      VALUES ${values.join(', ')}
    `;

    await query(sql, params);
  }

  /**
   * Find events by document ID with optional filters
   */
  static async findByDocumentId(
    documentId: string,
    filters: DocumentEventQueryFilters = {}
  ): Promise<DocumentEvent[]> {
    const {
      eventType,
      startDate,
      endDate,
      limit = 1000,
      offset = 0,
    } = filters;

    let whereClauses = ['document_id = $1'];
    const params: any[] = [documentId];
    let paramIndex = 2;

    if (eventType) {
      if (Array.isArray(eventType)) {
        // Handle array of event types with IN clause
        const placeholders = eventType.map((_, i) => `$${paramIndex + i}`).join(', ');
        whereClauses.push(`event_type IN (${placeholders})`);
        params.push(...eventType);
        paramIndex += eventType.length;
      } else {
        // Handle single event type
        whereClauses.push(`event_type = $${paramIndex}`);
        params.push(eventType);
        paramIndex++;
      }
    }

    if (startDate) {
      whereClauses.push(`timestamp >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClauses.push(`timestamp <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = whereClauses.join(' AND ');

    const sql = `
      SELECT
        id,
        document_id as "documentId",
        user_id as "userId",
        session_id as "sessionId",
        event_type as "eventType",
        timestamp,
        key_code as "keyCode",
        key_char as "keyChar",
        text_before as "textBefore",
        text_after as "textAfter",
        cursor_position as "cursorPosition",
        selection_start as "selectionStart",
        selection_end as "selectionEnd",
        editor_state_before as "editorStateBefore",
        editor_state_after as "editorStateAfter",
        metadata,
        created_at as "createdAt"
      FROM document_events
      WHERE ${whereClause}
      ORDER BY timestamp DESC, created_at DESC, id DESC
      LIMIT $${paramIndex} OFFSET $${paramIndex + 1}
    `;

    return query<DocumentEvent>(sql, [...params, limit, offset]);
  }

  /**
   * Count events for a document
   */
  static async countByDocumentId(documentId: string): Promise<number> {
    const sql = `
      SELECT COUNT(*) as count
      FROM document_events
      WHERE document_id = $1
    `;

    const result = await queryOne<{ count: string }>(sql, [documentId]);
    return parseInt(result?.count || '0', 10);
  }

  /**
   * Count events for a document with filters
   */
  static async countByDocumentIdWithFilters(
    documentId: string,
    filters: DocumentEventQueryFilters = {}
  ): Promise<number> {
    const {
      eventType,
      startDate,
      endDate,
    } = filters;

    let whereClauses = ['document_id = $1'];
    const params: any[] = [documentId];
    let paramIndex = 2;

    if (eventType) {
      if (Array.isArray(eventType)) {
        // Handle array of event types with IN clause
        const placeholders = eventType.map((_, i) => `$${paramIndex + i}`).join(', ');
        whereClauses.push(`event_type IN (${placeholders})`);
        params.push(...eventType);
        paramIndex += eventType.length;
      } else {
        // Handle single event type
        whereClauses.push(`event_type = $${paramIndex}`);
        params.push(eventType);
        paramIndex++;
      }
    }

    if (startDate) {
      whereClauses.push(`timestamp >= $${paramIndex}`);
      params.push(startDate);
      paramIndex++;
    }

    if (endDate) {
      whereClauses.push(`timestamp <= $${paramIndex}`);
      params.push(endDate);
      paramIndex++;
    }

    const whereClause = whereClauses.join(' AND ');

    const sql = `
      SELECT COUNT(*) as count
      FROM document_events
      WHERE ${whereClause}
    `;

    const result = await queryOne<{ count: string }>(sql, params);
    return parseInt(result?.count || '0', 10);
  }

  /**
   * Get event metrics/statistics for a document
   */
  static async getEventMetrics(
    documentId: string,
    filters: Pick<DocumentEventQueryFilters, 'startDate' | 'endDate'> = {}
  ): Promise<EventMetrics> {
    const whereClauses = ['document_id = $1'];
    const params: any[] = [documentId];

    if (filters.startDate) {
      whereClauses.push(`timestamp >= $${params.length + 1}`);
      params.push(filters.startDate);
    }

    if (filters.endDate) {
      whereClauses.push(`timestamp <= $${params.length + 1}`);
      params.push(filters.endDate);
    }

    const sql = `
      SELECT
        COUNT(*) as total_events,
        COUNT(CASE WHEN event_type IN ('keydown', 'keyup', 'input') THEN 1 END) as typing_events,
        COUNT(CASE WHEN event_type = 'paste' THEN 1 END) as paste_events,
        COUNT(CASE WHEN event_type = 'copy' THEN 1 END) as copy_events,
        COUNT(CASE WHEN event_type = 'cut' THEN 1 END) as cut_events,
        COUNT(CASE WHEN event_type = 'blocked_copy_paste_attempt' THEN 1 END) as blocked_copy_paste_attempts,
        MIN(timestamp) as first_event,
        MAX(timestamp) as last_event,
        COALESCE(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))), 0) as editing_duration_seconds
      FROM document_events
      WHERE ${whereClauses.join(' AND ')}
    `;

    const result = await queryOne<any>(sql, params);

    if (!result) {
      return {
        totalEvents: 0,
        typingEvents: 0,
        pasteEvents: 0,
        copyEvents: 0,
        cutEvents: 0,
        blockedCopyPasteAttempts: 0,
        firstEvent: null,
        lastEvent: null,
        editingDurationSeconds: 0,
      };
    }

    return {
      totalEvents: parseInt(result.total_events || '0', 10),
      typingEvents: parseInt(result.typing_events || '0', 10),
      pasteEvents: parseInt(result.paste_events || '0', 10),
      copyEvents: parseInt(result.copy_events || '0', 10),
      cutEvents: parseInt(result.cut_events || '0', 10),
      blockedCopyPasteAttempts: parseInt(result.blocked_copy_paste_attempts || '0', 10),
      firstEvent: result.first_event,
      lastEvent: result.last_event,
      editingDurationSeconds: parseFloat(result.editing_duration_seconds || '0'),
    };
  }

  static async getAwayFromWorkspaceStats(
    documentId: string,
    rapidSwitchWindowSeconds: number,
    filters: Pick<DocumentEventQueryFilters, 'startDate' | 'endDate'> = {}
  ): Promise<AwayFromWorkspaceStats> {
    const params: any[] = [documentId, VIEW_LOGS_NAVIGATION_SOURCE];
    const dateClauses: string[] = [];
    if (filters.startDate) {
      dateClauses.push(`timestamp >= $${params.length + 1}`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      dateClauses.push(`timestamp <= $${params.length + 1}`);
      params.push(filters.endDate);
    }

    const sql = `
      SELECT
        event_type as "eventType",
        timestamp,
        CASE
          WHEN event_type = 'page_visible'
            AND metadata ? 'hiddenDurationMs'
            AND (metadata->>'hiddenDurationMs') ~ '^[0-9]+(\\.[0-9]+)?$'
          THEN GREATEST((metadata->>'hiddenDurationMs')::numeric, 0)
          ELSE 0
        END as "awayMs"
      FROM document_events
      WHERE document_id = $1
        AND event_type IN ('page_hidden', 'page_visible')
        AND NOT (
          (event_type = 'page_hidden' AND metadata->>'source' = $2)
          OR (event_type = 'page_visible' AND metadata->>'hiddenSource' = $2)
        )
        ${dateClauses.length ? `AND ${dateClauses.join(' AND ')}` : ''}
      ORDER BY timestamp ASC, created_at ASC, id ASC
    `;

    const events = await query<VisibilityTraceEvent>(sql, params);
    const totalAwayMs = events.reduce((total, event) => total + Number(event.awayMs || 0), 0);
    const longestAwayMs = events.reduce(
      (longest, event) => Math.max(longest, Number(event.awayMs || 0)),
      0
    );
    const rapidWindow = computeRapidVisibilityWindow(events, rapidSwitchWindowSeconds);

    return {
      leftCount: events.filter((event) => event.eventType === 'page_hidden').length,
      returnedCount: events.filter((event) => event.eventType === 'page_visible').length,
      totalAwayMs: Math.round(totalAwayMs),
      longestAwayMs: Math.round(longestAwayMs),
      ...rapidWindow,
    };
  }

  static async getAnomalyAnalysisFeatures(
    documentId: string,
    thresholds: WritingAnomalyThresholds,
    filters: Pick<DocumentEventQueryFilters, 'startDate' | 'endDate'> = {}
  ): Promise<DocumentAnomalyAnalysisFeatures> {
    const [metrics, speed, cadence, textInflux, focusInflux, awayFromWorkspace, clockSkew, typingMetrics] = await Promise.all([
      this.getEventMetrics(documentId, filters),
      this.getTypingSpeedFeature(documentId, thresholds.highSpeedWindowSeconds, filters),
      this.getCadenceFeature(documentId, filters),
      this.getTextInfluxFeature(documentId, thresholds.textInfluxMinimumCharacters, filters),
      this.getFocusInfluxFeature(documentId, thresholds.focusInfluxWindowSeconds, filters),
      this.getAwayFromWorkspaceStats(documentId, thresholds.rapidTabSwitchWindowSeconds, filters),
      this.getClockSkewFeature(documentId, thresholds.clockSkewMinimumEvents, filters),
      this.calculateTypingMetrics(documentId, filters),
    ]);

    return {
      totalEvents: metrics.totalEvents,
      typingEvents: metrics.typingEvents,
      pasteEvents: metrics.pasteEvents,
      speed,
      cadence,
      textInflux,
      focusInflux,
      awayFromWorkspace,
      clockSkew,
      copyPaste: {
        pasteEvents: metrics.pasteEvents,
        copyEvents: metrics.copyEvents,
        cutEvents: metrics.cutEvents,
        blockedAttempts: metrics.blockedCopyPasteAttempts,
        pastedCharacters: typingMetrics.pastedCharacters,
        totalCharacters: typingMetrics.typedCharacters + typingMetrics.pastedCharacters,
      },
    };
  }

  private static async getTypingSpeedFeature(
    documentId: string,
    windowSeconds: number,
    filters: Pick<DocumentEventQueryFilters, 'startDate' | 'endDate'> = {}
  ): Promise<AnomalyTypingSpeedFeature> {
    const params: any[] = [documentId, windowSeconds];
    const dateClauses: string[] = [];
    if (filters.startDate) {
      dateClauses.push(`timestamp >= $${params.length + 1}`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      dateClauses.push(`timestamp <= $${params.length + 1}`);
      params.push(filters.endDate);
    }

    const sql = `
      WITH typing_events AS (
        SELECT
          timestamp,
          GREATEST(
            CASE
              WHEN text_after IS NOT NULL AND text_before IS NOT NULL
                THEN char_length(text_after) - char_length(text_before)
              ELSE 0
            END,
            CASE
              WHEN event_type = 'keydown' AND key_char IS NOT NULL AND char_length(key_char) = 1
                THEN 1
              ELSE 0
            END
          ) as added_chars
        FROM document_events
        WHERE document_id = $1
          AND event_type IN ('keydown', 'input')
          ${dateClauses.length ? `AND ${dateClauses.join(' AND ')}` : ''}
      ),
      positive_typing_events AS (
        SELECT timestamp, added_chars
        FROM typing_events
        WHERE added_chars > 0
      ),
      windowed AS (
        SELECT
          timestamp,
          SUM(added_chars) OVER (
            ORDER BY timestamp
            RANGE BETWEEN ($2::int * INTERVAL '1 second') PRECEDING AND CURRENT ROW
          ) as chars_in_window
        FROM positive_typing_events
      )
      SELECT COALESCE(MAX(chars_in_window), 0)::int as max_chars_in_window
      FROM windowed
    `;

    const result = await queryOne<{ max_chars_in_window: number | string }>(sql, params);
    const maxCharsInWindow = parseInt(String(result?.max_chars_in_window || '0'), 10);

    return {
      maxCharsInWindow,
      windowSeconds,
      charsPerMinute: windowSeconds > 0 ? Math.round((maxCharsInWindow / windowSeconds) * 60) : 0,
    };
  }

  private static async getCadenceFeature(
    documentId: string,
    filters: Pick<DocumentEventQueryFilters, 'startDate' | 'endDate'> = {}
  ): Promise<AnomalyCadenceFeature> {
    const params: any[] = [documentId];
    const dateClauses: string[] = [];
    if (filters.startDate) {
      dateClauses.push(`timestamp >= $${params.length + 1}`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      dateClauses.push(`timestamp <= $${params.length + 1}`);
      params.push(filters.endDate);
    }

    const sql = `
      WITH key_events AS (
        SELECT timestamp
        FROM document_events
        WHERE document_id = $1
          AND event_type = 'keydown'
          AND key_char IS NOT NULL
          ${dateClauses.length ? `AND ${dateClauses.join(' AND ')}` : ''}
        ORDER BY timestamp ASC, created_at ASC, id ASC
      ),
      deltas AS (
        SELECT
          EXTRACT(EPOCH FROM (timestamp - LAG(timestamp) OVER (ORDER BY timestamp ASC))) * 1000 as interval_ms
        FROM key_events
      ),
      usable_deltas AS (
        SELECT interval_ms
        FROM deltas
        WHERE interval_ms > 0 AND interval_ms <= 5000
      )
      SELECT
        COUNT(*)::int as interval_count,
        AVG(interval_ms) as mean_interval_ms,
        STDDEV_POP(interval_ms) as stddev_interval_ms,
        MIN(interval_ms) as min_interval_ms,
        MAX(interval_ms) as max_interval_ms
      FROM usable_deltas
    `;

    const result = await queryOne<any>(sql, params);

    return {
      intervalCount: parseInt(result?.interval_count || '0', 10),
      meanIntervalMs: result?.mean_interval_ms === null || result?.mean_interval_ms === undefined
        ? null
        : parseFloat(result.mean_interval_ms),
      stddevIntervalMs: result?.stddev_interval_ms === null || result?.stddev_interval_ms === undefined
        ? null
        : parseFloat(result.stddev_interval_ms),
      minIntervalMs: result?.min_interval_ms === null || result?.min_interval_ms === undefined
        ? null
        : parseFloat(result.min_interval_ms),
      maxIntervalMs: result?.max_interval_ms === null || result?.max_interval_ms === undefined
        ? null
        : parseFloat(result.max_interval_ms),
    };
  }

  private static async getTextInfluxFeature(
    documentId: string,
    minimumCharacters: number,
    filters: Pick<DocumentEventQueryFilters, 'startDate' | 'endDate'> = {}
  ): Promise<AnomalyTextInfluxFeature> {
    const params: any[] = [documentId, minimumCharacters];
    const dateClauses: string[] = [];
    if (filters.startDate) {
      dateClauses.push(`timestamp >= $${params.length + 1}`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      dateClauses.push(`timestamp <= $${params.length + 1}`);
      params.push(filters.endDate);
    }

    const sql = `
      WITH deltas AS (
        SELECT
          event_type,
          timestamp,
          GREATEST(char_length(COALESCE(text_after, '')) - char_length(COALESCE(text_before, '')), 0) as added_chars
        FROM document_events
        WHERE document_id = $1
          AND text_after IS NOT NULL
          ${dateClauses.length ? `AND ${dateClauses.join(' AND ')}` : ''}
      )
      SELECT
        event_type,
        timestamp,
        added_chars::int
      FROM deltas
      WHERE added_chars >= $2
        AND event_type NOT IN (
          'keydown',
          'input',
          'paste',
          'ai_modification_applied',
          'ai_insert_from_chat',
          'ai_selection_action',
          'replace',
          'replace-all'
        )
      ORDER BY added_chars DESC, timestamp ASC
      LIMIT 1
    `;

    const result = await queryOne<{
      event_type: string;
      timestamp: Date;
      added_chars: number | string;
    }>(sql, params);

    return {
      eventType: result?.event_type || null,
      timestamp: result?.timestamp || null,
      addedCharacters: parseInt(String(result?.added_chars || '0'), 10),
    };
  }

  private static async getFocusInfluxFeature(
    documentId: string,
    windowSeconds: number,
    filters: Pick<DocumentEventQueryFilters, 'startDate' | 'endDate'> = {}
  ): Promise<AnomalyFocusInfluxFeature> {
    const params: any[] = [documentId, windowSeconds];
    const dateClauses: string[] = [];
    if (filters.startDate) {
      dateClauses.push(`focus_event.timestamp >= $${params.length + 1}`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      dateClauses.push(`focus_event.timestamp <= $${params.length + 1}`);
      params.push(filters.endDate);
    }

    const sql = `
      WITH focus_events AS (
        SELECT
          focus_event.timestamp as focus_timestamp,
          (
            SELECT MAX(blur_event.timestamp)
            FROM document_events blur_event
            WHERE blur_event.document_id = $1
              AND blur_event.event_type = 'blur'
              AND blur_event.timestamp < focus_event.timestamp
          ) as blur_timestamp
        FROM document_events focus_event
        WHERE focus_event.document_id = $1
          AND focus_event.event_type = 'focus'
          ${dateClauses.length ? `AND ${dateClauses.join(' AND ')}` : ''}
      ),
      focus_windows AS (
        SELECT *
        FROM focus_events
        WHERE blur_timestamp IS NOT NULL
      ),
      influx AS (
        SELECT
          focus_windows.blur_timestamp,
          focus_windows.focus_timestamp,
          COALESCE(SUM(GREATEST(
            char_length(COALESCE(event.text_after, '')) - char_length(COALESCE(event.text_before, '')),
            0
          )), 0)::int as added_chars
        FROM focus_windows
        LEFT JOIN document_events event
          ON event.document_id = $1
          AND event.timestamp >= focus_windows.focus_timestamp
          AND event.timestamp <= focus_windows.focus_timestamp + ($2::int * INTERVAL '1 second')
          AND event.event_type IN ('keydown', 'input', 'paste')
        GROUP BY focus_windows.blur_timestamp, focus_windows.focus_timestamp
      )
      SELECT blur_timestamp, focus_timestamp, added_chars
      FROM influx
      ORDER BY added_chars DESC, focus_timestamp ASC
      LIMIT 1
    `;

    const result = await queryOne<{
      blur_timestamp: Date;
      focus_timestamp: Date;
      added_chars: number | string;
    }>(sql, params);

    return {
      blurTimestamp: result?.blur_timestamp || null,
      focusTimestamp: result?.focus_timestamp || null,
      addedCharacters: parseInt(String(result?.added_chars || '0'), 10),
    };
  }

  private static async getClockSkewFeature(
    documentId: string,
    minimumEvents: number,
    filters: Pick<DocumentEventQueryFilters, 'startDate' | 'endDate'> = {}
  ): Promise<AnomalyClockSkewFeature> {
    const params: any[] = [documentId, minimumEvents];
    const dateClauses: string[] = [];
    if (filters.startDate) {
      dateClauses.push(`timestamp >= $${params.length + 1}`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      dateClauses.push(`timestamp <= $${params.length + 1}`);
      params.push(filters.endDate);
    }

    const sql = `
      WITH session_spans AS (
        SELECT
          session_id,
          COUNT(*)::int as event_count,
          COALESCE(EXTRACT(EPOCH FROM (MAX(timestamp) - MIN(timestamp))), 0) as client_span_seconds,
          COALESCE(EXTRACT(EPOCH FROM (MAX(created_at) - MIN(created_at))), 0) as server_span_seconds
        FROM document_events
        WHERE document_id = $1
          ${dateClauses.length ? `AND ${dateClauses.join(' AND ')}` : ''}
        GROUP BY session_id
      )
      SELECT
        session_id,
        event_count,
        client_span_seconds,
        server_span_seconds
      FROM session_spans
      WHERE event_count >= $2
      ORDER BY (client_span_seconds - server_span_seconds) DESC, event_count DESC
      LIMIT 1
    `;

    const result = await queryOne<any>(sql, params);

    return {
      sessionId: result?.session_id || null,
      eventCount: parseInt(result?.event_count || '0', 10),
      clientSpanSeconds: parseFloat(result?.client_span_seconds || '0'),
      serverSpanSeconds: parseFloat(result?.server_span_seconds || '0'),
    };
  }

  /**
   * Calculate final-text and process-volume composition for certificate generation.
   */
  static async calculateCompositionMetrics(
    documentId: string,
    filters: Pick<DocumentEventQueryFilters, 'startDate' | 'endDate'> = {}
  ): Promise<AuthorshipCompositionMetrics> {
    const params: any[] = [documentId];
    const dateClauses: string[] = [];
    if (filters.startDate) {
      dateClauses.push(`timestamp >= $${params.length + 1}`);
      params.push(filters.startDate);
    }
    if (filters.endDate) {
      dateClauses.push(`timestamp <= $${params.length + 1}`);
      params.push(filters.endDate);
    }

    const sql = `
      SELECT
        event_type as "eventType",
        text_before as "textBefore",
        text_after as "textAfter",
        selection_start as "selectionStart",
        selection_end as "selectionEnd",
        metadata
      FROM document_events
      WHERE document_id = $1
        AND text_after IS NOT NULL
        ${dateClauses.length ? `AND ${dateClauses.join(' AND ')}` : ''}
      ORDER BY timestamp ASC, created_at ASC, id ASC
    `;

    const events = await query<TextCompositionEvent>(sql, params);
    let spans: SourceSpan[] = [];
    const processInputVolume = emptyComposition();

    for (const event of events) {
      if (event.textAfter === null || event.textAfter === undefined) continue;

      const currentText = textFromSpans(spans);
      const beforeText = event.textBefore || '';
      const afterText = event.textAfter;
      const sourceInfo = getSourceInfo(event);

      if (
        (event.eventType === 'ai_selection_action' || event.eventType === 'ai_modification_applied') &&
        beforeText
      ) {
        const range = findEventRange(event, currentText);
        if (range) {
          const selectedSpans = sliceSpans(spans, range.start, range.end);
          const replacement = applyTextTransition(
            selectedSpans,
            beforeText,
            afterText,
            sourceInfo,
            processInputVolume
          );
          spans = replaceSpanRange(spans, range.start, range.end, replacement);
          continue;
        }
      }

      if (currentText === beforeText || spans.length === 0) {
        spans = applyTextTransition(spans, beforeText, afterText, sourceInfo, processInputVolume);
        continue;
      }

      if (currentText !== afterText) {
        spans = applyTextTransition(spans, currentText, afterText, sourceInfo, processInputVolume);
      }
    }

    return {
      finalTextComposition: compositionFromSpans(spans),
      finalTextSourceSpans: compactSourceSpans(spans),
      processInputVolume,
    };
  }

  /**
   * Calculate typing metrics for anomaly review. This keeps the legacy shape
   * but now uses cumulative process volume so deleted pasted text is still counted.
   */
  static async calculateTypingMetrics(
    documentId: string,
    filters: Pick<DocumentEventQueryFilters, 'startDate' | 'endDate'> = {}
  ): Promise<{
    typedCharacters: number;
    pastedCharacters: number;
  }> {
    const { processInputVolume } = await this.calculateCompositionMetrics(documentId, filters);
    return {
      typedCharacters: processInputVolume.typedCharacters,
      pastedCharacters: processInputVolume.pastedCharacters,
    };
  }

  /**
   * Delete all events for a document (used when document is deleted)
   */
  static async deleteByDocumentId(documentId: string): Promise<number> {
    const sql = `
      DELETE FROM document_events
      WHERE document_id = $1
      RETURNING id
    `;

    const result = await query<{ id: string }>(sql, [documentId]);
    return result.length;
  }

  /**
   * Get recent events for a document (for live preview)
   */
  static async getRecentEvents(documentId: string, limit: number = 10): Promise<DocumentEvent[]> {
    const sql = `
      SELECT
        id,
        document_id as "documentId",
        user_id as "userId",
        event_type as "eventType",
        timestamp,
        key_code as "keyCode",
        key_char as "keyChar",
        text_before as "textBefore",
        text_after as "textAfter",
        cursor_position as "cursorPosition",
        selection_start as "selectionStart",
        selection_end as "selectionEnd",
        editor_state_before as "editorStateBefore",
        editor_state_after as "editorStateAfter",
        metadata,
        created_at as "createdAt"
      FROM document_events
      WHERE document_id = $1
      ORDER BY timestamp DESC
      LIMIT $2
    `;

    const events = await query<DocumentEvent>(sql, [documentId, limit]);
    return events.reverse(); // Return in chronological order
  }
}

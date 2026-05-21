import {
  DocumentEvent,
  DocumentEventTimelineItem,
  DocumentEventTimelineRawEvent,
  DocumentEventTimelineResponse,
  EventType,
} from '@humanly/shared';

const TYPING_BURST_GAP_MS = 1500;
const DELETE_BURST_GAP_MS = 1500;
const LINE_BREAK_GAP_MS = 1500;
const SELECTION_DELETE_WINDOW_MS = 5000;
const AI_INSERT_MIRROR_WINDOW_MS = 1500;
const BOUNDARY_KEYS = new Set(['Enter', 'Tab', 'Escape']);
const TYPING_EVENT_TYPES = new Set<EventType>(['keydown', 'input']);
const FORMAT_EVENT_TYPES = new Set<EventType>([
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
]);

type TextDelta = {
  insertedText: string;
  deletedText: string;
  selectedText?: string;
};

type OpenGroup = {
  kind: 'typing_burst' | 'line_break' | 'delete';
  first: DocumentEvent;
  last: DocumentEvent;
  text: string;
  lineBreakCount?: number;
  cursorStart?: number;
  cursorEnd?: number;
  rawEvents: DocumentEventTimelineRawEvent[];
  metadata?: Record<string, any>;
};

function timestampMs(value: Date | string): number {
  return new Date(value).getTime();
}

function compareEventIds(a: string, b: string): number {
  const numericA = Number(a);
  const numericB = Number(b);

  if (Number.isFinite(numericA) && Number.isFinite(numericB)) {
    return numericA - numericB;
  }

  return a.localeCompare(b, undefined, { numeric: true });
}

function compareEventsAscending(a: DocumentEvent, b: DocumentEvent): number {
  const timestampDifference = timestampMs(a.timestamp) - timestampMs(b.timestamp);
  if (timestampDifference !== 0) return timestampDifference;

  const createdAtDifference =
    timestampMs(a.createdAt || a.timestamp) - timestampMs(b.createdAt || b.timestamp);
  if (createdAtDifference !== 0) return createdAtDifference;

  return compareEventIds(a.id, b.id);
}

function compareTimelineItemsDescending(
  a: DocumentEventTimelineItem,
  b: DocumentEventTimelineItem
): number {
  const timestampDifference = timestampMs(b.timestamp) - timestampMs(a.timestamp);
  if (timestampDifference !== 0) return timestampDifference;

  const aLastRawId = a.rawEvents[a.rawEvents.length - 1]?.id || a.id;
  const bLastRawId = b.rawEvents[b.rawEvents.length - 1]?.id || b.id;

  return compareEventIds(bLastRawId, aLastRawId);
}

function sameSession(a?: string, b?: string): boolean {
  return (a || null) === (b || null);
}

function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

function getTextDelta(event: DocumentEvent): TextDelta {
  if (typeof event.textBefore === 'string' && typeof event.textAfter === 'string') {
    const before = event.textBefore;
    const after = event.textAfter;
    let prefix = 0;

    while (
      prefix < before.length &&
      prefix < after.length &&
      before[prefix] === after[prefix]
    ) {
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
      insertedText: after.slice(prefix, after.length - suffix),
      deletedText: before.slice(prefix, before.length - suffix),
    };
  }

  if (
    typeof event.textBefore === 'string' &&
    event.textAfter == null &&
    isExplicitDeleteAction(event)
  ) {
    const selectedText = getSelectedText(event);
    return {
      insertedText: '',
      deletedText: selectedText || event.textBefore,
      selectedText: selectedText || undefined,
    };
  }

  if (event.keyChar && event.eventType !== 'delete') {
    return { insertedText: event.keyChar, deletedText: '' };
  }

  return { insertedText: '', deletedText: '' };
}

function hasSameTextSnapshot(a: DocumentEvent, b: DocumentEvent): boolean {
  return (
    typeof a.textBefore === 'string' &&
    typeof a.textAfter === 'string' &&
    a.textBefore === b.textBefore &&
    a.textAfter === b.textAfter
  );
}

function isMirroredAIInsertTypingEvent(
  event: DocumentEvent,
  aiInsertEvents: DocumentEvent[]
): boolean {
  if (!TYPING_EVENT_TYPES.has(event.eventType)) return false;

  const delta = getTextDelta(event);
  if (!delta.insertedText || delta.deletedText) return false;

  return aiInsertEvents.some((aiEvent) => {
    if (!sameSession(event.sessionId, aiEvent.sessionId)) return false;
    if (Math.abs(timestampMs(event.timestamp) - timestampMs(aiEvent.timestamp)) > AI_INSERT_MIRROR_WINDOW_MS) {
      return false;
    }

    const aiDelta = getTextDelta(aiEvent);
    if (!aiDelta.insertedText || aiDelta.deletedText) return false;

    return (
      delta.insertedText === aiDelta.insertedText &&
      event.cursorPosition === aiEvent.cursorPosition &&
      hasSameTextSnapshot(event, aiEvent)
    );
  });
}

function filterMirroredAIInsertTypingEvents(events: DocumentEvent[]): DocumentEvent[] {
  const aiInsertEvents = events.filter((event) => event.eventType === 'ai_insert_from_chat');
  if (aiInsertEvents.length === 0) return events;

  return events.filter((event) => !isMirroredAIInsertTypingEvent(event, aiInsertEvents));
}

function getSelectedText(event: DocumentEvent | null): string {
  if (!event) return '';
  const selectedText = event.metadata?.selectedText;
  return typeof selectedText === 'string' ? selectedText : '';
}

function isCollapsedSelection(event: DocumentEvent): boolean {
  return (
    event.selectionStart !== undefined &&
    event.selectionEnd !== undefined &&
    event.selectionStart === event.selectionEnd
  );
}

function getRecentSelectionEvents(
  event: DocumentEvent,
  selectionEvents: DocumentEvent[]
): DocumentEvent[] {
  return selectionEvents.filter((selectionEvent) => {
    if (!sameSession(selectionEvent.sessionId, event.sessionId)) return false;

    const elapsedMs = timestampMs(event.timestamp) - timestampMs(selectionEvent.timestamp);
    if (elapsedMs < 0 || elapsedMs > SELECTION_DELETE_WINDOW_MS) return false;

    if (isCollapsedSelection(selectionEvent)) return false;

    return Boolean(getSelectedText(selectionEvent));
  });
}

function deletingSelectedTextProducesAfter(
  event: DocumentEvent,
  selectionEvent: DocumentEvent,
  selectedText: string
): boolean {
  if (typeof event.textBefore !== 'string' || typeof event.textAfter !== 'string') {
    return false;
  }

  const candidateIndexes = new Set<number>();

  if (typeof selectionEvent.selectionStart === 'number') {
    candidateIndexes.add(selectionEvent.selectionStart);
  }

  let searchIndex = event.textBefore.indexOf(selectedText);
  while (searchIndex !== -1) {
    candidateIndexes.add(searchIndex);
    searchIndex = event.textBefore.indexOf(selectedText, searchIndex + 1);
  }

  for (const start of candidateIndexes) {
    if (start < 0) continue;
    const nextText =
      event.textBefore.slice(0, start) + event.textBefore.slice(start + selectedText.length);
    if (nextText === event.textAfter) {
      return true;
    }
  }

  return false;
}

function replacingSelectedTextProducesAfter(
  event: DocumentEvent,
  selectionEvent: DocumentEvent,
  selectedText: string,
  insertedText: string
): boolean {
  return getReplacementTextForSelectedText(event, selectionEvent, selectedText) === insertedText;
}

function getReplacementTextForSelectedText(
  event: DocumentEvent,
  selectionEvent: DocumentEvent,
  selectedText: string
): string | null {
  if (typeof event.textBefore !== 'string' || typeof event.textAfter !== 'string') {
    return null;
  }

  const candidateIndexes = new Set<number>();

  if (typeof selectionEvent.selectionStart === 'number') {
    candidateIndexes.add(selectionEvent.selectionStart);
  }

  let searchIndex = event.textBefore.indexOf(selectedText);
  while (searchIndex !== -1) {
    candidateIndexes.add(searchIndex);
    searchIndex = event.textBefore.indexOf(selectedText, searchIndex + 1);
  }

  for (const start of candidateIndexes) {
    if (start < 0) continue;
    const beforePrefix = event.textBefore.slice(0, start);
    const beforeSuffix = event.textBefore.slice(start + selectedText.length);

    if (event.textAfter.startsWith(beforePrefix) && event.textAfter.endsWith(beforeSuffix)) {
      return event.textAfter.slice(beforePrefix.length, event.textAfter.length - beforeSuffix.length);
    }
  }

  return null;
}

function isExplicitDeleteAction(event: DocumentEvent): boolean {
  return (
    event.eventType === 'delete' ||
    event.eventType === 'cut' ||
    event.keyCode === 'Backspace' ||
    event.keyCode === 'Delete'
  );
}

function getSelectionAwareDelta(
  event: DocumentEvent,
  delta: TextDelta,
  recentSelectionEvents: DocumentEvent[]
): TextDelta {
  if (!delta.deletedText) {
    return delta;
  }

  const sourceEvents = [
    event,
    ...getRecentSelectionEvents(event, recentSelectionEvents),
  ];

  const matchingSelection = sourceEvents
    .map((selectionEvent) => {
      const selectedText = getSelectedText(selectionEvent);
      if (!selectedText) {
        return {
          event: selectionEvent,
          selectedText,
          matchesDeletion: false,
        };
      }

      const selectionDeletionProducesAfter = deletingSelectedTextProducesAfter(
        event,
        selectionEvent,
        selectedText
      );
      const selectionReplacementProducesAfter =
        Boolean(delta.insertedText) &&
        replacingSelectedTextProducesAfter(event, selectionEvent, selectedText, delta.insertedText);
      const replacementText = delta.insertedText
        ? getReplacementTextForSelectedText(event, selectionEvent, selectedText)
        : null;
      const matchesDeletion =
        Boolean(delta.deletedText?.includes(selectedText)) ||
        selectionDeletionProducesAfter ||
        selectionReplacementProducesAfter ||
        replacementText !== null;

      return {
        event: selectionEvent,
        selectedText,
        matchesDeletion,
        selectionDeletionProducesAfter,
        replacementText,
      };
    })
    .filter((selection) => selection.selectedText && selection.matchesDeletion)
    .sort((a, b) => {
      const eventMetadataPriority = Number(b.event.id === event.id) - Number(a.event.id === event.id);
      if (eventMetadataPriority !== 0) return eventMetadataPriority;

      const lengthPriority = b.selectedText.length - a.selectedText.length;
      if (lengthPriority !== 0) return lengthPriority;

      return timestampMs(b.event.timestamp) - timestampMs(a.event.timestamp);
    })[0];

  if (matchingSelection) {
    return {
      insertedText: isExplicitDeleteAction(event)
        ? ''
        : matchingSelection.replacementText ?? delta.insertedText,
      deletedText: matchingSelection.selectedText,
      selectedText: matchingSelection.selectedText,
    };
  }

  return delta;
}

function isBoundaryEvent(event: DocumentEvent): boolean {
  return Boolean(
    BOUNDARY_KEYS.has(event.keyCode || '') ||
      BOUNDARY_KEYS.has(event.keyChar || '') ||
      event.eventType === 'blur' ||
      event.eventType === 'paste' ||
      event.eventType === 'delete' ||
      event.eventType === 'select' ||
      FORMAT_EVENT_TYPES.has(event.eventType)
  );
}

function isTypingInsertion(event: DocumentEvent, delta: TextDelta): boolean {
  if (!TYPING_EVENT_TYPES.has(event.eventType)) return false;
  if (isBoundaryEvent(event)) return false;
  return delta.insertedText.length > 0 && delta.deletedText.length === 0;
}

function countVisualLineBreaks(text: string): number {
  const normalized = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!normalized || !/^\n+$/.test(normalized)) return 0;

  return Math.max(1, Math.ceil(normalized.length / 2));
}

function isLineBreakInsertion(event: DocumentEvent, delta: TextDelta): boolean {
  if (!TYPING_EVENT_TYPES.has(event.eventType)) return false;
  if (delta.deletedText.length > 0) return false;
  if (!delta.insertedText || !/^[\r\n]+$/.test(delta.insertedText)) return false;

  return event.keyCode === 'Enter' || event.keyChar === 'Enter';
}

function isDeleteEvent(event: DocumentEvent, delta: TextDelta): boolean {
  return (
    isExplicitDeleteAction(event) &&
    delta.deletedText.length > 0 &&
    delta.insertedText.length === 0
  );
}

function isReplaceEvent(event: DocumentEvent, delta: TextDelta): boolean {
  return (
    !isExplicitDeleteAction(event) &&
    delta.insertedText.length > 0 &&
    delta.deletedText.length > 0
  );
}

function makeRawEvent(event: DocumentEvent, delta: TextDelta): DocumentEventTimelineRawEvent {
  return {
    id: event.id,
    eventType: event.eventType,
    timestamp: event.timestamp,
    keyCode: event.keyCode,
    keyChar: event.keyChar,
    insertedText: delta.insertedText || undefined,
    deletedText: delta.deletedText || undefined,
    cursorPosition: event.cursorPosition,
    selectionStart: event.selectionStart,
    selectionEnd: event.selectionEnd,
    metadata: event.metadata,
  };
}

function eventLabel(event: DocumentEvent): string {
  const labels: Partial<Record<EventType, string>> = {
    focus: 'Editor focused',
    blur: 'Editor blurred',
    select: 'Text selected',
    copy: 'Copied text',
    cut: 'Cut text',
    paste: 'Pasted text',
    delete: 'Deleted text',
    keydown: event.keyCode === 'Enter' ? 'Line break' : 'Typed text',
    input: 'Typed text',
    bold: 'Bold formatting',
    italic: 'Italic formatting',
    underline: 'Underline formatting',
    'heading-change': 'Heading changed',
    'font-family-change': 'Font changed',
    'font-size-change': 'Font size changed',
    'text-color-change': 'Text color changed',
    'highlight-color-change': 'Highlight changed',
    'list-create': 'List created',
    'list-delete': 'List removed',
    'list-indent': 'List indented',
    'list-outdent': 'List outdented',
    'list-item-check': 'Checklist item changed',
    'alignment-change': 'Alignment changed',
    ai_selection_action: 'AI quick action',
    ai_insert_from_chat: 'AI inserted text',
    ai_panel_open: 'AI panel opened',
    ai_panel_close: 'AI panel closed',
    ai_query_sent: 'AI question sent',
    ai_response_received: 'AI response received',
  };

  return labels[event.eventType] || event.eventType.replace(/_/g, ' ');
}

function canExtendTyping(group: OpenGroup, event: DocumentEvent, insertedText: string): boolean {
  if (group.kind !== 'typing_burst') return false;
  if (!sameSession(group.last.sessionId, event.sessionId)) return false;
  if (timestampMs(event.timestamp) - timestampMs(group.last.timestamp) > TYPING_BURST_GAP_MS) return false;

  if (group.cursorEnd !== undefined && event.cursorPosition !== undefined) {
    return event.cursorPosition === group.cursorEnd + insertedText.length;
  }

  return true;
}

function canExtendDelete(group: OpenGroup, event: DocumentEvent): boolean {
  if (group.kind !== 'delete') return false;
  if (group.metadata?.deleteScope) return false;
  if (!sameSession(group.last.sessionId, event.sessionId)) return false;
  return timestampMs(event.timestamp) - timestampMs(group.last.timestamp) <= DELETE_BURST_GAP_MS;
}

function canExtendLineBreak(group: OpenGroup, event: DocumentEvent): boolean {
  if (group.kind !== 'line_break') return false;
  if (!sameSession(group.last.sessionId, event.sessionId)) return false;
  return timestampMs(event.timestamp) - timestampMs(group.last.timestamp) <= LINE_BREAK_GAP_MS;
}

function canExtendReplaceWithTyping(
  item: DocumentEventTimelineItem,
  event: DocumentEvent,
  insertedText: string
): boolean {
  if (item.kind !== 'replace') return false;
  if (!sameSession(item.sessionId, event.sessionId)) return false;
  if (timestampMs(event.timestamp) - timestampMs(item.endTimestamp) > TYPING_BURST_GAP_MS) {
    return false;
  }

  if (item.cursorEnd !== undefined && event.cursorPosition !== undefined) {
    return event.cursorPosition === item.cursorEnd + insertedText.length;
  }

  return true;
}

function extendReplaceWithTyping(
  item: DocumentEventTimelineItem,
  event: DocumentEvent,
  insertedText: string,
  rawEvent: DocumentEventTimelineRawEvent
): void {
  item.text = `${item.text || ''}${insertedText}`;
  item.charCount = item.text.length;
  item.wordCount = countWords(item.text);
  item.timestamp = event.timestamp;
  item.endTimestamp = event.timestamp;
  item.cursorEnd = event.cursorPosition ?? item.cursorEnd;
  item.rawEvents.push(rawEvent);
  item.rawEventCount = item.rawEvents.length;
}

function closeGroup(group: OpenGroup): DocumentEventTimelineItem {
  const isTyping = group.kind === 'typing_burst';
  const lineBreakCount =
    group.kind === 'line_break'
      ? group.lineBreakCount || countVisualLineBreaks(group.text)
      : undefined;

  return {
    id: `${group.kind}-${group.first.id}-${group.last.id}`,
    kind: group.kind,
    label:
      group.kind === 'line_break'
        ? lineBreakCount && lineBreakCount > 1
          ? 'Inserted blank line'
          : 'Inserted line break'
        : isTyping
          ? 'Typed text'
          : group.metadata?.deleteScope === 'all_text'
            ? 'Deleted all text'
            : group.metadata?.deleteScope === 'selection'
              ? 'Deleted selection'
              : 'Deleted text',
    timestamp: group.last.timestamp,
    startTimestamp: group.first.timestamp,
    endTimestamp: group.last.timestamp,
    sessionId: group.first.sessionId,
    text: group.text,
    charCount: lineBreakCount || group.text.length,
    wordCount: isTyping ? countWords(group.text) : undefined,
    cursorStart: group.cursorStart,
    cursorEnd: group.cursorEnd,
    rawEventCount: group.rawEvents.length,
    rawEvents: group.rawEvents,
    metadata: lineBreakCount ? { lineBreakCount } : group.metadata,
  };
}

function normalizeForScope(text?: string): string {
  if (!text) return '';
  return text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/\s+/g, ' ').trim();
}

function getDeleteMetadata(event: DocumentEvent, delta: TextDelta): Record<string, any> | undefined {
  const textBefore = typeof event.textBefore === 'string' ? event.textBefore : '';
  const candidateText = delta.selectedText || delta.deletedText;

  if (
    candidateText &&
    normalizeForScope(candidateText) &&
    normalizeForScope(candidateText) === normalizeForScope(textBefore)
  ) {
    return { deleteScope: 'all_text' };
  }

  if (delta.selectedText) {
    return { deleteScope: 'selection' };
  }

  return undefined;
}

function makeReplaceItem(event: DocumentEvent, delta: TextDelta): DocumentEventTimelineItem {
  return {
    id: `replace-${event.id}`,
    kind: 'replace',
    label: 'Replaced text',
    timestamp: event.timestamp,
    startTimestamp: event.timestamp,
    endTimestamp: event.timestamp,
    sessionId: event.sessionId,
    text: delta.insertedText,
    charCount: delta.insertedText.length,
    wordCount: countWords(delta.insertedText),
    cursorStart: event.selectionStart,
    cursorEnd: event.cursorPosition,
    rawEventCount: 1,
    rawEvents: [makeRawEvent(event, delta)],
    metadata: {
      ...event.metadata,
      replacedText: delta.deletedText,
    },
  };
}

function makeSingleItem(
  event: DocumentEvent,
  delta: TextDelta,
  kind: DocumentEventTimelineItem['kind'] = 'event'
): DocumentEventTimelineItem {
  const text = delta.insertedText || delta.deletedText || event.keyChar || event.keyCode || '';
  const charCount = delta.insertedText.length || delta.deletedText.length || undefined;

  return {
    id: `${kind}-${event.id}`,
    kind,
    label: kind === 'paste' ? 'Pasted text' : eventLabel(event),
    timestamp: event.timestamp,
    startTimestamp: event.timestamp,
    endTimestamp: event.timestamp,
    sessionId: event.sessionId,
    text,
    charCount,
    wordCount: kind === 'paste' ? countWords(delta.insertedText) : undefined,
    cursorStart: event.selectionStart,
    cursorEnd: event.cursorPosition,
    rawEventCount: 1,
    rawEvents: [makeRawEvent(event, delta)],
    metadata: event.metadata,
  };
}

function makeAIInsertItem(event: DocumentEvent, delta: TextDelta): DocumentEventTimelineItem {
  const insertedText =
    delta.insertedText ||
    (typeof event.metadata?.insertedText === 'string' ? event.metadata.insertedText : '');

  return {
    id: `ai-insert-${event.id}`,
    kind: 'ai_insert',
    label: 'AI inserted text',
    timestamp: event.timestamp,
    startTimestamp: event.timestamp,
    endTimestamp: event.timestamp,
    sessionId: event.sessionId,
    text: insertedText,
    charCount: insertedText.length || undefined,
    wordCount: insertedText ? countWords(insertedText) : undefined,
    cursorStart: event.selectionStart,
    cursorEnd: event.cursorPosition,
    rawEventCount: 1,
    rawEvents: [makeRawEvent(event, delta)],
    metadata: event.metadata,
  };
}

function summarize(items: DocumentEventTimelineItem[], rawEventTotal: number) {
  return items.reduce(
    (summary, item) => {
      summary.timelineItemTotal += 1;

      if (item.kind === 'typing_burst') {
        summary.typingBursts += 1;
        summary.typedCharacters += item.charCount || 0;
        summary.typedWords += item.wordCount || 0;
      } else if (item.kind === 'paste') {
        summary.pasteCharacters += item.charCount || 0;
      } else if (item.kind === 'delete') {
        summary.deletedCharacters += item.charCount || 0;
      }

      return summary;
    },
    {
      rawEventTotal,
      timelineItemTotal: 0,
      typingBursts: 0,
      typedCharacters: 0,
      typedWords: 0,
      pasteCharacters: 0,
      deletedCharacters: 0,
    }
  );
}

export function buildDocumentEventTimeline(
  events: DocumentEvent[],
  rawEventTotal = events.length
): DocumentEventTimelineResponse {
  const chronologicalEvents = filterMirroredAIInsertTypingEvents(
    [...events].sort(compareEventsAscending)
  );

  const items: DocumentEventTimelineItem[] = [];
  let openGroup: OpenGroup | null = null;
  let recentSelectionEvents: DocumentEvent[] = [];

  const flushGroup = () => {
    if (!openGroup) return;
    items.push(closeGroup(openGroup));
    openGroup = null;
  };

  for (const event of chronologicalEvents) {
    const baseDelta = getTextDelta(event);
    const delta = getSelectionAwareDelta(event, baseDelta, recentSelectionEvents);
    const rawEvent = makeRawEvent(event, delta);

    if (isReplaceEvent(event, delta)) {
      flushGroup();
      recentSelectionEvents = [];
      items.push(
        event.eventType === 'ai_insert_from_chat'
          ? makeAIInsertItem(event, delta)
          : makeReplaceItem(event, delta)
      );
      continue;
    }

    if (event.eventType === 'ai_insert_from_chat') {
      flushGroup();
      recentSelectionEvents = [];
      items.push(makeAIInsertItem(event, delta));
      continue;
    }

    if (isLineBreakInsertion(event, delta)) {
      recentSelectionEvents = [];
      const lineBreakCount = countVisualLineBreaks(delta.insertedText);

      if (openGroup && canExtendLineBreak(openGroup, event)) {
        openGroup.text += '\n'.repeat(lineBreakCount);
        openGroup.lineBreakCount = (openGroup.lineBreakCount || 0) + lineBreakCount;
        openGroup.last = event;
        openGroup.cursorEnd = event.cursorPosition ?? openGroup.cursorEnd;
        openGroup.rawEvents.push(rawEvent);
      } else {
        flushGroup();
        openGroup = {
          kind: 'line_break',
          first: event,
          last: event,
          text: '\n'.repeat(lineBreakCount),
          lineBreakCount,
          cursorStart: event.selectionStart,
          cursorEnd: event.cursorPosition,
          rawEvents: [rawEvent],
        };
      }
      continue;
    }

    if (isTypingInsertion(event, delta)) {
      recentSelectionEvents = [];
      const previousItem = items[items.length - 1];
      if (
        !openGroup &&
        previousItem &&
        canExtendReplaceWithTyping(previousItem, event, delta.insertedText)
      ) {
        extendReplaceWithTyping(previousItem, event, delta.insertedText, rawEvent);
        continue;
      }

      if (openGroup && canExtendTyping(openGroup, event, delta.insertedText)) {
        openGroup.text += delta.insertedText;
        openGroup.last = event;
        openGroup.cursorEnd = event.cursorPosition ?? openGroup.cursorEnd;
        openGroup.rawEvents.push(rawEvent);
      } else {
        flushGroup();
        openGroup = {
          kind: 'typing_burst',
          first: event,
          last: event,
          text: delta.insertedText,
          cursorStart:
            event.cursorPosition !== undefined
              ? event.cursorPosition - delta.insertedText.length
              : event.selectionStart,
          cursorEnd: event.cursorPosition,
          rawEvents: [rawEvent],
        };
      }
      continue;
    }

    if (isDeleteEvent(event, delta)) {
      recentSelectionEvents = [];
      const deletedText = delta.deletedText || event.keyChar || '';
      const deleteMetadata = getDeleteMetadata(event, delta);

      if (openGroup && canExtendDelete(openGroup, event) && !deleteMetadata) {
        openGroup.text = deletedText + openGroup.text;
        openGroup.last = event;
        openGroup.cursorEnd = event.cursorPosition ?? openGroup.cursorEnd;
        openGroup.rawEvents.push(rawEvent);
      } else {
        flushGroup();
        openGroup = {
          kind: 'delete',
          first: event,
          last: event,
          text: deletedText,
          cursorStart: event.selectionStart,
          cursorEnd: event.cursorPosition,
          rawEvents: [rawEvent],
          metadata: deleteMetadata,
        };
      }
      continue;
    }

    flushGroup();

    if (event.eventType === 'paste') {
      items.push(makeSingleItem(event, delta, 'paste'));
    } else {
      items.push(makeSingleItem(event, delta));
    }

    if (event.eventType === 'select') {
      recentSelectionEvents = [...getRecentSelectionEvents(event, recentSelectionEvents), event];
    } else if (event.eventType === 'focus' || event.eventType === 'blur' || event.eventType === 'paste') {
      recentSelectionEvents = [];
    } else {
      recentSelectionEvents = getRecentSelectionEvents(event, recentSelectionEvents);
    }
  }

  flushGroup();

  return {
    items: items.sort(compareTimelineItemsDescending),
    summary: summarize(items, rawEventTotal),
  };
}

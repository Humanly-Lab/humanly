import { DocumentEvent } from '@humanly/shared';
import { buildDocumentEventTimeline } from '../../services/document-event-timeline.service';

function event(overrides: Partial<DocumentEvent>): DocumentEvent {
  return {
    id: overrides.id || `event-${Math.random()}`,
    documentId: 'doc-1',
    userId: 'user-1',
    eventType: 'keydown',
    timestamp: new Date('2026-05-20T12:00:00.000Z'),
    createdAt: new Date('2026-05-20T12:00:00.000Z'),
    ...overrides,
  };
}

function typingEvents(text: string, start = new Date('2026-05-20T12:00:00.000Z')) {
  let before = '';
  return Array.from(text).map((char, index) => {
    const after = before + char;
    const row = event({
      id: `type-${index}`,
      eventType: 'keydown',
      timestamp: new Date(start.getTime() + index * 100),
      keyChar: char,
      textBefore: before,
      textAfter: after,
      cursorPosition: after.length,
    });
    before = after;
    return row;
  });
}

describe('buildDocumentEventTimeline', () => {
  it('groups continuous typing into one typing burst with word count', () => {
    const timeline = buildDocumentEventTimeline(typingEvents('hello world'));

    expect(timeline.items).toHaveLength(1);
    expect(timeline.items[0]).toMatchObject({
      kind: 'typing_burst',
      text: 'hello world',
      charCount: 11,
      wordCount: 2,
      rawEventCount: 11,
    });
    expect(timeline.summary).toMatchObject({
      rawEventTotal: 11,
      timelineItemTotal: 1,
      typingBursts: 1,
      typedCharacters: 11,
      typedWords: 2,
    });
  });

  it('splits typing bursts after a long pause', () => {
    const events = [
      ...typingEvents('hello'),
      ...typingEvents('world', new Date('2026-05-20T12:00:03.000Z')).map((row, index) => ({
        ...row,
        id: `late-${index}`,
        textBefore: `hello${row.textBefore}`,
        textAfter: `hello${row.textAfter}`,
        cursorPosition: 5 + (row.cursorPosition || 0),
      })),
    ];

    const timeline = buildDocumentEventTimeline(events);

    expect(timeline.items).toHaveLength(2);
    expect(timeline.items.map((item) => item.text)).toEqual(['world', 'hello']);
    expect(timeline.summary.typingBursts).toBe(2);
  });

  it('separates paste from typed characters', () => {
    const timeline = buildDocumentEventTimeline([
      ...typingEvents('Hi'),
      event({
        id: 'paste-1',
        eventType: 'paste',
        timestamp: new Date('2026-05-20T12:00:01.000Z'),
        textBefore: 'Hi',
        textAfter: 'Hi pasted text',
        cursorPosition: 14,
      }),
    ]);

    expect(timeline.items.map((item) => item.kind)).toEqual(['paste', 'typing_burst']);
    expect(timeline.items[0]).toMatchObject({
      kind: 'paste',
      text: ' pasted text',
      charCount: 12,
    });
    expect(timeline.summary.typedCharacters).toBe(2);
    expect(timeline.summary.pasteCharacters).toBe(12);
  });

  it('groups consecutive Enter events as visual line breaks', () => {
    const timeline = buildDocumentEventTimeline([
      ...typingEvents('Hi'),
      event({
        id: 'line-break-1',
        eventType: 'keydown',
        timestamp: new Date('2026-05-20T12:00:01.000Z'),
        keyCode: 'Enter',
        textBefore: 'Hi',
        textAfter: 'Hi\n\n',
        cursorPosition: 0,
      }),
      event({
        id: 'line-break-2',
        eventType: 'keydown',
        timestamp: new Date('2026-05-20T12:00:01.120Z'),
        keyCode: 'Enter',
        textBefore: 'Hi\n\n',
        textAfter: 'Hi\n\n\n\n',
        cursorPosition: 0,
      }),
      event({
        id: 'type-after-line-break',
        eventType: 'keydown',
        timestamp: new Date('2026-05-20T12:00:01.500Z'),
        keyChar: 'A',
        textBefore: 'Hi\n\n\n\n',
        textAfter: 'Hi\n\n\n\nA',
        cursorPosition: 1,
      }),
    ]);

    expect(timeline.items.map((item) => item.kind)).toEqual([
      'typing_burst',
      'line_break',
      'typing_burst',
    ]);
    expect(timeline.items[1]).toMatchObject({
      kind: 'line_break',
      label: 'Inserted blank line',
      text: '\n\n',
      charCount: 2,
      rawEventCount: 2,
      metadata: {
        lineBreakCount: 2,
      },
    });
    expect(timeline.items[1].rawEvents.map((event) => event.insertedText)).toEqual([
      '\n\n',
      '\n\n',
    ]);
  });

  it('groups consecutive deletes into one delete item', () => {
    const timeline = buildDocumentEventTimeline([
      event({
        id: 'delete-1',
        eventType: 'delete',
        timestamp: new Date('2026-05-20T12:00:00.000Z'),
        keyCode: 'Backspace',
        textBefore: 'abc',
        textAfter: 'ab',
        cursorPosition: 2,
      }),
      event({
        id: 'delete-2',
        eventType: 'delete',
        timestamp: new Date('2026-05-20T12:00:00.200Z'),
        keyCode: 'Backspace',
        textBefore: 'ab',
        textAfter: 'a',
        cursorPosition: 1,
      }),
    ]);

    expect(timeline.items).toHaveLength(1);
    expect(timeline.items[0]).toMatchObject({
      kind: 'delete',
      label: 'Deleted text',
      text: 'bc',
      charCount: 2,
      rawEventCount: 2,
    });
    expect(timeline.summary.deletedCharacters).toBe(2);
  });

  it('labels select all Backspace as deleted all text', () => {
    const timeline = buildDocumentEventTimeline([
      event({
        id: 'delete-all',
        eventType: 'delete',
        timestamp: new Date('2026-05-20T12:00:00.300Z'),
        keyCode: 'Backspace',
        textBefore: 'Whole document text',
        textAfter: '',
        cursorPosition: 0,
        selectionStart: 0,
        selectionEnd: 0,
        metadata: {
          selectedText: 'Whole document text',
        },
      }),
    ]);

    expect(timeline.items[0]).toMatchObject({
      kind: 'delete',
      label: 'Deleted all text',
      text: 'Whole document text',
      metadata: {
        deleteScope: 'all_text',
      },
    });
  });

  it('labels select all Backspace as deleted all text when persisted empty text is null', () => {
    const timeline = buildDocumentEventTimeline([
      event({
        id: 'delete-all-null-after',
        eventType: 'delete',
        timestamp: new Date('2026-05-20T12:00:00.300Z'),
        keyCode: 'Backspace',
        textBefore: 'Whole document text',
        textAfter: null as unknown as string,
        cursorPosition: 0,
        selectionStart: 0,
        selectionEnd: 0,
        metadata: {
          selectedText: 'Whole document text',
        },
      }),
    ]);

    expect(timeline.items[0]).toMatchObject({
      kind: 'delete',
      label: 'Deleted all text',
      text: 'Whole document text',
      metadata: {
        deleteScope: 'all_text',
      },
    });
  });

  it('orders same-timestamp events by created time and id before classifying edits', () => {
    const sameTime = new Date('2026-05-20T12:00:00.000Z');
    const timeline = buildDocumentEventTimeline([
      event({
        id: '102',
        eventType: 'delete',
        timestamp: sameTime,
        createdAt: sameTime,
        keyCode: 'Backspace',
        textBefore: 'Whole document text',
        textAfter: null as unknown as string,
        cursorPosition: 0,
        selectionStart: 0,
        selectionEnd: 0,
      }),
      event({
        id: '101',
        eventType: 'select',
        timestamp: sameTime,
        createdAt: sameTime,
        textBefore: 'Whole document text',
        textAfter: 'Whole document text',
        cursorPosition: 19,
        selectionStart: 0,
        selectionEnd: 19,
        metadata: {
          selectedText: 'Whole document text',
        },
      }),
    ]);

    expect(timeline.items[0]).toMatchObject({
      kind: 'delete',
      label: 'Deleted all text',
      text: 'Whole document text',
      metadata: {
        deleteScope: 'all_text',
      },
    });
  });

  it('uses selected text for selection deletes when plain-text diff is ambiguous', () => {
    const timeline = buildDocumentEventTimeline([
      event({
        id: 'select-1',
        eventType: 'select',
        timestamp: new Date('2026-05-20T12:00:00.000Z'),
        textBefore: 'abcXYZabc',
        textAfter: 'abcXYZabc',
        cursorPosition: 6,
        selectionStart: 0,
        selectionEnd: 6,
        metadata: {
          selectedText: 'abcXYZ',
        },
      }),
      event({
        id: 'delete-selection-1',
        eventType: 'delete',
        timestamp: new Date('2026-05-20T12:00:00.300Z'),
        keyCode: 'Backspace',
        textBefore: 'abcXYZabc',
        textAfter: 'abc',
        cursorPosition: 0,
        selectionStart: 0,
        selectionEnd: 0,
      }),
    ]);

    expect(timeline.items[0]).toMatchObject({
      kind: 'delete',
      label: 'Deleted selection',
      text: 'abcXYZ',
      charCount: 6,
      rawEventCount: 1,
      metadata: {
        deleteScope: 'selection',
      },
    });
    expect(timeline.items[0].rawEvents[0]).toMatchObject({
      deletedText: 'abcXYZ',
    });
  });

  it('uses selected text for selection deletes even when cursor offsets are unreliable', () => {
    const timeline = buildDocumentEventTimeline([
      event({
        id: 'select-offset-mismatch',
        eventType: 'select',
        timestamp: new Date('2026-05-20T12:00:00.000Z'),
        textBefore: 'Intro Target paragraph Tail',
        textAfter: 'Intro Target paragraph Tail',
        cursorPosition: 25,
        selectionStart: 6,
        selectionEnd: 22,
        metadata: {
          selectedText: 'Target paragraph',
        },
      }),
      event({
        id: 'delete-offset-mismatch',
        eventType: 'delete',
        timestamp: new Date('2026-05-20T12:00:00.300Z'),
        keyCode: 'Backspace',
        textBefore: 'Intro Target paragraph Tail',
        textAfter: 'Intro  Tail',
        cursorPosition: 1,
        selectionStart: 1,
        selectionEnd: 1,
      }),
    ]);

    expect(timeline.items[0]).toMatchObject({
      kind: 'delete',
      label: 'Deleted selection',
      text: 'Target paragraph',
      charCount: 16,
      metadata: {
        deleteScope: 'selection',
      },
    });
  });

  it('shows selected typing overwrite as a replace item instead of delete', () => {
    const timeline = buildDocumentEventTimeline([
      event({
        id: 'replace-by-typing',
        eventType: 'keydown',
        timestamp: new Date('2026-05-20T12:00:00.300Z'),
        keyCode: 'KeyN',
        keyChar: 'N',
        textBefore: 'Hello old text',
        textAfter: 'Hello New',
        cursorPosition: 9,
        selectionStart: 9,
        selectionEnd: 9,
        metadata: {
          selectedText: 'old text',
        },
      }),
    ]);

    expect(timeline.items).toHaveLength(1);
    expect(timeline.items[0]).toMatchObject({
      kind: 'replace',
      label: 'Replaced text',
      text: 'New',
      charCount: 3,
      metadata: {
        selectedText: 'old text',
        replacedText: 'old text',
      },
    });
    expect(timeline.summary.deletedCharacters).toBe(0);
    expect(timeline.summary.typedCharacters).toBe(0);
  });

  it('merges immediate typing after a replacement into the replacement text', () => {
    const timeline = buildDocumentEventTimeline([
      event({
        id: 'replace-start',
        eventType: 'keydown',
        timestamp: new Date('2026-05-20T12:00:00.000Z'),
        keyCode: 'KeyI',
        keyChar: 'I',
        textBefore: 'Long selected paragraph',
        textAfter: 'I',
        cursorPosition: 1,
        selectionStart: 1,
        selectionEnd: 1,
        metadata: {
          selectedText: 'Long selected paragraph',
        },
      }),
      event({
        id: 'replace-follow-up-1',
        eventType: 'keydown',
        timestamp: new Date('2026-05-20T12:00:00.200Z'),
        keyCode: 'Space',
        textBefore: 'I',
        textAfter: 'I ',
        cursorPosition: 2,
      }),
      event({
        id: 'replace-follow-up-2',
        eventType: 'keydown',
        timestamp: new Date('2026-05-20T12:00:00.350Z'),
        keyCode: 'KeyA',
        keyChar: 'a',
        textBefore: 'I ',
        textAfter: 'I am good!!!',
        cursorPosition: 12,
      }),
    ]);

    expect(timeline.items).toHaveLength(1);
    expect(timeline.items[0]).toMatchObject({
      kind: 'replace',
      label: 'Replaced text',
      text: 'I am good!!!',
      charCount: 12,
      wordCount: 3,
      rawEventCount: 3,
      metadata: {
        replacedText: 'Long selected paragraph',
      },
    });
  });

  it('does not merge delayed typing into a previous replacement', () => {
    const timeline = buildDocumentEventTimeline([
      event({
        id: 'replace-start-delayed',
        eventType: 'keydown',
        timestamp: new Date('2026-05-20T12:00:00.000Z'),
        keyCode: 'KeyI',
        keyChar: 'I',
        textBefore: 'Long selected paragraph',
        textAfter: 'I',
        cursorPosition: 1,
        metadata: {
          selectedText: 'Long selected paragraph',
        },
      }),
      event({
        id: 'replace-delayed-typing',
        eventType: 'keydown',
        timestamp: new Date('2026-05-20T12:00:03.000Z'),
        keyCode: 'KeyA',
        keyChar: 'a',
        textBefore: 'I',
        textAfter: 'Ia',
        cursorPosition: 2,
      }),
    ]);

    expect(timeline.items.map((item) => item.kind)).toEqual(['typing_burst', 'replace']);
    expect(timeline.items[1]).toMatchObject({
      kind: 'replace',
      text: 'I',
    });
  });

  it('shows paste over selection as a replace item instead of paste or delete', () => {
    const timeline = buildDocumentEventTimeline([
      event({
        id: 'replace-by-paste',
        eventType: 'paste',
        timestamp: new Date('2026-05-20T12:00:00.300Z'),
        keyCode: 'KeyV',
        textBefore: 'Intro old text outro',
        textAfter: 'Intro pasted text outro',
        cursorPosition: 17,
        selectionStart: 17,
        selectionEnd: 17,
        metadata: {
          selectedText: 'old text',
        },
      }),
    ]);

    expect(timeline.items).toHaveLength(1);
    expect(timeline.items[0]).toMatchObject({
      kind: 'replace',
      label: 'Replaced text',
      text: 'pasted text',
      metadata: {
        replacedText: 'old text',
      },
    });
    expect(timeline.summary.pasteCharacters).toBe(0);
    expect(timeline.summary.deletedCharacters).toBe(0);
  });

  it('shows AI chat insertion as a primary AI insert item', () => {
    const timeline = buildDocumentEventTimeline([
      event({
        id: 'ai-insert-chat-1',
        eventType: 'ai_insert_from_chat',
        timestamp: new Date('2026-05-20T12:00:00.300Z'),
        textBefore: 'Intro text.',
        textAfter: 'Intro text.AI inserted answer.',
        cursorPosition: 30,
        selectionStart: 11,
        selectionEnd: 11,
        metadata: {
          messageId: 'message-1',
          logId: 'log-1',
          insertedTextLength: 19,
        },
      }),
    ]);

    expect(timeline.items).toHaveLength(1);
    expect(timeline.items[0]).toMatchObject({
      kind: 'ai_insert',
      label: 'AI inserted text',
      text: 'AI inserted answer.',
      charCount: 19,
      wordCount: 3,
      rawEventCount: 1,
      metadata: {
        messageId: 'message-1',
        logId: 'log-1',
      },
    });
    expect(timeline.items[0].rawEvents[0]).toMatchObject({
      eventType: 'ai_insert_from_chat',
      insertedText: 'AI inserted answer.',
    });
  });

  it('does not show the editor input mirror for AI chat insertion as typed text', () => {
    const before = 'Intro text.';
    const after = 'Intro text.AI inserted answer.';
    const timeline = buildDocumentEventTimeline([
      event({
        id: 'input-mirror-ai-insert',
        eventType: 'input',
        timestamp: new Date('2026-05-20T12:00:00.300Z'),
        textBefore: before,
        textAfter: after,
        cursorPosition: 30,
        selectionStart: 11,
        selectionEnd: 11,
      }),
      event({
        id: 'ai-insert-chat-1',
        eventType: 'ai_insert_from_chat',
        timestamp: new Date('2026-05-20T12:00:00.350Z'),
        textBefore: before,
        textAfter: after,
        cursorPosition: 30,
        selectionStart: 11,
        selectionEnd: 11,
        metadata: {
          messageId: 'message-1',
          logId: 'log-1',
          insertedTextLength: 19,
        },
      }),
    ]);

    expect(timeline.items).toHaveLength(1);
    expect(timeline.items[0]).toMatchObject({
      kind: 'ai_insert',
      text: 'AI inserted answer.',
      rawEventCount: 1,
    });
    expect(timeline.summary).toMatchObject({
      rawEventTotal: 2,
      timelineItemTotal: 1,
      typingBursts: 0,
      typedCharacters: 0,
    });
  });

  it('uses the best recent selection when the final selection event is noisy', () => {
    const timeline = buildDocumentEventTimeline([
      event({
        id: 'select-good',
        eventType: 'select',
        timestamp: new Date('2026-05-20T12:00:00.000Z'),
        textBefore: 'Hi\n\n\n\nI am Frank.\n\n\n\n\nNVIDIA paragraph',
        textAfter: 'Hi\n\n\n\nI am Frank.\n\n\n\n\nNVIDIA paragraph',
        cursorPosition: 40,
        selectionStart: 20,
        selectionEnd: 36,
        metadata: {
          selectedText: 'NVIDIA paragraph',
        },
      }),
      event({
        id: 'select-noisy',
        eventType: 'select',
        timestamp: new Date('2026-05-20T12:00:00.200Z'),
        textBefore: 'Hi\n\n\n\nI am Frank.\n\n\n\n\nNVIDIA paragraph',
        textAfter: 'Hi\n\n\n\nI am Frank.\n\n\n\n\nNVIDIA paragraph',
        cursorPosition: 1,
        selectionStart: 1,
        selectionEnd: 40,
        metadata: {
          selectedText: 'unrelated final selection snapshot',
        },
      }),
      event({
        id: 'delete-ambiguous',
        eventType: 'delete',
        timestamp: new Date('2026-05-20T12:00:00.400Z'),
        keyCode: 'Backspace',
        textBefore: 'Hi\n\n\n\nI am Frank.\n\n\n\n\nNVIDIA paragraph',
        textAfter: 'Hi\n\nI am Frank.\n\n\n',
        cursorPosition: 1,
        selectionStart: 1,
        selectionEnd: 1,
      }),
    ]);

    expect(timeline.items[0]).toMatchObject({
      kind: 'delete',
      text: 'NVIDIA paragraph',
      charCount: 16,
    });
  });

  it('prefers selected text captured on the delete event itself', () => {
    const timeline = buildDocumentEventTimeline([
      event({
        id: 'delete-with-selected-text',
        eventType: 'delete',
        timestamp: new Date('2026-05-20T12:00:00.400Z'),
        keyCode: 'Backspace',
        textBefore: 'Intro I am Frank. NVIDIA paragraph I am Frank.',
        textAfter: 'Intro I am Frank. I am Frank.',
        cursorPosition: 16,
        selectionStart: 16,
        selectionEnd: 16,
        metadata: {
          selectedText: 'NVIDIA paragraph',
        },
      }),
    ]);

    expect(timeline.items[0]).toMatchObject({
      kind: 'delete',
      text: 'NVIDIA paragraph',
      charCount: 16,
    });
  });

  it('splits typing when cursor continuity breaks', () => {
    const timeline = buildDocumentEventTimeline([
      ...typingEvents('ab'),
      event({
        id: 'jump-1',
        eventType: 'keydown',
        timestamp: new Date('2026-05-20T12:00:00.300Z'),
        keyChar: 'x',
        textBefore: 'ab',
        textAfter: 'axb',
        cursorPosition: 2,
      }),
    ]);

    expect(timeline.items).toHaveLength(2);
    expect(timeline.items.map((item) => item.text)).toEqual(['x', 'ab']);
  });

  it('falls back to keyChar for legacy rows without text snapshots', () => {
    const timeline = buildDocumentEventTimeline([
      event({
        id: 'legacy-1',
        eventType: 'input',
        timestamp: new Date('2026-05-20T12:00:00.000Z'),
        keyChar: 'Q',
        cursorPosition: 1,
      }),
      event({
        id: 'legacy-2',
        eventType: 'input',
        timestamp: new Date('2026-05-20T12:00:00.100Z'),
        keyChar: 'A',
        cursorPosition: 2,
      }),
    ]);

    expect(timeline.items).toHaveLength(1);
    expect(timeline.items[0]).toMatchObject({
      kind: 'typing_burst',
      text: 'QA',
      charCount: 2,
    });
  });
});

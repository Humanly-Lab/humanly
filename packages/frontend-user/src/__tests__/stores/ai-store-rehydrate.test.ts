/**
 * Tests for the session-load tool-call rehydration (issue #94).
 * Locks the in-memory shape `ToolCallTimeline` consumes against the
 * persisted `AgentToolCallRecord` shape so a backend schema drift surfaces
 * in CI before it silently hides the agent trail on reopen.
 */

import type { AIChatMessage } from '@humanly/shared';
import { rehydrateToolCallTimelines } from '../../stores/ai-store';

function userMsg(id: string, content = 'q'): AIChatMessage {
  return { id, role: 'user', content, timestamp: new Date() };
}

function assistantMsg(
  id: string,
  toolCalls: AIChatMessage['metadata'] extends infer M
    ? M extends { toolCalls?: infer T }
      ? T
      : never
    : never,
): AIChatMessage {
  return {
    id,
    role: 'assistant',
    content: 'answer',
    timestamp: new Date(),
    metadata: { toolCalls },
  };
}

describe('rehydrateToolCallTimelines', () => {
  it('returns an empty record when no messages carry tool calls', () => {
    expect(rehydrateToolCallTimelines([])).toEqual({});
    expect(
      rehydrateToolCallTimelines([userMsg('u-1'), { ...userMsg('a-1'), role: 'assistant' }]),
    ).toEqual({});
  });

  it('skips user / system messages even if metadata is present', () => {
    const msg: AIChatMessage = {
      id: 'u-1',
      role: 'user',
      content: 'q',
      timestamp: new Date(),
      metadata: { toolCalls: [{ toolCallId: 'x', toolName: 'ls', args: {}, startedAt: '2026-05-15T00:00:00Z' }] } as any,
    };
    expect(rehydrateToolCallTimelines([msg])).toEqual({});
  });

  it('converts ISO timestamps to epoch ms and flags resolved calls as done', () => {
    const startedAt = '2026-05-15T10:00:00.000Z';
    const completedAt = '2026-05-15T10:00:00.500Z';
    const messages: AIChatMessage[] = [
      assistantMsg('msg-1', [
        {
          toolCallId: 'tc-1',
          toolName: 'grep',
          args: { file: 'f', pattern: 'p' },
          result: '[{"line":1}]',
          isError: false,
          durationMs: 500,
          startedAt,
          completedAt,
        },
      ]),
    ];

    const timelines = rehydrateToolCallTimelines(messages);
    expect(Object.keys(timelines)).toEqual(['msg-1']);
    const entry = timelines['msg-1'][0];
    expect(entry).toMatchObject({
      toolCallId: 'tc-1',
      toolName: 'grep',
      args: { file: 'f', pattern: 'p' },
      result: '[{"line":1}]',
      isError: false,
      durationMs: 500,
      status: 'done',
    });
    expect(entry.startedAt).toBe(Date.parse(startedAt));
    expect(entry.completedAt).toBe(Date.parse(completedAt));
  });

  it('preserves status "pending" for orphan tool calls (no result persisted)', () => {
    const messages: AIChatMessage[] = [
      assistantMsg('msg-1', [
        {
          toolCallId: 'tc-1',
          toolName: 'ls',
          args: {},
          startedAt: '2026-05-15T10:00:00.000Z',
        },
      ]),
    ];
    const entry = rehydrateToolCallTimelines(messages)['msg-1'][0];
    expect(entry.status).toBe('pending');
    expect(entry.result).toBeUndefined();
    expect(entry.completedAt).toBeUndefined();
  });

  it('handles multiple assistant turns independently', () => {
    const messages: AIChatMessage[] = [
      assistantMsg('msg-1', [
        { toolCallId: 'a', toolName: 'ls', args: {}, result: 'ok', isError: false, startedAt: '2026-05-15T10:00:00Z', completedAt: '2026-05-15T10:00:00.100Z' },
      ]),
      userMsg('u-2'),
      assistantMsg('msg-3', [
        { toolCallId: 'b', toolName: 'grep', args: {}, result: 'ok', isError: false, startedAt: '2026-05-15T10:01:00Z', completedAt: '2026-05-15T10:01:00.100Z' },
        { toolCallId: 'c', toolName: 'read', args: {}, result: 'ok', isError: false, startedAt: '2026-05-15T10:01:01Z', completedAt: '2026-05-15T10:01:01.100Z' },
      ]),
    ];
    const timelines = rehydrateToolCallTimelines(messages);
    expect(Object.keys(timelines).sort()).toEqual(['msg-1', 'msg-3']);
    expect(timelines['msg-1']).toHaveLength(1);
    expect(timelines['msg-3']).toHaveLength(2);
    expect(timelines['msg-3'].map(e => e.toolCallId)).toEqual(['b', 'c']);
  });
});

/**
 * Unit tests for AIModel's defensive FK-violation handling.
 *
 * Issue #90: a stale `sessionId` reaching `ai_chat_messages` produced a raw
 * Postgres constraint name in the UI (`ai_chat_messages_session_id_fkey`).
 * The model now translates that into a typed `AIChatSessionMissingError` so
 * the service layer can return a clean 409 instead.
 */

jest.mock('../../config/database', () => ({
  query: jest.fn(),
  queryOne: jest.fn(),
}));

import { AIModel, AIChatSessionMissingError } from '../../models/ai.model';
import { query, queryOne } from '../../config/database';

const mockQuery = query as jest.MockedFunction<typeof query>;
const mockQueryOne = queryOne as jest.MockedFunction<typeof queryOne>;

function makeSessionRow(overrides: Partial<any> = {}) {
  return {
    id: 'session-1',
    document_id: 'doc-1',
    user_id: 'user-1',
    status: 'active',
    model_version: null,
    model_capabilities: null,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  };
}

function makeInteractionLogRow(overrides: Partial<any> = {}) {
  return {
    id: 'log-1',
    document_id: 'doc-1',
    user_id: 'user-1',
    session_id: null,
    query: 'What is Nvidia?',
    query_type: 'other',
    question_category: null,
    context_snapshot: {},
    response: null,
    suggestions: [],
    response_time_ms: null,
    tokens_used: {},
    modifications_applied: false,
    modifications: [],
    model_version: null,
    status: 'pending',
    error_message: null,
    created_at: new Date(),
    ...overrides,
  };
}

describe('AIModel.createSession legacy schema handling', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
  });

  it('falls back when ai_chat_sessions model snapshot columns are missing', async () => {
    mockQuery.mockResolvedValueOnce([]);
    mockQueryOne.mockResolvedValueOnce(makeSessionRow({
      model_version: undefined,
      model_capabilities: undefined,
    }));

    const session = await AIModel.createSession('doc-1', 'user-1', {
      modelVersion: 'GPT-4o mini',
      capabilities: { inputs: ['text'], tools: [] } as any,
    });

    expect(session.id).toBe('session-1');
    expect(session.modelVersion).toBeUndefined();
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQueryOne).toHaveBeenCalledTimes(1);
    expect(mockQueryOne.mock.calls[0][0]).toContain('INSERT INTO ai_chat_sessions (document_id, user_id, status)');
  });

  it('persists a model snapshot when the session capability columns exist', async () => {
    mockQuery.mockResolvedValueOnce([
      { column_name: 'model_version' },
      { column_name: 'model_capabilities' },
    ]);
    mockQueryOne.mockResolvedValueOnce(makeSessionRow({
      model_version: 'GPT-4o mini',
      model_capabilities: { inputs: ['text'], tools: [] },
    }));

    const session = await AIModel.createSession('doc-1', 'user-1', {
      modelVersion: 'GPT-4o mini',
      capabilities: { inputs: ['text'], tools: [] } as any,
    });

    expect(session.modelVersion).toBe('GPT-4o mini');
    expect(mockQuery).toHaveBeenCalledTimes(1);
    expect(mockQueryOne).toHaveBeenCalledTimes(1);
    expect(mockQueryOne.mock.calls[0][0]).toContain('model_capabilities');
  });
});

describe('AIModel timestamp serialization', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
  });

  it('treats AI interaction TIMESTAMP rows as UTC wall-clock time', async () => {
    const pgParsedTimestamp = new Date(2026, 4, 21, 14, 39, 57, 123);
    mockQueryOne.mockResolvedValueOnce(makeInteractionLogRow({
      created_at: pgParsedTimestamp,
    }));

    const log = await AIModel.createLog({
      documentId: 'doc-1',
      userId: 'user-1',
      query: 'What is Nvidia?',
    });

    const expectedTimestamp = new Date(Date.UTC(2026, 4, 21, 14, 39, 57, 123));
    expect(log.timestamp).toEqual(expectedTimestamp);
    expect(log.createdAt).toEqual(expectedTimestamp);
  });
});

describe('AIModel.addMessage FK violation handling', () => {
  beforeEach(() => {
    mockQuery.mockReset();
    mockQueryOne.mockReset();
  });

  it('translates the ai_chat_messages_session_id_fkey violation into AIChatSessionMissingError', async () => {
    const pgError = Object.assign(new Error('insert or update on table "ai_chat_messages" violates foreign key constraint "ai_chat_messages_session_id_fkey"'), {
      code: '23503',
      constraint: 'ai_chat_messages_session_id_fkey',
    });
    mockQueryOne.mockRejectedValueOnce(pgError);

    await expect(
      AIModel.addMessage('stale-session-id', 'user', 'hi'),
    ).rejects.toBeInstanceOf(AIChatSessionMissingError);
  });

  it('exposes the offending sessionId on the typed error', async () => {
    const pgError = Object.assign(new Error('FK violation'), {
      code: '23503',
      constraint: 'ai_chat_messages_session_id_fkey',
    });
    mockQueryOne.mockRejectedValueOnce(pgError);

    try {
      await AIModel.addMessage('stale-uuid', 'user', 'hi');
      fail('expected AIChatSessionMissingError');
    } catch (error) {
      expect(error).toBeInstanceOf(AIChatSessionMissingError);
      expect((error as AIChatSessionMissingError).sessionId).toBe('stale-uuid');
    }
  });

  it('passes through unrelated FK violations untouched', async () => {
    const pgError = Object.assign(new Error('different fk'), {
      code: '23503',
      constraint: 'some_other_fkey',
    });
    mockQueryOne.mockRejectedValueOnce(pgError);

    await expect(
      AIModel.addMessage('s1', 'user', 'hi'),
    ).rejects.not.toBeInstanceOf(AIChatSessionMissingError);
  });

  it('passes through non-FK errors untouched', async () => {
    mockQueryOne.mockRejectedValueOnce(new Error('connection lost'));

    await expect(
      AIModel.addMessage('s1', 'user', 'hi'),
    ).rejects.toThrow('connection lost');
  });
});

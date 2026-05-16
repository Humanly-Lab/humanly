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
import { queryOne } from '../../config/database';

const mockQueryOne = queryOne as jest.MockedFunction<typeof queryOne>;

describe('AIModel.addMessage FK violation handling', () => {
  beforeEach(() => {
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

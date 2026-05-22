/**
 * Unit tests for ai.controller.ts
 * AIService and AISelectionActionModel are fully mocked.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../services/ai.service');
jest.mock('../../models/ai-selection-action.model');
jest.mock('../../models/ai.model');
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { Request, Response } from 'express';
import {
  sendChatMessage,
  getLogs,
  getLog,
  applySuggestion,
  getSessions,
  getSession,
  deleteSession,
  trackSelectionAction,
  getSelectionStats,
} from '../../controllers/ai.controller';
import { AIService } from '../../services/ai.service';
import { AISelectionActionModel } from '../../models/ai-selection-action.model';
import { AIModel } from '../../models/ai.model';

const MockAIService = AIService as jest.Mocked<typeof AIService>;
const MockSelectionActionModel = AISelectionActionModel as jest.Mocked<typeof AISelectionActionModel>;
const MockAIModel = AIModel as jest.Mocked<typeof AIModel>;

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { userId: 'user-1' },
    body: {},
    params: {},
    query: {},
    ...overrides,
  } as any;
}

function makeRes(): jest.Mocked<Response> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function makeMessage(overrides: Partial<any> = {}): any {
  return {
    id: 'msg-1',
    sessionId: 'session-1',
    role: 'assistant',
    content: 'AI response',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeLog(overrides: Partial<any> = {}): any {
  return {
    id: 'log-1',
    documentId: 'doc-1',
    userId: 'user-1',
    query: 'Fix grammar',
    queryType: 'grammar_check',
    status: 'success',
    ...overrides,
  };
}

function makeSession(overrides: Partial<any> = {}): any {
  return {
    id: 'session-1',
    documentId: 'doc-1',
    userId: 'user-1',
    status: 'active',
    messages: [],
    createdAt: new Date(),
    ...overrides,
  };
}

function makeSelectionAction(overrides: Partial<any> = {}): any {
  return {
    id: 'action-1',
    documentId: 'doc-1',
    userId: 'user-1',
    actionType: 'grammar',
    originalText: 'teh cat',
    suggestedText: 'the cat',
    decision: 'accepted',
    finalText: 'the cat',
    createdAt: new Date(),
    ...overrides,
  };
}

// ── sendChatMessage ───────────────────────────────────────────────────────────

describe('sendChatMessage', () => {
  const validBody = { documentId: 'doc-1', message: 'Improve this text' };

  it('calls AIService.chat and returns response', async () => {
    const chatResponse = { sessionId: 'session-1', message: makeMessage(), logId: 'log-1' };
    MockAIService.chat.mockResolvedValue(chatResponse);

    const req = makeReq({ body: validBody });
    const res = makeRes();

    await sendChatMessage(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: chatResponse })
    );
    expect(MockAIService.chat).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ documentId: 'doc-1', message: 'Improve this text' })
    );
  });

  it('calls AIService.silentChat when silent=true', async () => {
    const silentResponse = { message: makeMessage({ id: 'silent-123' }) };
    MockAIService.silentChat.mockResolvedValue(silentResponse);

    const req = makeReq({ body: { ...validBody, silent: true } });
    const res = makeRes();

    await sendChatMessage(req, res);

    expect(MockAIService.silentChat).toHaveBeenCalled();
    expect(MockAIService.chat).not.toHaveBeenCalled();
  });

  it('throws 401 when user is not authenticated', async () => {
    const req = makeReq({ user: undefined });
    const res = makeRes();

    await expect(sendChatMessage(req, res)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 400 when documentId is missing', async () => {
    const req = makeReq({ body: { message: 'hello' } });
    const res = makeRes();

    await expect(sendChatMessage(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when message is missing', async () => {
    const req = makeReq({ body: { documentId: 'doc-1' } });
    const res = makeRes();

    await expect(sendChatMessage(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when message is whitespace only', async () => {
    const req = makeReq({ body: { documentId: 'doc-1', message: '   ' } });
    const res = makeRes();

    await expect(sendChatMessage(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('trims whitespace from message before passing to service', async () => {
    MockAIService.chat.mockResolvedValue({ sessionId: 's1', message: makeMessage(), logId: 'l1' });

    const req = makeReq({ body: { documentId: 'doc-1', message: '  hello world  ' } });
    const res = makeRes();

    await sendChatMessage(req, res);

    expect(MockAIService.chat).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ message: 'hello world' })
    );
  });

  it('passes explicit fresh-session requests to AIService.chat', async () => {
    MockAIService.chat.mockResolvedValue({ sessionId: 'session-2', message: makeMessage(), logId: 'log-2' });

    const req = makeReq({ body: { ...validBody, forceNewSession: true } });
    const res = makeRes();

    await sendChatMessage(req, res);

    expect(MockAIService.chat).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ forceNewSession: true })
    );
  });
});

// ── getLogs ───────────────────────────────────────────────────────────────────

describe('getLogs', () => {
  it('returns logs with pagination', async () => {
    MockAIService.getLogs.mockResolvedValue({ logs: [makeLog()], total: 1 });

    const req = makeReq({ query: { documentId: 'doc-1' } });
    const res = makeRes();

    await getLogs(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: true,
        data: [makeLog()],
        pagination: expect.objectContaining({ total: 1 }),
      })
    );
  });

  it('throws 401 when unauthenticated', async () => {
    const req = makeReq({ user: undefined, query: { documentId: 'doc-1' } });
    const res = makeRes();

    await expect(getLogs(req, res)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 400 when documentId is missing', async () => {
    const req = makeReq({ query: {} });
    const res = makeRes();

    await expect(getLogs(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('parses limit and offset from query', async () => {
    MockAIService.getLogs.mockResolvedValue({ logs: [], total: 0 });

    const req = makeReq({ query: { documentId: 'doc-1', limit: '10', offset: '20' } });
    const res = makeRes();

    await getLogs(req, res);

    expect(MockAIService.getLogs).toHaveBeenCalledWith(
      'user-1',
      'doc-1',
      expect.objectContaining({ limit: 10, offset: 20 })
    );
  });

  it('hasMore is true when more results exist', async () => {
    MockAIService.getLogs.mockResolvedValue({ logs: [makeLog()], total: 100 });

    const req = makeReq({ query: { documentId: 'doc-1', limit: '1', offset: '0' } });
    const res = makeRes();

    await getLogs(req, res);

    expect(res.json.mock.calls[0][0].pagination.hasMore).toBe(true);
  });
});

// ── getLog ────────────────────────────────────────────────────────────────────

describe('getLog', () => {
  it('returns a single log', async () => {
    MockAIService.getLog.mockResolvedValue(makeLog());

    const req = makeReq({ params: { logId: 'log-1' } });
    const res = makeRes();

    await getLog(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: makeLog() })
    );
  });

  it('throws 401 when unauthenticated', async () => {
    const req = makeReq({ user: undefined, params: { logId: 'log-1' } });
    const res = makeRes();

    await expect(getLog(req, res)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 400 when logId is missing', async () => {
    const req = makeReq({ params: {} });
    const res = makeRes();

    await expect(getLog(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── applySuggestion ───────────────────────────────────────────────────────────

describe('applySuggestion', () => {
  const validBody = {
    logId: 'log-1',
    suggestionId: 'sug-1',
    modification: { type: 'grammar', before: 'teh', after: 'the' },
  };

  it('applies suggestion and returns updated log', async () => {
    MockAIService.applySuggestion.mockResolvedValue(makeLog());

    const req = makeReq({ body: validBody });
    const res = makeRes();

    await applySuggestion(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: makeLog() })
    );
    expect(MockAIService.applySuggestion).toHaveBeenCalledWith(
      'user-1',
      'log-1',
      'sug-1',
      expect.objectContaining({ type: 'grammar', before: 'teh', after: 'the' })
    );
  });

  it('throws 401 when unauthenticated', async () => {
    const req = makeReq({ user: undefined, body: validBody });
    const res = makeRes();

    await expect(applySuggestion(req, res)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 400 when logId is missing', async () => {
    const req = makeReq({ body: { ...validBody, logId: undefined } });
    const res = makeRes();

    await expect(applySuggestion(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when suggestionId is missing', async () => {
    const req = makeReq({ body: { ...validBody, suggestionId: undefined } });
    const res = makeRes();

    await expect(applySuggestion(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when modification is incomplete', async () => {
    const req = makeReq({ body: { ...validBody, modification: { type: 'grammar' } } });
    const res = makeRes();

    await expect(applySuggestion(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('defaults location to {startOffset:0, endOffset:0} when not provided', async () => {
    MockAIService.applySuggestion.mockResolvedValue(makeLog());

    const req = makeReq({ body: validBody });
    const res = makeRes();

    await applySuggestion(req, res);

    expect(MockAIService.applySuggestion).toHaveBeenCalledWith(
      'user-1',
      'log-1',
      'sug-1',
      expect.objectContaining({ location: { startOffset: 0, endOffset: 0 } })
    );
  });
});

// ── getSessions ───────────────────────────────────────────────────────────────

describe('getSessions', () => {
  it('returns sessions for a document', async () => {
    const session = makeSession();
    MockAIService.getSessions.mockResolvedValue([session]);

    const req = makeReq({ params: { documentId: 'doc-1' } });
    const res = makeRes();

    await getSessions(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: [session] })
    );
  });

  it('throws 401 when unauthenticated', async () => {
    const req = makeReq({ user: undefined, params: { documentId: 'doc-1' } });
    const res = makeRes();

    await expect(getSessions(req, res)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 400 when documentId is missing', async () => {
    const req = makeReq({ params: {} });
    const res = makeRes();

    await expect(getSessions(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('passes limit query param to service', async () => {
    MockAIService.getSessions.mockResolvedValue([]);

    const req = makeReq({ params: { documentId: 'doc-1' }, query: { limit: '5' } });
    const res = makeRes();

    await getSessions(req, res);

    expect(MockAIService.getSessions).toHaveBeenCalledWith('user-1', 'doc-1', 5);
  });
});

// ── getSession ────────────────────────────────────────────────────────────────

describe('getSession', () => {
  it('returns a single session', async () => {
    const session = makeSession();
    MockAIService.getSession.mockResolvedValue(session);

    const req = makeReq({ params: { sessionId: 'session-1' } });
    const res = makeRes();

    await getSession(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: session })
    );
  });

  it('throws 401 when unauthenticated', async () => {
    const req = makeReq({ user: undefined, params: { sessionId: 'session-1' } });
    const res = makeRes();

    await expect(getSession(req, res)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 400 when sessionId is missing', async () => {
    const req = makeReq({ params: {} });
    const res = makeRes();

    await expect(getSession(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── deleteSession ─────────────────────────────────────────────────────────────

describe('deleteSession', () => {
  it('deletes session and returns success message', async () => {
    MockAIService.deleteSession.mockResolvedValue(undefined);

    const req = makeReq({ params: { sessionId: 'session-1' } });
    const res = makeRes();

    await deleteSession(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, message: 'Session deleted' })
    );
    expect(MockAIService.deleteSession).toHaveBeenCalledWith('user-1', 'session-1');
  });

  it('throws 401 when unauthenticated', async () => {
    const req = makeReq({ user: undefined, params: { sessionId: 'session-1' } });
    const res = makeRes();

    await expect(deleteSession(req, res)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 400 when sessionId is missing', async () => {
    const req = makeReq({ params: {} });
    const res = makeRes();

    await expect(deleteSession(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });
});

// ── trackSelectionAction ──────────────────────────────────────────────────────

describe('trackSelectionAction', () => {
  const validBody = {
    documentId: 'doc-1',
    logId: 'log-1',
    actionType: 'grammar',
    originalText: 'teh cat',
    suggestedText: 'the cat',
    decision: 'accepted',
  };

  it('creates and returns selection action', async () => {
    const action = makeSelectionAction();
    MockSelectionActionModel.create.mockResolvedValue(action);
    MockAIModel.updateLogWithResponse.mockResolvedValue(makeLog({ response: 'the cat' }));
    MockAIModel.updateLogWithModifications.mockResolvedValue(
      makeLog({ modificationsApplied: true, modifications: [{ before: 'teh cat', after: 'the cat' }] })
    );

    const req = makeReq({ body: validBody });
    const res = makeRes();

    await trackSelectionAction(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: action })
    );
    expect(MockSelectionActionModel.create).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        userId: 'user-1',
        actionType: 'grammar',
        decision: 'accepted',
      })
    );
    expect(MockAIModel.createLog).not.toHaveBeenCalled();
    expect(MockAIModel.updateLogWithResponse).toHaveBeenCalled();
    expect(MockAIModel.updateLogWithModifications).toHaveBeenCalled();
  });

  it('reuses the existing ai_interaction_log when logId is provided', async () => {
    const action = makeSelectionAction();
    MockSelectionActionModel.create.mockResolvedValue(action);
    MockAIModel.updateLogWithResponse.mockResolvedValue(makeLog({ id: 'log-1', response: 'the cat' }));
    MockAIModel.updateLogWithModifications.mockResolvedValue(
      makeLog({ id: 'log-1', modificationsApplied: true, modifications: [{ before: 'teh cat', after: 'the cat' }] })
    );

    const req = makeReq({ body: validBody });
    const res = makeRes();

    await trackSelectionAction(req, res);

    expect(MockAIModel.createLog).not.toHaveBeenCalled();
    expect(MockAIModel.updateLogWithResponse).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: 'success' })
    );
  });

  it('reuses a recent matching ai_interaction_log when logId is missing', async () => {
    const action = makeSelectionAction();
    MockSelectionActionModel.create.mockResolvedValue(action);
    MockAIModel.findRecentSelectionLog.mockResolvedValue(makeLog({ id: 'log-recent' }));
    MockAIModel.updateLogWithResponse.mockResolvedValue(makeLog({ id: 'log-recent', response: 'the cat' }));
    MockAIModel.updateLogWithModifications.mockResolvedValue(
      makeLog({ id: 'log-recent', modificationsApplied: true, modifications: [{ before: 'teh cat', after: 'the cat' }] })
    );

    const req = makeReq({ body: { ...validBody, logId: undefined } });
    const res = makeRes();

    await trackSelectionAction(req, res);

    expect(MockAIModel.findRecentSelectionLog).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        userId: 'user-1',
        queryType: 'grammar_check',
      })
    );
    expect(MockAIModel.createLog).not.toHaveBeenCalled();
    expect(MockAIModel.updateLogWithResponse).toHaveBeenCalledWith(
      'log-recent',
      expect.objectContaining({ status: 'success' })
    );
  });

  it('creates a fallback ai_interaction_log when logId is missing', async () => {
    const action = makeSelectionAction();
    MockSelectionActionModel.create.mockResolvedValue(action);
    MockAIModel.findRecentSelectionLog.mockResolvedValue(null);
    MockAIModel.createLog.mockResolvedValue(makeLog({ id: 'log-fallback' }));
    MockAIModel.updateLogWithResponse.mockResolvedValue(makeLog({ id: 'log-fallback', response: 'the cat' }));
    MockAIModel.updateLogWithModifications.mockResolvedValue(
      makeLog({ id: 'log-fallback', modificationsApplied: true, modifications: [{ before: 'teh cat', after: 'the cat' }] })
    );

    const req = makeReq({ body: { ...validBody, logId: undefined } });
    const res = makeRes();

    await trackSelectionAction(req, res);

    expect(MockAIModel.createLog).toHaveBeenCalledWith(
      expect.objectContaining({
        documentId: 'doc-1',
        userId: 'user-1',
        queryType: 'grammar_check',
      })
    );
    expect(MockAIModel.updateLogWithResponse).toHaveBeenCalledWith(
      'log-fallback',
      expect.objectContaining({ status: 'success' })
    );
  });

  it('still returns success when mirroring to ai_interaction_logs fails', async () => {
    const action = makeSelectionAction();
    MockSelectionActionModel.create.mockResolvedValue(action);
    MockAIModel.updateLogWithResponse.mockRejectedValue(new Error('log update failed'));

    const req = makeReq({ body: validBody });
    const res = makeRes();

    await expect(trackSelectionAction(req, res)).resolves.not.toThrow();
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: action })
    );
  });

  it('throws 401 when unauthenticated', async () => {
    const req = makeReq({ user: undefined, body: validBody });
    const res = makeRes();

    await expect(trackSelectionAction(req, res)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 400 when documentId is missing', async () => {
    const req = makeReq({ body: { ...validBody, documentId: undefined } });
    const res = makeRes();

    await expect(trackSelectionAction(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 for invalid actionType', async () => {
    const req = makeReq({ body: { ...validBody, actionType: 'unknown' } });
    const res = makeRes();

    await expect(trackSelectionAction(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when originalText is missing', async () => {
    const req = makeReq({ body: { ...validBody, originalText: undefined } });
    const res = makeRes();

    await expect(trackSelectionAction(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 when suggestedText is missing', async () => {
    const req = makeReq({ body: { ...validBody, suggestedText: undefined } });
    const res = makeRes();

    await expect(trackSelectionAction(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 400 for invalid decision value', async () => {
    const req = makeReq({ body: { ...validBody, decision: 'maybe' } });
    const res = makeRes();

    await expect(trackSelectionAction(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });

  it.each(['grammar', 'improve', 'simplify', 'formal'] as const)(
    'accepts valid actionType "%s"',
    async (actionType) => {
      MockSelectionActionModel.create.mockResolvedValue(makeSelectionAction({ actionType }));

      const req = makeReq({ body: { ...validBody, actionType } });
      const res = makeRes();

      await expect(trackSelectionAction(req, res)).resolves.not.toThrow();
    }
  );

  it.each(['accepted', 'rejected'] as const)(
    'accepts valid decision "%s"',
    async (decision) => {
      MockSelectionActionModel.create.mockResolvedValue(makeSelectionAction({ decision }));

      const req = makeReq({ body: { ...validBody, decision } });
      const res = makeRes();

      await expect(trackSelectionAction(req, res)).resolves.not.toThrow();
    }
  );
});

// ── getSelectionStats ─────────────────────────────────────────────────────────

describe('getSelectionStats', () => {
  const stats = {
    totalActions: 10,
    grammarActions: 4,
    improveActions: 3,
    simplifyActions: 2,
    formalActions: 1,
    acceptedCount: 7,
    rejectedCount: 3,
    acceptanceRate: 70,
  };

  it('returns stats for a document', async () => {
    MockSelectionActionModel.getStatsByDocumentId.mockResolvedValue(stats);

    const req = makeReq({ params: { documentId: 'doc-1' } });
    const res = makeRes();

    await getSelectionStats(req, res);

    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, data: stats })
    );
    expect(MockSelectionActionModel.getStatsByDocumentId).toHaveBeenCalledWith('doc-1');
  });

  it('throws 401 when unauthenticated', async () => {
    const req = makeReq({ user: undefined, params: { documentId: 'doc-1' } });
    const res = makeRes();

    await expect(getSelectionStats(req, res)).rejects.toMatchObject({ statusCode: 401 });
  });

  it('throws 400 when documentId is missing', async () => {
    const req = makeReq({ params: {} });
    const res = makeRes();

    await expect(getSelectionStats(req, res)).rejects.toMatchObject({ statusCode: 400 });
  });
});

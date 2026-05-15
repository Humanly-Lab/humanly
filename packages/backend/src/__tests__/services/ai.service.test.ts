/**
 * Unit tests for AIService (and exported helpers classifyQueryType / classifyQuestionCategory).
 * All DB models and fetch are mocked — no real database or network required.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../models/ai.model');
jest.mock('../../models/document.model');
jest.mock('../../models/task.model');
jest.mock('../../models/user-ai-settings.model');
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// global fetch mock
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ── Imports ───────────────────────────────────────────────────────────────────

import { AIService, classifyQuestionCategory } from '../../services/ai.service';
import { AIModel } from '../../models/ai.model';
import { DocumentModel } from '../../models/document.model';
import { TaskModel } from '../../models/task.model';
import { UserAISettingsModel } from '../../models/user-ai-settings.model';

const MockAIModel = AIModel as jest.Mocked<typeof AIModel>;
const MockDocumentModel = DocumentModel as jest.Mocked<typeof DocumentModel>;
const MockTaskModel = TaskModel as jest.Mocked<typeof TaskModel>;
const MockUserAISettings = UserAISettingsModel as jest.Mocked<typeof UserAISettingsModel>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

function makeSettings(overrides: Partial<any> = {}): any {
  return {
    apiKey: 'sk-test',
    baseUrl: 'https://api.openai.com/v1',
    model: 'gpt-4o',
    maskedApiKey: 'sk-te...st',
    updatedAt: new Date().toISOString(),
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
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeLog(overrides: Partial<any> = {}): any {
  return {
    id: 'log-1',
    documentId: 'doc-1',
    userId: 'user-1',
    sessionId: 'session-1',
    query: 'fix grammar',
    queryType: 'grammar_check',
    questionCategory: 'generation',
    status: 'pending',
    createdAt: new Date(),
    ...overrides,
  };
}

function makeMessage(overrides: Partial<any> = {}): any {
  return {
    id: 'msg-1',
    sessionId: 'session-1',
    role: 'assistant',
    content: 'Fixed.',
    createdAt: new Date(),
    ...overrides,
  };
}

function mockResponsesResponse(content: string) {
  return new Response(JSON.stringify({
    id: 'resp-1',
    object: 'response',
    created_at: Date.now(),
    status: 'completed',
    output_text: content,
    output: [
      {
        type: 'message',
        role: 'assistant',
        content: [{ type: 'output_text', text: content }],
      },
    ],
    usage: { input_tokens: 10, output_tokens: 5, total_tokens: 15 },
  }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

// ── classifyQuestionCategory ──────────────────────────────────────────────────

describe('classifyQuestionCategory', () => {
  it('classifies generation keywords', () => {
    expect(classifyQuestionCategory('rewrite this paragraph', 'rewrite')).toBe('generation');
    expect(classifyQuestionCategory('fix the grammar here', 'grammar_check')).toBe('generation');
    expect(classifyQuestionCategory('summarize this text', 'summarize')).toBe('generation');
  });

  it('classifies understanding keywords', () => {
    expect(classifyQuestionCategory('what does this mean?', 'question')).toBe('understanding');
    expect(classifyQuestionCategory('explain this concept', 'question')).toBe('understanding');
  });

  it('falls back on queryType for generation', () => {
    expect(classifyQuestionCategory('do something', 'grammar_check')).toBe('generation');
    expect(classifyQuestionCategory('do something', 'translate')).toBe('generation');
  });

  it('falls back on queryType for understanding', () => {
    expect(classifyQuestionCategory('do something', 'question')).toBe('understanding');
  });

  it('leans understanding when query contains "?" and no generation keywords', () => {
    expect(classifyQuestionCategory('is this valid?', 'other')).toBe('understanding');
  });

  it('returns "other" when no signals match', () => {
    expect(classifyQuestionCategory('do something unknown', 'other')).toBe('other');
  });
});

// ── AIService.silentChat ──────────────────────────────────────────────────────

describe('AIService.silentChat', () => {
  const request = { documentId: 'doc-1', message: 'Fix grammar', sessionId: undefined, context: undefined };

  beforeEach(() => {
    MockDocumentModel.isOwner.mockResolvedValue(true);
    MockDocumentModel.findByIdAndUserId.mockResolvedValue({
      id: 'doc-1',
      userId: 'user-1',
      environmentConfig: { aiAccess: 'on' },
    } as any);
    MockTaskModel.findBySubmissionDocument.mockResolvedValue(null);
    MockUserAISettings.getByUserId.mockResolvedValue(makeSettings());
    mockFetch.mockResolvedValue(mockResponsesResponse('Grammar fixed.'));
  });

  it('returns assistant message without creating session/log', async () => {
    const result = await AIService.silentChat('user-1', request as any);

    expect(result.message.role).toBe('assistant');
    expect(result.message.content).toBe('Grammar fixed.');
    expect(result.message.id).toMatch(/^silent-/);
    // No session or log creation
    expect(MockAIModel.getOrCreateSession).not.toHaveBeenCalled();
    expect(MockAIModel.createLog).not.toHaveBeenCalled();
  });

  it('throws 404 when user does not own document', async () => {
    MockDocumentModel.isOwner.mockResolvedValue(false);

    await expect(AIService.silentChat('user-1', request as any)).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 400 when AI settings not configured', async () => {
    MockUserAISettings.getByUserId.mockResolvedValue(null);

    await expect(AIService.silentChat('user-1', request as any)).rejects.toMatchObject({
      statusCode: 400,
      message: expect.stringContaining('AI settings'),
    });
  });

  it('throws 502 on 401 from provider', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'Invalid key' } }), {
      status: 401,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(AIService.silentChat('user-1', request as any)).rejects.toMatchObject({
      statusCode: 502,
    });
  });

  it('throws 429 on rate limit from provider', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({}), {
      status: 429,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(AIService.silentChat('user-1', request as any)).rejects.toMatchObject({
      statusCode: 429,
    });
  });

  it('throws 400 on 404 from provider (model not found)', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({}), {
      status: 404,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(AIService.silentChat('user-1', request as any)).rejects.toMatchObject({
      statusCode: 400,
    });
  });

  it('uses retrieval-capable Responses API for silent chat', async () => {
    await AIService.silentChat('user-1', request as any);

    const url = String(mockFetch.mock.calls[0][0]);
    const body = JSON.parse(mockFetch.mock.calls[0][1].body);
    expect(url).toContain('/responses');
    expect(body).toHaveProperty('tools');
    expect(body.tools.map((tool: any) => tool.name)).toContain('getDocumentPlainText');
  });
});

// ── AIService.chat ────────────────────────────────────────────────────────────

describe('AIService.chat', () => {
  const request = {
    documentId: 'doc-1',
    message: 'Improve writing',
    sessionId: undefined,
    context: undefined,
  };

  beforeEach(() => {
    MockDocumentModel.isOwner.mockResolvedValue(true);
    MockDocumentModel.findByIdAndUserId.mockResolvedValue({
      id: 'doc-1',
      userId: 'user-1',
      environmentConfig: { aiAccess: 'on' },
    } as any);
    MockTaskModel.findBySubmissionDocument.mockResolvedValue(null);
    MockUserAISettings.getByUserId.mockResolvedValue(makeSettings());
    MockAIModel.getOrCreateSession.mockResolvedValue(makeSession());
    MockAIModel.createLog.mockResolvedValue(makeLog());
    MockAIModel.addMessage.mockResolvedValue(makeMessage());
    MockAIModel.updateLogWithResponse.mockResolvedValue(makeLog());
    mockFetch.mockResolvedValue(mockResponsesResponse('Here is the improved text.'));
  });

  it('returns sessionId, message, logId on success', async () => {
    const result = await AIService.chat('user-1', request as any);

    expect(result.sessionId).toBe('session-1');
    expect(result.message.content).toBe('Fixed.');
    expect(result.logId).toBe('log-1');
  });

  it('uses existing session when sessionId is provided', async () => {
    MockAIModel.findSessionById.mockResolvedValue(makeSession());

    await AIService.chat('user-1', { ...request, sessionId: 'session-1' } as any);

    expect(MockAIModel.findSessionById).toHaveBeenCalledWith('session-1');
    expect(MockAIModel.getOrCreateSession).not.toHaveBeenCalled();
  });

  it('throws 404 when document not owned', async () => {
    MockDocumentModel.isOwner.mockResolvedValue(false);

    await expect(AIService.chat('user-1', request as any)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 400 when AI settings not configured', async () => {
    MockUserAISettings.getByUserId.mockResolvedValue(null);

    await expect(AIService.chat('user-1', request as any)).rejects.toMatchObject({ statusCode: 400 });
  });

  it('throws 404 when session not found', async () => {
    MockAIModel.getOrCreateSession.mockResolvedValue(null as any);

    await expect(AIService.chat('user-1', request as any)).rejects.toMatchObject({ statusCode: 404 });
  });

  it('updates log with error status on provider failure', async () => {
    mockFetch.mockResolvedValue(new Response(JSON.stringify({ error: { message: 'server error' } }), {
      status: 500,
      headers: { 'content-type': 'application/json' },
    }));

    await expect(AIService.chat('user-1', request as any)).rejects.toThrow();

    expect(MockAIModel.updateLogWithResponse).toHaveBeenCalledWith(
      'log-1',
      expect.objectContaining({ status: 'error' })
    );
  });

  it('adds user and assistant messages to session', async () => {
    await AIService.chat('user-1', request as any);

    const calls = MockAIModel.addMessage.mock.calls;
    expect(calls[0]).toEqual(['session-1', 'user', 'Improve writing']);
    expect(calls[1][1]).toBe('assistant');
  });
});

// ── AIService.applySuggestion ─────────────────────────────────────────────────

describe('AIService.applySuggestion', () => {
  const modification: any = {
    id: 'sug-1',
    type: 'grammar',
    before: 'teh',
    after: 'the',
    location: { startOffset: 0, endOffset: 3 },
    timestamp: new Date(),
  };

  it('applies suggestion and returns updated log', async () => {
    const log = makeLog();
    const updatedLog = makeLog({ modificationsApplied: true });
    MockAIModel.findLogById.mockResolvedValue(log);
    MockAIModel.updateLogWithModifications.mockResolvedValue(updatedLog);

    const result = await AIService.applySuggestion('user-1', 'log-1', 'sug-1', modification);

    expect(result).toBe(updatedLog);
    expect(MockAIModel.updateLogWithModifications).toHaveBeenCalledWith('log-1', [modification]);
  });

  it('throws 404 when log not found', async () => {
    MockAIModel.findLogById.mockResolvedValue(null);

    await expect(
      AIService.applySuggestion('user-1', 'log-missing', 'sug-1', modification)
    ).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 when log belongs to different user', async () => {
    MockAIModel.findLogById.mockResolvedValue(makeLog({ userId: 'user-other' }));

    await expect(
      AIService.applySuggestion('user-1', 'log-1', 'sug-1', modification)
    ).rejects.toMatchObject({ statusCode: 403 });
  });

  it('throws 500 when update fails', async () => {
    MockAIModel.findLogById.mockResolvedValue(makeLog());
    MockAIModel.updateLogWithModifications.mockResolvedValue(null);

    await expect(
      AIService.applySuggestion('user-1', 'log-1', 'sug-1', modification)
    ).rejects.toMatchObject({ statusCode: 500 });
  });
});

// ── AIService.getLogs ─────────────────────────────────────────────────────────

describe('AIService.getLogs', () => {
  it('returns logs for owned document', async () => {
    MockDocumentModel.isOwner.mockResolvedValue(true);
    MockAIModel.getLogsByDocument.mockResolvedValue({ logs: [makeLog()], total: 1 });

    const result = await AIService.getLogs('user-1', 'doc-1');

    expect(result.logs).toHaveLength(1);
    expect(result.total).toBe(1);
  });

  it('throws 404 when document not owned', async () => {
    MockDocumentModel.isOwner.mockResolvedValue(false);

    await expect(AIService.getLogs('user-1', 'doc-1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── AIService.getLog ──────────────────────────────────────────────────────────

describe('AIService.getLog', () => {
  it('returns log when user matches', async () => {
    MockAIModel.findLogById.mockResolvedValue(makeLog());

    const result = await AIService.getLog('user-1', 'log-1');

    expect(result.id).toBe('log-1');
  });

  it('throws 404 when log not found', async () => {
    MockAIModel.findLogById.mockResolvedValue(null);

    await expect(AIService.getLog('user-1', 'log-missing')).rejects.toMatchObject({ statusCode: 404 });
  });

  it('throws 403 when log belongs to different user', async () => {
    MockAIModel.findLogById.mockResolvedValue(makeLog({ userId: 'user-other' }));

    await expect(AIService.getLog('user-1', 'log-1')).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── AIService.getSessions ─────────────────────────────────────────────────────

describe('AIService.getSessions', () => {
  it('returns sessions for owned document', async () => {
    MockDocumentModel.isOwner.mockResolvedValue(true);
    MockAIModel.getSessionsByDocument.mockResolvedValue([makeSession()]);

    const result = await AIService.getSessions('user-1', 'doc-1');

    expect(result).toHaveLength(1);
  });

  it('throws 404 when document not owned', async () => {
    MockDocumentModel.isOwner.mockResolvedValue(false);

    await expect(AIService.getSessions('user-1', 'doc-1')).rejects.toMatchObject({ statusCode: 404 });
  });
});

// ── AIService.getSession ──────────────────────────────────────────────────────

describe('AIService.getSession', () => {
  it('returns session when user matches', async () => {
    MockAIModel.findSessionById.mockResolvedValue(makeSession());

    const result = await AIService.getSession('user-1', 'session-1');

    expect(result.id).toBe('session-1');
  });

  it('throws 404 when session not found', async () => {
    MockAIModel.findSessionById.mockResolvedValue(null);

    await expect(AIService.getSession('user-1', 'session-missing')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 403 when session belongs to different user', async () => {
    MockAIModel.findSessionById.mockResolvedValue(makeSession({ userId: 'user-other' }));

    await expect(AIService.getSession('user-1', 'session-1')).rejects.toMatchObject({ statusCode: 403 });
  });
});

// ── AIService.closeSession ────────────────────────────────────────────────────

describe('AIService.closeSession', () => {
  it('closes session successfully', async () => {
    MockAIModel.findSessionById.mockResolvedValue(makeSession());
    MockAIModel.closeSession.mockResolvedValue(undefined);

    await expect(AIService.closeSession('user-1', 'session-1')).resolves.not.toThrow();
    expect(MockAIModel.closeSession).toHaveBeenCalledWith('session-1');
  });

  it('throws 404 when session not found', async () => {
    MockAIModel.findSessionById.mockResolvedValue(null);

    await expect(AIService.closeSession('user-1', 'session-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 403 when session belongs to different user', async () => {
    MockAIModel.findSessionById.mockResolvedValue(makeSession({ userId: 'user-other' }));

    await expect(AIService.closeSession('user-1', 'session-1')).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

// ── AIService.deleteSession ───────────────────────────────────────────────────

describe('AIService.deleteSession', () => {
  it('deletes session successfully', async () => {
    MockAIModel.findSessionById.mockResolvedValue(makeSession());
    MockAIModel.deleteSession.mockResolvedValue(undefined);

    await expect(AIService.deleteSession('user-1', 'session-1')).resolves.not.toThrow();
    expect(MockAIModel.deleteSession).toHaveBeenCalledWith('session-1');
  });

  it('throws 404 when session not found', async () => {
    MockAIModel.findSessionById.mockResolvedValue(null);

    await expect(AIService.deleteSession('user-1', 'session-1')).rejects.toMatchObject({
      statusCode: 404,
    });
  });

  it('throws 403 when session belongs to different user', async () => {
    MockAIModel.findSessionById.mockResolvedValue(makeSession({ userId: 'user-other' }));

    await expect(AIService.deleteSession('user-1', 'session-1')).rejects.toMatchObject({
      statusCode: 403,
    });
  });
});

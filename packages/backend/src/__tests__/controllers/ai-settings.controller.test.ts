jest.mock('../../models/user-ai-settings.model');
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { Request, Response } from 'express';
import { saveSettings, testConnection } from '../../controllers/ai-settings.controller';
import { UserAISettingsModel } from '../../models/user-ai-settings.model';

const MockUserAISettingsModel = UserAISettingsModel as jest.Mocked<typeof UserAISettingsModel>;

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    user: { userId: 'user-1' },
    body: {},
    ...overrides,
  } as any;
}

function makeRes(): jest.Mocked<Response> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

function mockFetchJson(data: unknown, ok = true, status = 200) {
  (global.fetch as jest.Mock).mockResolvedValue({
    ok,
    status,
    headers: {
      get: jest.fn().mockReturnValue('application/json'),
    },
    json: jest.fn().mockResolvedValue(data),
  });
}

describe('testConnection', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as any;
    MockUserAISettingsModel.getByUserId.mockReset();
  });

  it('extracts model ids from OpenAI-style data arrays', async () => {
    mockFetchJson({
      data: [
        { id: 'gpt-4o' },
        { id: 'gpt-4.1' },
      ],
    });

    const req = makeReq({
      body: { apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1' },
    });
    const res = makeRes();

    await testConnection(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      models: ['gpt-4.1', 'gpt-4o'],
    }));
  });

  it('extracts model ids from Together top-level arrays', async () => {
    mockFetchJson([
      { id: 'moonshotai/Kimi-K2.6' },
      { id: 'Qwen/Qwen3.5-397B-A17B' },
      { uuid: 'no-id' },
    ]);

    const req = makeReq({
      body: { apiKey: 'tgp-test', baseUrl: 'https://api.together.xyz/v1' },
    });
    const res = makeRes();

    await testConnection(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Connection successful. Found 2 models.',
      models: ['Qwen/Qwen3.5-397B-A17B', 'moonshotai/Kimi-K2.6'],
    }));
  });
});

describe('saveSettings', () => {
  beforeEach(() => {
    MockUserAISettingsModel.getByUserId.mockReset();
    MockUserAISettingsModel.upsert.mockReset();
  });

  it('saves configurable token budgets with an existing key', async () => {
    MockUserAISettingsModel.getByUserId.mockResolvedValue({
      apiKey: 'sk-existing',
      baseUrl: 'https://api.together.xyz/v1',
      model: 'moonshotai/Kimi-K2.6',
      responseMaxTokens: 1024,
      agentMaxTokens: 2048,
      maskedApiKey: 'sk-ex...ing',
      updatedAt: new Date().toISOString(),
    });
    MockUserAISettingsModel.upsert.mockResolvedValue(undefined);

    const req = makeReq({
      body: {
        apiKey: '__use_existing__',
        baseUrl: 'https://api.together.xyz/v1',
        model: 'moonshotai/Kimi-K2.6',
        responseMaxTokens: 2048,
        agentMaxTokens: 4096,
      },
    });
    const res = makeRes();

    await saveSettings(req, res);

    expect(MockUserAISettingsModel.upsert).toHaveBeenCalledWith(
      'user-1',
      'sk-existing',
      'https://api.together.xyz/v1',
      'moonshotai/Kimi-K2.6',
      {
        responseMaxTokens: 2048,
        agentMaxTokens: 4096,
      },
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects token budgets outside the supported range', async () => {
    const req = makeReq({
      body: {
        apiKey: 'sk-test',
        baseUrl: 'https://api.together.xyz/v1',
        model: 'moonshotai/Kimi-K2.6',
        responseMaxTokens: 32,
        agentMaxTokens: 2048,
      },
    });
    const res = makeRes();

    await saveSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.stringContaining('Token budget must be between'),
    }));
    expect(MockUserAISettingsModel.upsert).not.toHaveBeenCalled();
  });
});

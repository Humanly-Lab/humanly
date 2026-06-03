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

  it('returns curated model ids for known OpenAI-compatible providers', async () => {
    mockFetchJson({
      data: [
        { id: 'gpt-5.5' },
        { id: 'gpt-5.4' },
        { id: 'untested-provider-model' },
      ],
    });

    const req = makeReq({
      body: { apiKey: 'sk-test', baseUrl: 'https://api.openai.com/v1' },
    });
    const res = makeRes();

    await testConnection(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Connection successful. Found 4 supported models.',
      models: ['gpt-5.5', 'gpt-5.4', 'gpt-5.4-mini', 'gpt-5.4-nano'],
    }));
  });

  it('returns curated Claude model ids through the OpenAI-compatible Anthropic endpoint', async () => {
    mockFetchJson({
      data: [
        { id: 'claude-opus-4-8' },
        { id: 'legacy-claude' },
      ],
    });

    const req = makeReq({
      body: { apiKey: 'sk-ant-test', baseUrl: 'https://api.anthropic.com/v1' },
    });
    const res = makeRes();

    await testConnection(req, res);

    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.anthropic.com/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-ant-test',
        }),
      }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Connection successful. Found 3 supported models.',
      models: ['claude-opus-4-8', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001'],
    }));
  });

  it('returns the curated Together list instead of raw provider catalog entries', async () => {
    mockFetchJson([
      { id: 'moonshotai/Kimi-K2.6' },
      { id: 'Qwen/Qwen3.5-397B-A17B' },
      { uuid: 'no-id' },
    ]);

    const req = makeReq({
      body: { apiKey: 'tgp_v1_test', baseUrl: 'https://api.together.xyz/v1' },
    });
    const res = makeRes();

    await testConnection(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Connection successful. Found 3 supported models.',
      models: [
        'moonshotai/Kimi-K2.6',
        'deepseek-ai/DeepSeek-V4-Pro',
        'zai-org/GLM-5.1',
      ],
    }));
  });

  it('authenticates OpenRouter keys against OpenRouter before returning the curated list', async () => {
    mockFetchJson({
      data: {
        label: 'Humanly OpenRouter key',
      },
    });

    const req = makeReq({
      body: { apiKey: 'sk-or-test', baseUrl: 'https://openrouter.ai/api/v1' },
    });
    const res = makeRes();

    await testConnection(req, res);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/key',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-or-test',
        }),
      }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Connection successful. Found 8 supported models.',
      models: expect.arrayContaining([
        'qwen/qwen3.5-397b-a17b',
        'anthropic/claude-sonnet-4.6',
      ]),
    }));
  });

  it('rejects non-OpenRouter keys when the selected provider is OpenRouter', async () => {
    mockFetchJson({
      error: {
        message: 'No auth credentials found',
      },
    }, false, 401);

    const req = makeReq({
      body: { apiKey: 'tgp_wrong_provider', baseUrl: 'https://openrouter.ai/api/v1' },
    });
    const res = makeRes();

    await testConnection(req, res);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/key',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer tgp_wrong_provider',
        }),
      }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: expect.stringContaining('OpenRouter authentication failed'),
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('No auth credentials found'),
    }));
  });

  it('rejects non-Together keys when the selected provider is Together AI', async () => {
    mockFetchJson({
      error: {
        message: 'Invalid API key',
      },
    }, false, 401);

    const req = makeReq({
      body: { apiKey: 'sk-or-wrong-provider', baseUrl: 'https://api.together.xyz/v1' },
    });
    const res = makeRes();

    await testConnection(req, res);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.together.xyz/v1/models',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-or-wrong-provider',
        }),
      }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: expect.stringContaining('Together AI authentication failed'),
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      message: expect.stringContaining('Invalid API key'),
    }));
  });

  it('rejects expired provider-shaped keys based on the provider response', async () => {
    mockFetchJson({
      error: {
        message: 'API key expired',
      },
    }, false, 401);

    const req = makeReq({
      body: { apiKey: 'sk-or-expired', baseUrl: 'https://openrouter.ai/api/v1' },
    });
    const res = makeRes();

    await testConnection(req, res);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://openrouter.ai/api/v1/key',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-or-expired',
        }),
      }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      message: expect.stringContaining('API key expired'),
    }));
  });

  it('rejects known provider website URLs before probing the network', async () => {
    const cases = [
      ['https://www.together.ai', 'https://api.together.xyz/v1'],
      ['https://platform.openai.com', 'https://api.openai.com/v1'],
      ['https://www.anthropic.com', 'https://api.anthropic.com/v1'],
      ['https://claude.ai', 'https://api.anthropic.com/v1'],
    ];

    for (const [baseUrl, expectedHint] of cases) {
      jest.mocked(global.fetch).mockClear();
      const req = makeReq({
        body: { apiKey: 'provider-key', baseUrl },
      });
      const res = makeRes();

      await testConnection(req, res);

      expect(global.fetch).not.toHaveBeenCalled();
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: false,
        message: expect.stringContaining(expectedHint),
      }));
    }
  });

  it('uses raw provider models only for unknown OpenAI-compatible providers', async () => {
    mockFetchJson({
      data: [
        { id: 'custom/model-b' },
        { id: 'custom/model-a' },
      ],
    });

    const req = makeReq({
      body: { apiKey: 'sk-test', baseUrl: 'https://llm.example.com/v1' },
    });
    const res = makeRes();

    await testConnection(req, res);

    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      message: 'Connection successful. Found 2 available models.',
      models: ['custom/model-a', 'custom/model-b'],
    }));
  });
});

describe('saveSettings', () => {
  beforeEach(() => {
    global.fetch = jest.fn() as any;
    MockUserAISettingsModel.getByUserId.mockReset();
    MockUserAISettingsModel.upsert.mockReset();
  });

  it('saves configurable token budgets with an existing key', async () => {
    mockFetchJson([
      { id: 'moonshotai/Kimi-K2.6' },
    ]);
    MockUserAISettingsModel.getByUserId.mockResolvedValue({
      apiKey: 'tgp_v1_existing',
      baseUrl: 'https://api.together.xyz/v1',
      model: 'moonshotai/Kimi-K2.6',
      shortcutMaxTokens: 1024,
      chatMaxTokens: 4096,
      maskedApiKey: 'sk-ex...ing',
      updatedAt: new Date().toISOString(),
    });
    MockUserAISettingsModel.upsert.mockResolvedValue(undefined);

    const req = makeReq({
      body: {
        apiKey: '__use_existing__',
        baseUrl: 'https://api.together.xyz/v1',
        model: 'moonshotai/Kimi-K2.6',
        shortcutMaxTokens: 2048,
        chatMaxTokens: 4096,
      },
    });
    const res = makeRes();

    await saveSettings(req, res);

    expect(MockUserAISettingsModel.upsert).toHaveBeenCalledWith(
      'user-1',
      'tgp_v1_existing',
      'https://api.together.xyz/v1',
      'moonshotai/Kimi-K2.6',
      {
        shortcutMaxTokens: 2048,
        chatMaxTokens: 4096,
      },
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects non-whitelisted models for known providers', async () => {
    MockUserAISettingsModel.getByUserId.mockResolvedValue({
      apiKey: 'sk-existing',
      baseUrl: 'https://openrouter.ai/api/v1',
      model: 'moonshotai/kimi-k2.6',
      shortcutMaxTokens: 1024,
      chatMaxTokens: 4096,
      maskedApiKey: 'sk-ex...ing',
      updatedAt: new Date().toISOString(),
    });

    const req = makeReq({
      body: {
        apiKey: '__use_existing__',
        baseUrl: 'https://openrouter.ai/api/v1',
        model: 'qwen/qwen-plus-2025-07-28',
      },
    });
    const res = makeRes();

    await saveSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.stringContaining('Model is not available for this provider'),
    }));
    expect(MockUserAISettingsModel.upsert).not.toHaveBeenCalled();
  });

  it('accepts legacy response/agent token budget fields during deploy rollover', async () => {
    mockFetchJson([
      { id: 'moonshotai/Kimi-K2.6' },
    ]);
    MockUserAISettingsModel.getByUserId.mockResolvedValue({
      apiKey: 'tgp_v1_existing',
      baseUrl: 'https://api.together.xyz/v1',
      model: 'moonshotai/Kimi-K2.6',
      shortcutMaxTokens: 1024,
      chatMaxTokens: 4096,
      maskedApiKey: 'sk-ex...ing',
      updatedAt: new Date().toISOString(),
    });
    MockUserAISettingsModel.upsert.mockResolvedValue(undefined);

    const req = makeReq({
      body: {
        apiKey: '__use_existing__',
        baseUrl: 'https://api.together.xyz/v1',
        model: 'moonshotai/Kimi-K2.6',
        responseMaxTokens: 1536,
        agentMaxTokens: 6144,
      },
    });
    const res = makeRes();

    await saveSettings(req, res);

    expect(MockUserAISettingsModel.upsert).toHaveBeenCalledWith(
      'user-1',
      'tgp_v1_existing',
      'https://api.together.xyz/v1',
      'moonshotai/Kimi-K2.6',
      {
        shortcutMaxTokens: 1536,
        chatMaxTokens: 6144,
      },
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  it('rejects saving settings when the key does not match the selected provider', async () => {
    mockFetchJson({
      error: {
        message: 'Invalid API key',
      },
    }, false, 401);

    const req = makeReq({
      body: {
        apiKey: 'sk-or-wrong-provider',
        baseUrl: 'https://api.together.xyz/v1',
        model: 'moonshotai/Kimi-K2.6',
      },
    });
    const res = makeRes();

    await saveSettings(req, res);

    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.together.xyz/v1/models',
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: 'Bearer sk-or-wrong-provider',
        }),
      }),
    );
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.stringContaining('Together AI authentication failed'),
    }));
    expect(MockUserAISettingsModel.upsert).not.toHaveBeenCalled();
  });

  it('rejects saving settings when a known provider base URL is malformed', async () => {
    const req = makeReq({
      body: {
        apiKey: 'tgp_v1_test',
        baseUrl: 'https://api.together.xyz',
        model: 'moonshotai/Kimi-K2.6',
      },
    });
    const res = makeRes();

    await saveSettings(req, res);

    expect(global.fetch).not.toHaveBeenCalled();
    expect(MockUserAISettingsModel.getByUserId).not.toHaveBeenCalled();
    expect(MockUserAISettingsModel.upsert).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.stringContaining('https://api.together.xyz/v1'),
    }));
  });

  it('rejects token budgets outside the supported range', async () => {
    const req = makeReq({
      body: {
        apiKey: 'tgp_v1_test',
        baseUrl: 'https://api.together.xyz/v1',
        model: 'moonshotai/Kimi-K2.6',
        shortcutMaxTokens: 32,
        chatMaxTokens: 4096,
      },
    });
    const res = makeRes();

    await saveSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.stringContaining('Token budget must be between'),
    }));
    expect(global.fetch).not.toHaveBeenCalled();
    expect(MockUserAISettingsModel.upsert).not.toHaveBeenCalled();
  });
});

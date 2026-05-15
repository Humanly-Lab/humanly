import { MODEL_WHITELIST, getWhitelist } from '@/lib/ai-models';

// ── MODEL_WHITELIST shape ────────────────────────────────────────────────────

describe('MODEL_WHITELIST', () => {
  const knownHosts = [
    'api.openai.com',
    'api.deepseek.com',
    'api.anthropic.com',
    'generativelanguage.googleapis.com',
    'openrouter.ai',
    'api.together.xyz',
  ];

  it('contains all expected providers', () => {
    const keys = Object.keys(MODEL_WHITELIST);
    knownHosts.forEach((host) => {
      expect(keys).toContain(host);
    });
  });

  it('each provider has between 1 and 10 curated models', () => {
    Object.entries(MODEL_WHITELIST).forEach(([host, models]) => {
      expect(models.length).toBeGreaterThanOrEqual(1);
      expect(models.length).toBeLessThanOrEqual(10);
    });
  });

  it('every entry is a non-empty string', () => {
    Object.values(MODEL_WHITELIST).flat().forEach((model) => {
      expect(typeof model).toBe('string');
      expect(model.length).toBeGreaterThan(0);
    });
  });

  it('has no duplicate model names within a provider', () => {
    Object.entries(MODEL_WHITELIST).forEach(([host, models]) => {
      const unique = new Set(models);
      expect(unique.size).toBe(models.length);
    });
  });

  it('defaults Together choices to the verified Qwen3.5 agent model', () => {
    const togetherModels = MODEL_WHITELIST['api.together.xyz'];
    expect(togetherModels).toEqual([
      'Qwen/Qwen3.5-397B-A17B',
      'moonshotai/Kimi-K2.6',
      'deepseek-ai/DeepSeek-V4-Pro',
      'zai-org/GLM-5',
    ]);
    expect(togetherModels).not.toContain('moonshotai/Kimi-K2.5');
    expect(togetherModels).not.toContain('zai-org/GLM-5.1');
    expect(togetherModels).not.toContain('Qwen/Qwen3.5-9B');
    expect(togetherModels).not.toContain('Qwen/Qwen3.6-Plus');
    expect(togetherModels).not.toContain('meta-llama/Llama-3.3-70B-Instruct-Turbo');
  });
});

// ── getWhitelist ─────────────────────────────────────────────────────────────

describe('getWhitelist', () => {
  // ── known providers ──────────────────────────────────────────────────────

  it('returns OpenAI whitelist for https://api.openai.com/v1', () => {
    const result = getWhitelist('https://api.openai.com/v1');
    expect(result).toEqual(MODEL_WHITELIST['api.openai.com']);
  });

  it('returns OpenAI whitelist for https://api.openai.com (no path)', () => {
    const result = getWhitelist('https://api.openai.com');
    expect(result).toEqual(MODEL_WHITELIST['api.openai.com']);
  });

  it('returns DeepSeek whitelist for https://api.deepseek.com/v1', () => {
    const result = getWhitelist('https://api.deepseek.com/v1');
    expect(result).toEqual(MODEL_WHITELIST['api.deepseek.com']);
  });

  it('returns Anthropic whitelist for https://api.anthropic.com/v1', () => {
    const result = getWhitelist('https://api.anthropic.com/v1');
    expect(result).toEqual(MODEL_WHITELIST['api.anthropic.com']);
  });

  it('returns Google whitelist for https://generativelanguage.googleapis.com/v1beta', () => {
    const result = getWhitelist('https://generativelanguage.googleapis.com/v1beta');
    expect(result).toEqual(MODEL_WHITELIST['generativelanguage.googleapis.com']);
  });

  it('returns OpenRouter whitelist for https://openrouter.ai/api/v1', () => {
    const result = getWhitelist('https://openrouter.ai/api/v1');
    expect(result).toEqual(MODEL_WHITELIST['openrouter.ai']);
  });

  it('returns Together whitelist for https://api.together.xyz/v1', () => {
    const result = getWhitelist('https://api.together.xyz/v1');
    expect(result).toEqual(MODEL_WHITELIST['api.together.xyz']);
  });

  // ── known provider: list size ────────────────────────────────────────────

  it('returns a small list (≤10) for every known provider', () => {
    const urls = [
      'https://api.openai.com/v1',
      'https://api.deepseek.com/v1',
      'https://api.anthropic.com/v1',
      'https://generativelanguage.googleapis.com/v1beta',
      'https://openrouter.ai/api/v1',
      'https://api.together.xyz/v1',
    ];
    urls.forEach((url) => {
      const result = getWhitelist(url);
      expect(result).not.toBeNull();
      expect(result!.length).toBeLessThanOrEqual(10);
    });
  });

  // ── unknown providers ────────────────────────────────────────────────────

  it('returns null for an unknown provider URL', () => {
    expect(getWhitelist('https://my-custom-llm.example.com/v1')).toBeNull();
  });

  it('returns null for localhost', () => {
    expect(getWhitelist('http://localhost:11434/v1')).toBeNull();
  });

  it('returns null for a subdomain of a known host', () => {
    // "proxy.api.openai.com" is NOT the same as "api.openai.com"
    expect(getWhitelist('https://proxy.api.openai.com/v1')).toBeNull();
  });

  // ── invalid / edge-case inputs ───────────────────────────────────────────

  it('returns null for an empty string', () => {
    expect(getWhitelist('')).toBeNull();
  });

  it('returns null for a non-URL string', () => {
    expect(getWhitelist('not-a-url')).toBeNull();
  });

  it('returns null for undefined cast to string edge cases', () => {
    expect(getWhitelist('null')).toBeNull();
    expect(getWhitelist('undefined')).toBeNull();
  });

  // ── return value contract ────────────────────────────────────────────────

  it('always returns the same array reference for the same provider (no copy)', () => {
    // getWhitelist should return the whitelist array directly
    const a = getWhitelist('https://api.openai.com/v1');
    const b = getWhitelist('https://api.openai.com/v1');
    expect(a).toBe(b);
  });

  it('never returns an empty array — either whitelist or null', () => {
    const urls = [
      'https://api.openai.com/v1',
      'https://api.deepseek.com/v1',
      'https://unknown.example.com/v1',
      '',
    ];
    urls.forEach((url) => {
      const result = getWhitelist(url);
      if (result !== null) {
        expect(result.length).toBeGreaterThan(0);
      }
    });
  });
});

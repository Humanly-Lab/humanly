/**
 * Backend capability registry tests (issue #93). Locks the same matrix the
 * frontend ai-models.ts test suite locks, but on the server side, so a
 * drift between frontend and backend whitelist would surface in CI rather
 * than letting a model the UI thinks is vision-capable get rejected by
 * the backend (or vice versa).
 */

import {
  getModelWhitelist,
  getModelCapabilities,
  modelSupportsImage,
  resolveCapabilitiesOrSafeDefault,
} from '../../services/ai-model-capabilities';

describe('backend ai-model-capabilities', () => {
  const vision = (host: string, id: string) =>
    expect(modelSupportsImage(`https://${host}`, id)).toBe(true);
  const textOnly = (host: string, id: string) =>
    expect(modelSupportsImage(`https://${host}`, id)).toBe(false);

  it('mirrors the frontend OpenAI/Anthropic/Gemini vision flags', () => {
    vision('api.openai.com', 'gpt-5.5');
    vision('api.openai.com', 'gpt-5.4-nano');
    vision('api.anthropic.com', 'claude-opus-4-8');
    vision('api.anthropic.com', 'claude-haiku-4-5-20251001');
    vision('generativelanguage.googleapis.com', 'gemini-2.5-flash');
  });

  it('mirrors the frontend Together stable tool-call model set', () => {
    vision('api.together.xyz', 'moonshotai/Kimi-K2.6');
    textOnly('api.together.xyz', 'deepseek-ai/DeepSeek-V4-Pro');
    textOnly('api.together.xyz', 'zai-org/GLM-5.1');
    expect(getModelCapabilities('https://api.together.xyz/v1', 'Qwen/Qwen3.5-397B-A17B')).toBeNull();
    expect(getModelCapabilities('https://api.together.xyz/v1', 'Qwen/Qwen3.5-9B')).toBeNull();
    expect(getModelCapabilities('https://api.together.xyz/v1', 'zai-org/GLM-5')).toBeNull();
  });

  it('mirrors the frontend OpenRouter stable model set', () => {
    vision('openrouter.ai', 'qwen/qwen3.5-397b-a17b');
    vision('openrouter.ai', 'qwen/qwen3.5-9b');
    vision('openrouter.ai', 'moonshotai/kimi-k2.6');
    textOnly('openrouter.ai', 'deepseek/deepseek-v4-pro');
    textOnly('openrouter.ai', 'z-ai/glm-5.1');
    vision('openrouter.ai', 'anthropic/claude-sonnet-4.6');
    vision('openrouter.ai', 'openai/gpt-5.4-mini');
    vision('openrouter.ai', 'google/gemini-3.1-flash-lite');
  });

  it('exposes curated ids for known providers and null for unknown providers', () => {
    expect(getModelWhitelist('https://api.openai.com/v1')).toEqual([
      'gpt-5.4-mini',
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-nano',
    ]);
    expect(getModelWhitelist('https://api.anthropic.com/v1')).toEqual([
      'claude-sonnet-4-6',
      'claude-opus-4-8',
      'claude-haiku-4-5-20251001',
    ]);
    expect(getModelWhitelist('https://openrouter.ai/api/v1')).toEqual([
      'qwen/qwen3.5-397b-a17b',
      'qwen/qwen3.5-9b',
      'moonshotai/kimi-k2.6',
      'deepseek/deepseek-v4-pro',
      'z-ai/glm-5.1',
      'anthropic/claude-sonnet-4.6',
      'openai/gpt-5.4-mini',
      'google/gemini-3.1-flash-lite',
    ]);
    expect(getModelWhitelist('https://example.com/v1')).toBeNull();
  });

  it('flags DeepSeek direct as text-only', () => {
    textOnly('api.deepseek.com', 'deepseek-reasoner');
    textOnly('api.deepseek.com', 'deepseek-chat');
  });

  it('returns null for unknown provider / model and falls back safely', () => {
    expect(getModelCapabilities('https://example.com', 'x')).toBeNull();
    expect(getModelCapabilities('https://api.openai.com', 'unknown')).toBeNull();
    // Safe default = text-only so unknown models never receive image input.
    expect(resolveCapabilitiesOrSafeDefault('https://example.com', 'x').inputs).toEqual(['text']);
    expect(modelSupportsImage('https://example.com', 'x')).toBe(false);
  });

  it('tolerates malformed base URLs', () => {
    expect(getModelCapabilities('not a url', 'x')).toBeNull();
    expect(modelSupportsImage('not a url', 'x')).toBe(false);
  });
});

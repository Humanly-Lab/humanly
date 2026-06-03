/**
 * Capability-registry tests for the chat model whitelist (issue #93).
 * Locks the vision-capable model matrix so an accidental flag flip
 * (e.g. marking a text-only model as vision) shows up in CI before it
 * reaches the chat UI.
 */

import {
  AI_PROVIDER_OPTIONS,
  CLAUDE_BASE_URL,
  CUSTOM_AI_PROVIDER_VALUE,
  MODEL_WHITELIST,
  OPENAI_BASE_URL,
  OPENROUTER_BASE_URL,
  TOGETHER_AI_BASE_URL,
  getProviderValueForBaseUrl,
  getWhitelist,
  getModelDescriptors,
  getModelCapabilities,
  modelSupportsImage,
} from '../../lib/ai-models';

describe('MODEL_WHITELIST shape', () => {
  it('every entry has an id and capabilities.inputs including text', () => {
    for (const [host, descriptors] of Object.entries(MODEL_WHITELIST)) {
      expect(Array.isArray(descriptors)).toBe(true);
      for (const d of descriptors) {
        expect(typeof d.id).toBe('string');
        expect(d.id.length).toBeGreaterThan(0);
        expect(Array.isArray(d.capabilities.inputs)).toBe(true);
        // Chat models must accept text; image is the optional extra.
        expect(d.capabilities.inputs).toContain('text');
        expect(host.length).toBeGreaterThan(0);
      }
    }
  });
});

describe('vision capability matrix (locked per provider docs)', () => {
  const vision = (host: string, id: string) =>
    expect(modelSupportsImage(`https://${host}`, id)).toBe(true);
  const textOnly = (host: string, id: string) =>
    expect(modelSupportsImage(`https://${host}`, id)).toBe(false);

  it('OpenAI: all whitelisted chat models accept image', () => {
    vision('api.openai.com', 'gpt-5.5');
    vision('api.openai.com', 'gpt-5.4');
    vision('api.openai.com', 'gpt-5.4-mini');
    vision('api.openai.com', 'gpt-5.4-nano');
  });

  it('Anthropic: all whitelisted chat models accept image', () => {
    vision('api.anthropic.com', 'claude-opus-4-8');
    vision('api.anthropic.com', 'claude-sonnet-4-6');
    vision('api.anthropic.com', 'claude-haiku-4-5-20251001');
  });

  it('Gemini: all whitelisted chat models accept image', () => {
    vision('generativelanguage.googleapis.com', 'gemini-2.5-pro');
    vision('generativelanguage.googleapis.com', 'gemini-1.5-flash');
  });

  it('DeepSeek: every model is text-only', () => {
    textOnly('api.deepseek.com', 'deepseek-reasoner');
    textOnly('api.deepseek.com', 'deepseek-chat');
    textOnly('api.deepseek.com', 'deepseek-coder');
  });

  it('OpenRouter: uses the deployed stable model set', () => {
    vision('openrouter.ai', 'qwen/qwen3.5-397b-a17b');
    vision('openrouter.ai', 'qwen/qwen3.5-9b');
    vision('openrouter.ai', 'moonshotai/kimi-k2.6');
    textOnly('openrouter.ai', 'deepseek/deepseek-v4-pro');
    textOnly('openrouter.ai', 'z-ai/glm-5.1');
    vision('openrouter.ai', 'anthropic/claude-sonnet-4.6');
    vision('openrouter.ai', 'openai/gpt-5.4-mini');
    vision('openrouter.ai', 'google/gemini-3.1-flash-lite');
  });

  it('Together: uses the deployed stable tool-call model set', () => {
    vision('api.together.xyz', 'moonshotai/Kimi-K2.6');
    textOnly('api.together.xyz', 'deepseek-ai/DeepSeek-V4-Pro');
    textOnly('api.together.xyz', 'zai-org/GLM-5.1');
    expect(getWhitelist('https://api.together.xyz/v1')).not.toContain('Qwen/Qwen3.5-397B-A17B');
    expect(getWhitelist('https://api.together.xyz/v1')).not.toContain('Qwen/Qwen3.5-9B');
    expect(getWhitelist('https://api.together.xyz/v1')).not.toContain('zai-org/GLM-5');
  });
});

describe('whitelist accessors', () => {
  it('getWhitelist returns plain id strings (backwards compatible)', () => {
    const ids = getWhitelist('https://api.openai.com/v1');
    expect(ids?.[0]).toBe('gpt-5.4-mini');
    expect(ids).toContain('gpt-5.5');
    expect(ids).toContain('gpt-5.4-nano');
    expect(ids).not.toContain('gpt-4o');
    expect(ids?.every(id => typeof id === 'string')).toBe(true);
  });

  it('getModelDescriptors returns full descriptors', () => {
    const list = getModelDescriptors('https://api.together.xyz/v1');
    const kimi = list?.find(d => d.id === 'moonshotai/Kimi-K2.6');
    expect(kimi?.capabilities.inputs).toEqual(['text', 'image']);
  });

  it('returns null for unknown providers', () => {
    expect(getWhitelist('https://example.com')).toBeNull();
    expect(getModelDescriptors('https://example.com')).toBeNull();
    expect(getModelCapabilities('https://example.com', 'foo')).toBeNull();
  });

  it('returns null for unknown models on known providers', () => {
    expect(getModelCapabilities('https://api.openai.com', 'mystery-9000')).toBeNull();
    expect(modelSupportsImage('https://api.openai.com', 'mystery-9000')).toBe(false);
  });

  it('tolerates malformed base URLs', () => {
    expect(getWhitelist('not a url')).toBeNull();
    expect(getModelDescriptors('')).toBeNull();
  });
});

describe('provider options', () => {
  it('offers only the four curated provider choices', () => {
    expect(AI_PROVIDER_OPTIONS.map(option => option.label)).toEqual([
      'Together AI',
      'OpenRouter',
      'OpenAI',
      'Anthropic',
    ]);
    expect(AI_PROVIDER_OPTIONS.map(option => option.baseUrl)).toEqual([
      TOGETHER_AI_BASE_URL,
      OPENROUTER_BASE_URL,
      OPENAI_BASE_URL,
      CLAUDE_BASE_URL,
    ]);
  });

  it('maps canonical provider URLs back to provider values', () => {
    expect(getProviderValueForBaseUrl(`${TOGETHER_AI_BASE_URL}/`)).toBe('together');
    expect(getProviderValueForBaseUrl(OPENROUTER_BASE_URL)).toBe('openrouter');
    expect(getProviderValueForBaseUrl(OPENAI_BASE_URL)).toBe('openai');
    expect(getProviderValueForBaseUrl(CLAUDE_BASE_URL)).toBe('claude');
    expect(getProviderValueForBaseUrl('https://example.com/v1')).toBe(CUSTOM_AI_PROVIDER_VALUE);
  });
});

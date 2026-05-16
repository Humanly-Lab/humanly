/**
 * Capability-registry tests for the chat model whitelist (issue #93).
 * Locks the vision-capable model matrix so an accidental flag flip
 * (e.g. marking a text-only model as vision) shows up in CI before it
 * reaches the chat UI.
 */

import {
  MODEL_WHITELIST,
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
    vision('api.openai.com', 'gpt-4o');
    vision('api.openai.com', 'gpt-4o-mini');
    vision('api.openai.com', 'gpt-4.1');
    vision('api.openai.com', 'o3');
  });

  it('Anthropic: all whitelisted chat models accept image', () => {
    vision('api.anthropic.com', 'claude-opus-4-5');
    vision('api.anthropic.com', 'claude-sonnet-4-5');
    vision('api.anthropic.com', 'claude-3-haiku-20240307');
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

  it('OpenRouter: uses the deployed stable text-only model set', () => {
    textOnly('openrouter.ai', 'qwen/qwen3.5-397b-a17b');
    textOnly('openrouter.ai', 'moonshotai/kimi-k2.6');
    textOnly('openrouter.ai', 'deepseek/deepseek-v4-pro');
    textOnly('openrouter.ai', 'z-ai/glm-5');
  });

  it('Together: flags vision per each endpoint\'s "Input modalities" line', () => {
    vision('api.together.xyz', 'Qwen/Qwen3.5-397B-A17B');
    vision('api.together.xyz', 'moonshotai/Kimi-K2.6');
    textOnly('api.together.xyz', 'deepseek-ai/DeepSeek-V4-Pro');
    textOnly('api.together.xyz', 'zai-org/GLM-5');
  });
});

describe('whitelist accessors', () => {
  it('getWhitelist returns plain id strings (backwards compatible)', () => {
    const ids = getWhitelist('https://api.openai.com/v1');
    expect(ids).toContain('gpt-4o');
    expect(ids).toContain('o3');
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

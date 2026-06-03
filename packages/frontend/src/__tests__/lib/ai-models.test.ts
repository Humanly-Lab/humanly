import {
  getWhitelist,
  modelSupportsImage,
} from '../../lib/ai-models';

describe('admin AI model whitelist', () => {
  it('uses the current OpenAI GPT model set', () => {
    expect(getWhitelist('https://api.openai.com/v1')).toEqual([
      'gpt-5.5',
      'gpt-5.4',
      'gpt-5.4-mini',
      'gpt-5.4-nano',
    ]);
    expect(modelSupportsImage('https://api.openai.com/v1', 'gpt-5.5')).toBe(true);
    expect(modelSupportsImage('https://api.openai.com/v1', 'gpt-4o')).toBe(false);
  });

  it('uses the current Claude model set', () => {
    expect(getWhitelist('https://api.anthropic.com/v1')).toEqual([
      'claude-opus-4-8',
      'claude-sonnet-4-6',
      'claude-haiku-4-5-20251001',
    ]);
    expect(modelSupportsImage('https://api.anthropic.com/v1', 'claude-sonnet-4-6')).toBe(true);
    expect(modelSupportsImage('https://api.anthropic.com/v1', 'claude-sonnet-4-5')).toBe(false);
  });

  it('uses the deployed Together stable model set', () => {
    expect(getWhitelist('https://api.together.xyz/v1')).toEqual([
      'moonshotai/Kimi-K2.6',
      'deepseek-ai/DeepSeek-V4-Pro',
      'zai-org/GLM-5.1',
    ]);
  });

  it('uses the deployed OpenRouter stable model set', () => {
    expect(getWhitelist('https://openrouter.ai/api/v1')).toEqual([
      'qwen/qwen3.5-397b-a17b',
      'qwen/qwen3.5-9b',
      'moonshotai/kimi-k2.6',
      'deepseek/deepseek-v4-pro',
      'z-ai/glm-5.1',
      'anthropic/claude-sonnet-4.6',
      'openai/gpt-5.4-mini',
      'google/gemini-3.1-flash-lite',
    ]);
  });

  it('uses provider-verified image capability flags for OpenRouter models', () => {
    expect(modelSupportsImage('https://openrouter.ai/api/v1', 'qwen/qwen3.5-397b-a17b')).toBe(true);
    expect(modelSupportsImage('https://openrouter.ai/api/v1', 'qwen/qwen3.5-9b')).toBe(true);
    expect(modelSupportsImage('https://openrouter.ai/api/v1', 'moonshotai/kimi-k2.6')).toBe(true);
    expect(modelSupportsImage('https://openrouter.ai/api/v1', 'deepseek/deepseek-v4-pro')).toBe(false);
    expect(modelSupportsImage('https://openrouter.ai/api/v1', 'z-ai/glm-5.1')).toBe(false);
    expect(modelSupportsImage('https://openrouter.ai/api/v1', 'anthropic/claude-sonnet-4.6')).toBe(true);
    expect(modelSupportsImage('https://openrouter.ai/api/v1', 'openai/gpt-5.4-mini')).toBe(true);
    expect(modelSupportsImage('https://openrouter.ai/api/v1', 'google/gemini-3.1-flash-lite')).toBe(true);
  });

  it('uses provider-verified image capability flags for Together models', () => {
    expect(modelSupportsImage('https://api.together.xyz/v1', 'moonshotai/Kimi-K2.6')).toBe(true);
    expect(modelSupportsImage('https://api.together.xyz/v1', 'Qwen/Qwen3.5-9B')).toBe(false);
    expect(modelSupportsImage('https://api.together.xyz/v1', 'deepseek-ai/DeepSeek-V4-Pro')).toBe(false);
    expect(modelSupportsImage('https://api.together.xyz/v1', 'zai-org/GLM-5.1')).toBe(false);
  });
});

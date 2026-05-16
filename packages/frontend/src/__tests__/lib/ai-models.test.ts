import {
  getWhitelist,
  modelSupportsImage,
} from '../../lib/ai-models';

describe('admin AI model whitelist', () => {
  it('uses the deployed Together stable model set', () => {
    expect(getWhitelist('https://api.together.xyz/v1')).toEqual([
      'Qwen/Qwen3.5-397B-A17B',
      'moonshotai/Kimi-K2.6',
      'deepseek-ai/DeepSeek-V4-Pro',
      'zai-org/GLM-5',
    ]);
  });

  it('uses the deployed OpenRouter stable model set', () => {
    expect(getWhitelist('https://openrouter.ai/api/v1')).toEqual([
      'qwen/qwen3.5-397b-a17b',
      'moonshotai/kimi-k2.6',
      'deepseek/deepseek-v4-pro',
      'z-ai/glm-5',
    ]);
  });

  it('keeps image gating conservative for OpenRouter models', () => {
    expect(modelSupportsImage('https://openrouter.ai/api/v1', 'qwen/qwen3.5-397b-a17b')).toBe(false);
    expect(modelSupportsImage('https://openrouter.ai/api/v1', 'deepseek/deepseek-v4-pro')).toBe(false);
  });
});

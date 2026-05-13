export const MODEL_WHITELIST: Record<string, string[]> = {
  'api.openai.com': [
    'gpt-4.1',
    'gpt-4o',
    'gpt-4o-mini',
    'gpt-4.1-nano',
    'o3',
  ],
  'api.deepseek.com': [
    'deepseek-reasoner',
    'deepseek-chat',
    'deepseek-coder',
  ],
  'api.anthropic.com': [
    'claude-opus-4-5',
    'claude-sonnet-4-5',
    'claude-3-7-sonnet-20250219',
    'claude-3-haiku-20240307',
  ],
  'generativelanguage.googleapis.com': [
    'gemini-2.5-pro',
    'gemini-2.5-flash',
    'gemini-2.0-flash',
    'gemini-1.5-flash',
  ],
  'openrouter.ai': [
    'openai/gpt-4o',
    'anthropic/claude-3.7-sonnet',
    'google/gemini-2.5-pro',
    'meta-llama/llama-3.3-70b-instruct',
    'deepseek/deepseek-chat',
    'mistralai/mistral-large',
  ],
  'api.together.xyz': [
    'Qwen/Qwen3.5-9B',
    'moonshotai/Kimi-K2.5',
    'deepseek-ai/DeepSeek-V4-Pro',
    'deepseek-ai/DeepSeek-V3',
    'meta-llama/Llama-3.3-70B-Instruct-Turbo',
    'Qwen/Qwen2.5-7B-Instruct-Turbo',
  ],
};

export function getWhitelist(baseUrl: string): string[] | null {
  try {
    const host = new URL(baseUrl).hostname;
    return MODEL_WHITELIST[host] ?? null;
  } catch {
    return null;
  }
}

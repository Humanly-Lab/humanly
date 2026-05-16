import type { AIModelDescriptor, ModelCapabilities } from '@humanly/shared';

const TEXT_ONLY: ModelCapabilities = { inputs: ['text'] };
const TEXT_AND_IMAGE: ModelCapabilities = { inputs: ['text', 'image'] };

/**
 * Admin-side curated whitelist. Keep this in lockstep with
 * `frontend-user/lib/ai-models.ts` and the backend capability matrix so
 * task owners see the same stable model set that writers can actually use.
 */
export const MODEL_WHITELIST: Record<string, AIModelDescriptor[]> = {
  'api.openai.com': [
    { id: 'gpt-4.1', capabilities: TEXT_AND_IMAGE },
    { id: 'gpt-4o', capabilities: TEXT_AND_IMAGE },
    { id: 'gpt-4o-mini', capabilities: TEXT_AND_IMAGE },
    { id: 'gpt-4.1-nano', capabilities: TEXT_AND_IMAGE },
    { id: 'o3', capabilities: TEXT_AND_IMAGE },
  ],
  'api.deepseek.com': [
    { id: 'deepseek-reasoner', capabilities: TEXT_ONLY },
    { id: 'deepseek-chat', capabilities: TEXT_ONLY },
    { id: 'deepseek-coder', capabilities: TEXT_ONLY },
  ],
  'api.anthropic.com': [
    { id: 'claude-opus-4-5', capabilities: TEXT_AND_IMAGE },
    { id: 'claude-sonnet-4-5', capabilities: TEXT_AND_IMAGE },
    { id: 'claude-3-7-sonnet-20250219', capabilities: TEXT_AND_IMAGE },
    { id: 'claude-3-haiku-20240307', capabilities: TEXT_AND_IMAGE },
  ],
  'generativelanguage.googleapis.com': [
    { id: 'gemini-2.5-pro', capabilities: TEXT_AND_IMAGE },
    { id: 'gemini-2.5-flash', capabilities: TEXT_AND_IMAGE },
    { id: 'gemini-2.0-flash', capabilities: TEXT_AND_IMAGE },
    { id: 'gemini-1.5-flash', capabilities: TEXT_AND_IMAGE },
  ],
  'openrouter.ai': [
    { id: 'qwen/qwen3.5-397b-a17b', capabilities: TEXT_ONLY },
    { id: 'moonshotai/kimi-k2.6', capabilities: TEXT_ONLY },
    { id: 'deepseek/deepseek-v4-pro', capabilities: TEXT_ONLY },
    { id: 'z-ai/glm-5', capabilities: TEXT_ONLY },
  ],
  'api.together.xyz': [
    { id: 'Qwen/Qwen3.5-397B-A17B', capabilities: TEXT_AND_IMAGE },
    { id: 'moonshotai/Kimi-K2.6', capabilities: TEXT_AND_IMAGE },
    { id: 'deepseek-ai/DeepSeek-V4-Pro', capabilities: TEXT_ONLY },
    { id: 'zai-org/GLM-5', capabilities: TEXT_ONLY },
  ],
};

export function getModelDescriptors(baseUrl: string): AIModelDescriptor[] | null {
  try {
    const host = new URL(baseUrl).hostname;
    return MODEL_WHITELIST[host] ?? null;
  } catch {
    return null;
  }
}

export function getWhitelist(baseUrl: string): string[] | null {
  const descriptors = getModelDescriptors(baseUrl);
  if (!descriptors) return null;
  return descriptors.map(d => d.id);
}

export function getModelCapabilities(
  baseUrl: string,
  modelId: string,
): ModelCapabilities | null {
  const descriptors = getModelDescriptors(baseUrl);
  if (!descriptors) return null;
  const match = descriptors.find(d => d.id === modelId);
  return match ? match.capabilities : null;
}

export function modelSupportsImage(baseUrl: string, modelId: string): boolean {
  const caps = getModelCapabilities(baseUrl, modelId);
  return caps !== null && caps.inputs.includes('image');
}

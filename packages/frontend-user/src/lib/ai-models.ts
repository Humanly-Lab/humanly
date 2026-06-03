import type { AIModelDescriptor, ModelCapabilities } from '@humanly/shared';

const TEXT_ONLY: ModelCapabilities = { inputs: ['text'] };
const TEXT_AND_IMAGE: ModelCapabilities = { inputs: ['text', 'image'] };

export const TOGETHER_AI_BASE_URL = 'https://api.together.xyz/v1';
export const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
export const OPENAI_BASE_URL = 'https://api.openai.com/v1';
export const CLAUDE_BASE_URL = 'https://api.anthropic.com/v1';

export const CUSTOM_AI_PROVIDER_VALUE = 'custom';

export const AI_PROVIDER_OPTIONS = [
  {
    value: 'together',
    label: 'Together AI',
    baseUrl: TOGETHER_AI_BASE_URL,
  },
  {
    value: 'openrouter',
    label: 'OpenRouter',
    baseUrl: OPENROUTER_BASE_URL,
  },
  {
    value: 'openai',
    label: 'OpenAI',
    baseUrl: OPENAI_BASE_URL,
  },
  {
    value: 'claude',
    label: 'Claude',
    baseUrl: CLAUDE_BASE_URL,
  },
] as const;

export type AIProviderOptionValue =
  | typeof AI_PROVIDER_OPTIONS[number]['value']
  | typeof CUSTOM_AI_PROVIDER_VALUE;

export function getProviderValueForBaseUrl(baseUrl: string): AIProviderOptionValue {
  const normalized = baseUrl.trim().replace(/\/+$/, '');
  const knownProvider = AI_PROVIDER_OPTIONS.find(
    provider => provider.baseUrl && provider.baseUrl.replace(/\/+$/, '') === normalized
  );
  return knownProvider?.value ?? CUSTOM_AI_PROVIDER_VALUE;
}

/**
 * Curated chat-model whitelist per provider host. Each entry carries a
 * static capability descriptor so the model picker can render a "Vision"
 * badge and gate the image input affordance, and so the backend can lock
 * a capability snapshot on a chat session.
 *
 * Capability classification is sourced from each provider's own model
 * page, then narrowed to provider/model pairs that passed Humanly's
 * agentic-tool QA. A model can stay available on one provider while being
 * omitted from another when its structured tool-call endpoint is unstable.
 */
export const MODEL_WHITELIST: Record<string, AIModelDescriptor[]> = {
  'api.openai.com': [
    { id: 'gpt-5.4-mini', capabilities: TEXT_AND_IMAGE },
    { id: 'gpt-5.5', capabilities: TEXT_AND_IMAGE },
    { id: 'gpt-5.4', capabilities: TEXT_AND_IMAGE },
    { id: 'gpt-5.4-nano', capabilities: TEXT_AND_IMAGE },
  ],
  'api.deepseek.com': [
    { id: 'deepseek-reasoner', capabilities: TEXT_ONLY },
    { id: 'deepseek-chat', capabilities: TEXT_ONLY },
    { id: 'deepseek-coder', capabilities: TEXT_ONLY },
  ],
  'api.anthropic.com': [
    { id: 'claude-sonnet-4-6', capabilities: TEXT_AND_IMAGE },
    { id: 'claude-opus-4-8', capabilities: TEXT_AND_IMAGE },
    { id: 'claude-haiku-4-5-20251001', capabilities: TEXT_AND_IMAGE },
  ],
  'generativelanguage.googleapis.com': [
    { id: 'gemini-2.5-pro', capabilities: TEXT_AND_IMAGE },
    { id: 'gemini-2.5-flash', capabilities: TEXT_AND_IMAGE },
    { id: 'gemini-2.0-flash', capabilities: TEXT_AND_IMAGE },
    { id: 'gemini-1.5-flash', capabilities: TEXT_AND_IMAGE },
  ],
  'openrouter.ai': [
    // OpenRouter exposes provider-native ids. Keep this list small and
    // aligned with the deployed QA matrix instead of surfacing a generic
    // model catalog.
    { id: 'qwen/qwen3.5-397b-a17b', capabilities: TEXT_AND_IMAGE },
    { id: 'qwen/qwen3.5-9b', capabilities: TEXT_AND_IMAGE },
    { id: 'moonshotai/kimi-k2.6', capabilities: TEXT_AND_IMAGE },
    { id: 'deepseek/deepseek-v4-pro', capabilities: TEXT_ONLY },
    { id: 'z-ai/glm-5.1', capabilities: TEXT_ONLY },
    { id: 'anthropic/claude-sonnet-4.6', capabilities: TEXT_AND_IMAGE },
    { id: 'openai/gpt-5.4-mini', capabilities: TEXT_AND_IMAGE },
    { id: 'google/gemini-3.1-flash-lite', capabilities: TEXT_AND_IMAGE },
  ],
  'api.together.xyz': [
    // Capability flags follow each endpoint's "Input modalities" line on
    // its Together model card, not the family-level Together listing page
    // (which can omit Vision even when the endpoint accepts image input).
    { id: 'moonshotai/Kimi-K2.6', capabilities: TEXT_AND_IMAGE },
    { id: 'deepseek-ai/DeepSeek-V4-Pro', capabilities: TEXT_ONLY },
    { id: 'zai-org/GLM-5.1', capabilities: TEXT_ONLY },
  ],
};

/**
 * Returns the descriptor list (id + capabilities) for a known provider host,
 * or null for unknown ones. Prefer this over `getWhitelist` when the caller
 * needs capability flags (model picker UI, capability gating).
 */
export function getModelDescriptors(baseUrl: string): AIModelDescriptor[] | null {
  try {
    const host = new URL(baseUrl).hostname;
    return MODEL_WHITELIST[host] ?? null;
  } catch {
    return null;
  }
}

/**
 * Backwards-compatible accessor returning just the model id strings. Existing
 * call sites that only need to validate a model id against the curated list
 * keep working without touching every consumer in one PR.
 *
 * Returns null for unknown providers; the caller should fall back to whatever
 * the API returned.
 */
export function getWhitelist(baseUrl: string): string[] | null {
  const descriptors = getModelDescriptors(baseUrl);
  if (!descriptors) return null;
  return descriptors.map(d => d.id);
}

/**
 * Look up the capability descriptor for a (provider, model) pair. Returns
 * null when either is unknown — callers must decide whether to treat that
 * as text-only (safe default) or as a hard rejection.
 */
export function getModelCapabilities(
  baseUrl: string,
  modelId: string,
): ModelCapabilities | null {
  const descriptors = getModelDescriptors(baseUrl);
  if (!descriptors) return null;
  const match = descriptors.find(d => d.id === modelId);
  return match ? match.capabilities : null;
}

/**
 * Convenience predicate the chat input uses to enable/disable the image
 * picker. Unknown models are treated as text-only so we never silently
 * surface an image picker that the provider would reject.
 */
export function modelSupportsImage(baseUrl: string, modelId: string): boolean {
  const caps = getModelCapabilities(baseUrl, modelId);
  return caps !== null && caps.inputs.includes('image');
}

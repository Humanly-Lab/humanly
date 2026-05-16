import type { AIModelDescriptor, ModelCapabilities } from '@humanly/shared';

const TEXT_ONLY: ModelCapabilities = { inputs: ['text'] };
const TEXT_AND_IMAGE: ModelCapabilities = { inputs: ['text', 'image'] };

/**
 * Curated chat-model whitelist per provider host. Each entry carries a
 * static capability descriptor so the model picker can render a "Vision"
 * badge and gate the image input affordance, and so the backend can lock
 * a capability snapshot on a chat session.
 *
 * Capability classification is sourced from each provider's own model
 * page. Together is the most heterogeneous: Qwen3.5-397B-A17B is text-only
 * on Together's serverless endpoint today even though the upstream Qwen
 * model is natively multimodal — we mark it text-only until Together
 * exposes vision for that variant.
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
    // OpenRouter exposes provider-native ids. Keep this list small and
    // aligned with the deployed QA matrix instead of surfacing a generic
    // model catalog.
    { id: 'qwen/qwen3.5-397b-a17b', capabilities: TEXT_ONLY },
    { id: 'moonshotai/kimi-k2.6', capabilities: TEXT_ONLY },
    { id: 'deepseek/deepseek-v4-pro', capabilities: TEXT_ONLY },
    { id: 'z-ai/glm-5', capabilities: TEXT_ONLY },
  ],
  'api.together.xyz': [
    // Capability flags follow each endpoint's "Input modalities" line on
    // its Together model card, not the family-level Together listing page
    // (which can omit Vision even when the endpoint accepts image input).
    // Qwen3.5-397B-A17B's endpoint advertises Text + Image.
    { id: 'Qwen/Qwen3.5-397B-A17B', capabilities: TEXT_AND_IMAGE },
    // Qwen3.6-Plus was considered but dropped from the whitelist: its
    // structured tool-call payload is unreliable on Together (see #47
    // hardening notes), and the agent's ls/grep/read loop is brittle on
    // this model even though it advertises vision input.
    { id: 'moonshotai/Kimi-K2.6', capabilities: TEXT_AND_IMAGE },
    { id: 'deepseek-ai/DeepSeek-V4-Pro', capabilities: TEXT_ONLY },
    { id: 'zai-org/GLM-5', capabilities: TEXT_ONLY },
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

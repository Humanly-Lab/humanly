import type { ModelCapabilities } from '@humanly/shared';

/**
 * Backend-side mirror of the frontend MODEL_WHITELIST capability flags
 * (issue #93). Replicating the matrix here keeps the websocket validation
 * layer independent of the frontend bundle — the same model on the same
 * provider host always has the same input modalities, regardless of which
 * surface (chat panel, settings dialog, agent smoke harness) is sending
 * the request.
 *
 * Keep this in lockstep with `packages/frontend-user/src/lib/ai-models.ts`.
 * A drift between the two would let the UI surface an image picker that
 * the backend refuses, or vice versa.
 */

const TEXT_ONLY: ModelCapabilities = { inputs: ['text'] };
const TEXT_AND_IMAGE: ModelCapabilities = { inputs: ['text', 'image'] };

const MATRIX: Record<string, Record<string, ModelCapabilities>> = {
  'api.openai.com': {
    'gpt-5.5': TEXT_AND_IMAGE,
    'gpt-5.4': TEXT_AND_IMAGE,
    'gpt-5.4-mini': TEXT_AND_IMAGE,
    'gpt-5.4-nano': TEXT_AND_IMAGE,
  },
  'api.deepseek.com': {
    'deepseek-reasoner': TEXT_ONLY,
    'deepseek-chat': TEXT_ONLY,
    'deepseek-coder': TEXT_ONLY,
  },
  'api.anthropic.com': {
    'claude-opus-4-8': TEXT_AND_IMAGE,
    'claude-sonnet-4-6': TEXT_AND_IMAGE,
    'claude-haiku-4-5-20251001': TEXT_AND_IMAGE,
  },
  'generativelanguage.googleapis.com': {
    'gemini-2.5-pro': TEXT_AND_IMAGE,
    'gemini-2.5-flash': TEXT_AND_IMAGE,
    'gemini-2.0-flash': TEXT_AND_IMAGE,
    'gemini-1.5-flash': TEXT_AND_IMAGE,
  },
  'openrouter.ai': {
    'qwen/qwen3.5-397b-a17b': TEXT_AND_IMAGE,
    'qwen/qwen3.5-9b': TEXT_AND_IMAGE,
    'moonshotai/kimi-k2.6': TEXT_AND_IMAGE,
    'deepseek/deepseek-v4-pro': TEXT_ONLY,
    'z-ai/glm-5.1': TEXT_ONLY,
    'anthropic/claude-sonnet-4.6': TEXT_AND_IMAGE,
    'openai/gpt-5.4-mini': TEXT_AND_IMAGE,
    'google/gemini-3.1-flash-lite': TEXT_AND_IMAGE,
  },
  'api.together.xyz': {
    'moonshotai/Kimi-K2.6': TEXT_AND_IMAGE,
    'deepseek-ai/DeepSeek-V4-Pro': TEXT_ONLY,
    'zai-org/GLM-5.1': TEXT_ONLY,
  },
};

/**
 * Resolve the static capability descriptor for a (baseUrl, modelId) pair.
 * Returns null when either is unknown — callers should treat unknown as
 * text-only (the safe default) and let the provider surface its own error
 * if the user picked an exotic model that does happen to accept images.
 */
export function getModelCapabilities(
  baseUrl: string,
  modelId: string,
): ModelCapabilities | null {
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return null;
  }
  const perProvider = MATRIX[host];
  if (!perProvider) return null;
  return perProvider[modelId] ?? null;
}

/**
 * Return the curated model ids for a known provider, or null for unknown
 * OpenAI-compatible hosts where we intentionally allow the provider catalog.
 */
export function getModelWhitelist(baseUrl: string): string[] | null {
  let host: string;
  try {
    host = new URL(baseUrl).hostname;
  } catch {
    return null;
  }
  const perProvider = MATRIX[host];
  return perProvider ? Object.keys(perProvider) : null;
}

/**
 * Best-effort capability lookup with the safe default applied: anything
 * unknown is treated as text-only so the gating logic never accidentally
 * lets an image attachment through to a model whose modality we cannot
 * confirm.
 */
export function resolveCapabilitiesOrSafeDefault(
  baseUrl: string,
  modelId: string,
): ModelCapabilities {
  return getModelCapabilities(baseUrl, modelId) ?? TEXT_ONLY;
}

export function modelSupportsImage(baseUrl: string, modelId: string): boolean {
  return resolveCapabilitiesOrSafeDefault(baseUrl, modelId).inputs.includes('image');
}

import { Request, Response } from 'express';
import { UserAISettingsModel } from '../models/user-ai-settings.model';
import { logger } from '../utils/logger';
import {
  AI_CHAT_MAX_TOKENS_DEFAULT,
  AI_MAX_TOKENS_MAX,
  AI_MAX_TOKENS_MIN,
  AI_SHORTCUT_MAX_TOKENS_DEFAULT,
  WRITING_AI_EXISTING_KEY_SENTINEL,
} from '@humanly/shared';
import { getModelWhitelist } from '../services/ai-model-capabilities';

type ProviderModelsResponse =
  | Array<{ id?: unknown }>
  | {
      data?: Array<{ id?: unknown }>;
      error?: { message?: string };
      message?: string;
    };

type ProviderAuthResponse = {
  data?: unknown;
  error?: { message?: string };
  message?: string;
};

type ProviderCredentialSuccess = {
  ok: true;
  modelsResponse?: ProviderModelsResponse;
  skipCatalogProbe?: boolean;
};

type ProviderCredentialValidation =
  | ProviderCredentialSuccess
  | { ok: false; message: string };

type ProviderCredentialRule = {
  label: string;
  validate?: (
    provider: TrustedProviderConfig,
    apiKey: string,
  ) => Promise<ProviderCredentialValidation>;
};

type ProviderBaseUrlGuard = {
  matches: (url: URL) => boolean;
  message: string;
};

const TOGETHER_AI_BASE_URL = 'https://api.together.xyz/v1';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const CLAUDE_BASE_URL = 'https://api.anthropic.com/v1';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';

const TRUSTED_PROVIDER_CONFIGS = {
  'api.openai.com': {
    label: 'OpenAI',
    baseUrl: OPENAI_BASE_URL,
    modelsUrl: `${OPENAI_BASE_URL}/models`,
  },
  'api.anthropic.com': {
    label: 'Anthropic',
    baseUrl: CLAUDE_BASE_URL,
    modelsUrl: `${CLAUDE_BASE_URL}/models`,
  },
  'openrouter.ai': {
    label: 'OpenRouter',
    baseUrl: OPENROUTER_BASE_URL,
    modelsUrl: `${OPENROUTER_BASE_URL}/models`,
    keyUrl: `${OPENROUTER_BASE_URL}/key`,
  },
  'api.together.xyz': {
    label: 'Together AI',
    baseUrl: TOGETHER_AI_BASE_URL,
    modelsUrl: `${TOGETHER_AI_BASE_URL}/models`,
  },
} as const;

type TrustedProviderHost = keyof typeof TRUSTED_PROVIDER_CONFIGS;
type TrustedProviderConfig = typeof TRUSTED_PROVIDER_CONFIGS[TrustedProviderHost] & {
  host: TrustedProviderHost;
};
type TrustedProviderEndpoint = 'models' | 'key';

const TRUSTED_PROVIDER_HOSTS = new Set<string>(Object.keys(TRUSTED_PROVIDER_CONFIGS));

const PROVIDER_CREDENTIAL_RULES: Record<TrustedProviderHost, ProviderCredentialRule> = {
  'api.openai.com': {
    label: 'OpenAI',
    validate: async (provider, apiKey) => {
      const modelsResult = await fetchProviderModelsCatalog(provider, apiKey);
      if (!modelsResult.ok) {
        return {
          ok: false,
          message: modelsResult.message,
        };
      }
      return { ok: true, modelsResponse: modelsResult.data };
    },
  },
  'api.anthropic.com': {
    label: 'Anthropic',
    validate: async (provider, apiKey) => {
      const modelsResult = await fetchProviderModelsCatalog(provider, apiKey);
      if (!modelsResult.ok) {
        return {
          ok: false,
          message: modelsResult.message,
        };
      }
      return { ok: true, modelsResponse: modelsResult.data };
    },
  },
  'openrouter.ai': {
    label: 'OpenRouter',
    validate: async (provider, apiKey) => {
      // OpenRouter's model catalog can be reachable even when the key does not
      // belong to OpenRouter. The /key endpoint validates the bearer credential
      // itself, so use it before returning the curated OpenRouter model list.
      const response = await fetchTrustedProviderUrl(provider, 'key', apiKey);

      if (response.ok) {
        return { ok: true, skipCatalogProbe: true };
      }

      const detail = await readProviderErrorMessage(response);
      return {
        ok: false,
        message: detail,
      };
    },
  },
  'api.together.xyz': {
    label: 'Together AI',
    validate: async (provider, apiKey) => {
      const modelsResult = await fetchProviderModelsCatalog(provider, apiKey);
      if (!modelsResult.ok) {
        return {
          ok: false,
          message: modelsResult.message,
        };
      }
      return { ok: true, modelsResponse: modelsResult.data };
    },
  },
};

const PROVIDER_BASE_URL_GUARDS: ProviderBaseUrlGuard[] = [
  {
    matches: (url) => url.hostname === 'api.openai.com' && !url.pathname.includes('/v1'),
    message: `OpenAI base URL should include /v1: ${OPENAI_BASE_URL}`,
  },
  {
    matches: (url) => url.hostname.endsWith('openai.com') && url.hostname !== 'api.openai.com',
    message: `OpenAI uses the OpenAI-compatible API base URL ${OPENAI_BASE_URL}. The openai.com website URL returns HTML, not model JSON.`,
  },
  {
    matches: (url) => url.hostname === 'api.anthropic.com' && !url.pathname.includes('/v1'),
    message: `Claude base URL should include /v1: ${CLAUDE_BASE_URL}`,
  },
  {
    matches: (url) => url.hostname.endsWith('anthropic.com') && url.hostname !== 'api.anthropic.com',
    message: `Claude uses the OpenAI-compatible API base URL ${CLAUDE_BASE_URL}. The anthropic.com website URL returns HTML, not model JSON.`,
  },
  {
    matches: (url) => url.hostname.endsWith('claude.ai'),
    message: `Claude uses the OpenAI-compatible API base URL ${CLAUDE_BASE_URL}. The claude.ai website URL returns HTML, not model JSON.`,
  },
  {
    matches: (url) => url.hostname.endsWith('together.ai'),
    message: `Together AI uses the OpenAI-compatible API base URL ${TOGETHER_AI_BASE_URL}. The together.ai website URL returns HTML, not model JSON.`,
  },
  {
    matches: (url) => url.hostname === 'api.together.xyz' && !url.pathname.includes('/v1'),
    message: `Together AI base URL should include /v1: ${TOGETHER_AI_BASE_URL}`,
  },
];

function normalizeProviderBaseUrlString(value: string): string {
  const url = new URL(value);
  url.username = '';
  url.password = '';
  url.search = '';
  url.hash = '';
  url.pathname = url.pathname.replace(/\/+$/, '');
  return url.toString().replace(/\/+$/, '');
}

function isTrustedProviderHost(hostname: string): hostname is TrustedProviderHost {
  return TRUSTED_PROVIDER_HOSTS.has(hostname);
}

function extractProviderModels(data: ProviderModelsResponse): string[] {
  const modelList = Array.isArray(data) ? data : data.data;
  if (!Array.isArray(modelList)) return [];

  return modelList
    .map((model) => model.id)
    .filter((id): id is string => typeof id === 'string' && id.length > 0)
    .sort();
}

function providerStatusHint(status: number): string {
  if (status === 401) return 'The API key was rejected. Check that the key belongs to the selected provider.';
  if (status === 403) return 'The API key does not have permission for this provider or model.';
  if (status === 404) return 'The provider endpoint was not found. Check that the Base URL is an OpenAI-compatible API URL and includes /v1 when required.';
  if (status === 429) return 'The provider rate limit was reached. Try again later or use a different key.';
  if (status >= 500) return 'The provider is temporarily unavailable. Try again later.';
  return 'Check the API key, Base URL, provider, and selected model.';
}

function providerStatusLabel(status: number): string {
  if (status === 401) return '401 Unauthorized';
  if (status === 403) return '403 Forbidden';
  if (status === 404) return '404 Not Found';
  if (status === 429) return '429 Rate Limited';
  return `${status}`;
}

function formatProviderHttpError(status: number, detail?: string): string {
  const trimmedDetail = detail?.trim();
  const statusText = providerStatusLabel(status);
  const hint = providerStatusHint(status);
  if (trimmedDetail && trimmedDetail !== statusText && !/^API returned \d+$/i.test(trimmedDetail)) {
    return `Provider returned ${statusText}: ${trimmedDetail}. ${hint}`;
  }
  return `Provider returned ${statusText}. ${hint}`;
}

function formatAiConfigurationFailure(reason: string): string {
  return `AI API configuration failed. ${reason}`;
}

function validateSelectedModel(
  model: unknown,
  models: string[],
  modelSource: 'supported' | 'available'
): { ok: true } | { ok: false; message: string } {
  if (typeof model !== 'string' || !model.trim()) return { ok: true };
  const selectedModel = model.trim();
  if (models.includes(selectedModel)) return { ok: true };

  const suggestions = models.slice(0, 6).join(', ');
  return {
    ok: false,
    message: formatAiConfigurationFailure(
      `Model "${selectedModel}" was not found in this provider's ${modelSource} model list.${suggestions ? ` Choose one of: ${suggestions}.` : ''}`
    ),
  };
}

async function readProviderErrorMessage(response: globalThis.Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await response.json().catch(() => null) as ProviderAuthResponse | null;
    return formatProviderHttpError(response.status, body?.error?.message || body?.message);
  }

  const text = await response.text().catch(() => '');
  return formatProviderHttpError(response.status, text);
}

export function validateProviderBaseUrl(url: URL): { ok: true; provider: TrustedProviderConfig } | { ok: false; message: string } {
  if (url.protocol !== 'https:') {
    return { ok: false, message: 'AI provider Base URL must use HTTPS.' };
  }
  if (url.username || url.password) {
    return { ok: false, message: 'AI provider Base URL must not include credentials.' };
  }
  if (url.port) {
    return { ok: false, message: 'AI provider Base URL must not include a custom port.' };
  }
  if (url.search || url.hash) {
    return { ok: false, message: 'AI provider Base URL must not include query parameters or fragments.' };
  }
  const failedGuard = PROVIDER_BASE_URL_GUARDS.find((guard) => guard.matches(url));
  if (failedGuard) {
    return { ok: false, message: failedGuard.message };
  }
  if (!isTrustedProviderHost(url.hostname)) {
    return {
      ok: false,
      message: `Unsupported AI provider Base URL. Choose one of: ${Object.values(TRUSTED_PROVIDER_CONFIGS).map((provider) => provider.baseUrl).join(', ')}.`,
    };
  }

  const provider = TRUSTED_PROVIDER_CONFIGS[url.hostname];
  const normalizedUrl = normalizeProviderBaseUrlString(url.toString());
  if (normalizedUrl !== provider.baseUrl) {
    return {
      ok: false,
      message: `${provider.label} base URL should be ${provider.baseUrl}.`,
    };
  }

  return { ok: true, provider: { ...provider, host: url.hostname } };
}

export function parseTrustedProviderBaseUrl(baseUrl: unknown): { ok: true; provider: TrustedProviderConfig } | { ok: false; message: string } {
  if (typeof baseUrl !== 'string' || !baseUrl.trim()) {
    return { ok: false, message: 'Base URL is required' };
  }

  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    return { ok: false, message: 'Invalid base URL format' };
  }

  return validateProviderBaseUrl(parsedBaseUrl);
}

function trustedProviderEndpointUrl(
  provider: TrustedProviderConfig,
  endpoint: TrustedProviderEndpoint,
): string {
  const config = TRUSTED_PROVIDER_CONFIGS[provider.host];
  if (endpoint === 'key') {
    if (!('keyUrl' in config)) {
      throw new Error(`${config.label} does not expose a key validation endpoint`);
    }
    return config.keyUrl;
  }
  return config.modelsUrl;
}

async function fetchTrustedProviderUrl(
  provider: TrustedProviderConfig,
  endpoint: TrustedProviderEndpoint,
  apiKey: string,
): Promise<globalThis.Response> {
  const trustedUrl = trustedProviderEndpointUrl(provider, endpoint);
  const url = new URL(trustedUrl);
  if (url.protocol !== 'https:' || !isTrustedProviderHost(url.hostname)) {
    throw new Error('Refusing to fetch untrusted AI provider URL');
  }
  return fetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });
}

async function fetchProviderModelsCatalog(
  provider: TrustedProviderConfig,
  apiKey: string,
): Promise<{ ok: true; data: ProviderModelsResponse } | { ok: false; message: string }> {
  const modelsUrl = trustedProviderEndpointUrl(provider, 'models');
  const response = await fetchTrustedProviderUrl(provider, 'models', apiKey);

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const bodyPreview = await response.text().catch(() => '');
    const htmlHint = bodyPreview.trim().startsWith('<!DOCTYPE') || bodyPreview.trim().startsWith('<html')
      ? ' The endpoint returned an HTML page.'
      : '';
    const statusHint = response.ok
      ? ''
      : `${formatProviderHttpError(response.status)} `;
    return {
      ok: false,
      message: [
        statusHint,
        `Expected JSON from ${modelsUrl}, but received ${contentType || 'unknown content type'}.`,
        `Check that the Base URL is an OpenAI-compatible API endpoint.${htmlHint}`,
      ].filter(Boolean).join(' '),
    };
  }

  const data = await response.json() as ProviderModelsResponse;

  if (!response.ok) {
    let errorMessage = formatProviderHttpError(response.status);
    if (!Array.isArray(data)) {
      errorMessage = formatProviderHttpError(response.status, data.error?.message || data.message);
    }
    return {
      ok: false,
      message: errorMessage,
    };
  }

  return { ok: true, data };
}

async function validateProviderCredentials(
  provider: TrustedProviderConfig,
  apiKey: string,
): Promise<ProviderCredentialValidation> {
  const rule = PROVIDER_CREDENTIAL_RULES[provider.host];
  if (!rule?.validate) {
    return { ok: true };
  }

  const providerValidation = await rule.validate(provider, apiKey);
  if (providerValidation.ok) {
    return providerValidation;
  }
  return {
    ok: false,
    message: formatAiConfigurationFailure(
      `${rule.label} validation failed. Use a valid ${rule.label} API key and Base URL for this provider. ${providerValidation.message}`
    ),
  };
}

function parseTokenBudget(
  value: unknown,
  fallback: number
): { ok: true; value: number } | { ok: false; error: string } {
  if (value === undefined || value === null || value === '') {
    return { ok: true, value: fallback };
  }
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || !Number.isInteger(parsed)) {
    return { ok: false, error: 'Token budget must be an integer' };
  }
  if (parsed < AI_MAX_TOKENS_MIN || parsed > AI_MAX_TOKENS_MAX) {
    return {
      ok: false,
      error: `Token budget must be between ${AI_MAX_TOKENS_MIN} and ${AI_MAX_TOKENS_MAX}`,
    };
  }
  return { ok: true, value: parsed };
}

export async function getSettings(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user.userId;
  const settings = await UserAISettingsModel.getPublicByUserId(userId);
  if (!settings) {
    res.json({ success: true, data: null });
    return;
  }
  res.json({ success: true, data: settings });
}

export async function saveSettings(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user.userId;
  const { apiKey, baseUrl, model } = req.body;
  const shortcutMaxTokens = req.body.shortcutMaxTokens ?? req.body.responseMaxTokens;
  const chatMaxTokens = req.body.chatMaxTokens ?? req.body.agentMaxTokens;

  if (!baseUrl || !model) {
    res.status(400).json({
      success: false,
      error: 'Base URL and model are required',
    });
    return;
  }

  const providerBaseUrl = parseTrustedProviderBaseUrl(baseUrl);
  if (!providerBaseUrl.ok) {
    res.status(400).json({
      success: false,
      error: providerBaseUrl.message,
    });
    return;
  }

  const provider = providerBaseUrl.provider;
  const whitelistedModels = getModelWhitelist(provider.baseUrl);
  if (whitelistedModels && !whitelistedModels.includes(model)) {
    res.status(400).json({
      success: false,
      error: `Model is not available for this provider. Choose one of: ${whitelistedModels.join(', ')}`,
    });
    return;
  }

  // If requested, keep the current key but update other fields.
  let keyToSave = apiKey;
  const existing = await UserAISettingsModel.getByUserId(userId);
  if (!apiKey || apiKey === WRITING_AI_EXISTING_KEY_SENTINEL) {
    if (!existing) {
      res.status(400).json({
        success: false,
        error: 'API key is required',
      });
      return;
    }
    keyToSave = existing.apiKey;
  }

  const parsedShortcutMaxTokens = parseTokenBudget(
    shortcutMaxTokens,
    existing?.shortcutMaxTokens ?? AI_SHORTCUT_MAX_TOKENS_DEFAULT
  );
  if (!parsedShortcutMaxTokens.ok) {
    res.status(400).json({ success: false, error: parsedShortcutMaxTokens.error });
    return;
  }

  const parsedChatMaxTokens = parseTokenBudget(
    chatMaxTokens,
    existing?.chatMaxTokens ?? AI_CHAT_MAX_TOKENS_DEFAULT
  );
  if (!parsedChatMaxTokens.ok) {
    res.status(400).json({ success: false, error: parsedChatMaxTokens.error });
    return;
  }

  try {
    const providerAuth = await validateProviderCredentials(
      provider,
      keyToSave,
    );
    if (!providerAuth.ok) {
      res.status(400).json({
        success: false,
        error: providerAuth.message,
      });
      return;
    }

    const canUseCuratedProviderModels = providerAuth.skipCatalogProbe && whitelistedModels;
    if (!providerAuth.modelsResponse && !canUseCuratedProviderModels) {
      const modelsResult = await fetchProviderModelsCatalog(provider, keyToSave);
      if (!modelsResult.ok) {
        res.status(400).json({
          success: false,
          error: formatAiConfigurationFailure(modelsResult.message),
        });
        return;
      }
      const modelValidation = validateSelectedModel(model, extractProviderModels(modelsResult.data), 'available');
      if (!modelValidation.ok) {
        res.status(400).json({
          success: false,
          error: modelValidation.message,
        });
        return;
      }
    }
  } catch (error: any) {
    const message = error.name === 'TimeoutError'
      ? 'Connection timed out after 15s. Check that the Base URL is reachable.'
      : error.message || 'Connection failed. Check that the Base URL is reachable.';
    res.status(400).json({
      success: false,
      error: formatAiConfigurationFailure(message),
    });
    return;
  }

  await UserAISettingsModel.upsert(userId, keyToSave, provider.baseUrl, model, {
    shortcutMaxTokens: parsedShortcutMaxTokens.value,
    chatMaxTokens: parsedChatMaxTokens.value,
  });
  logger.info('AI settings saved', {
    userId,
    shortcutMaxTokens: parsedShortcutMaxTokens.value,
    chatMaxTokens: parsedChatMaxTokens.value,
  });

  res.json({ success: true, message: 'AI settings saved successfully' });
}

export async function deleteSettings(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user.userId;
  const deleted = await UserAISettingsModel.delete(userId);
  if (!deleted) {
    res.status(404).json({
      success: false,
      error: 'No AI settings found',
    });
    return;
  }
  logger.info('AI settings deleted', { userId });
  res.json({ success: true, message: 'AI settings deleted' });
}

export async function testConnection(req: Request, res: Response): Promise<void> {
  const userId = (req as any).user.userId;
  let { apiKey, baseUrl, model } = req.body;

  if (!baseUrl) {
    res.status(400).json({
      success: false,
      error: 'Base URL is required',
    });
    return;
  }

  // If using existing key, load from DB
  if (!apiKey || apiKey === WRITING_AI_EXISTING_KEY_SENTINEL) {
    const existing = await UserAISettingsModel.getByUserId(userId);
    if (!existing) {
      res.status(400).json({
        success: false,
        error: 'API key is required',
      });
      return;
    }
    apiKey = existing.apiKey;
  }

  const providerBaseUrl = parseTrustedProviderBaseUrl(baseUrl);
  if (!providerBaseUrl.ok) {
    res.status(400).json({
      success: false,
      error: providerBaseUrl.message,
    });
    return;
  }

  const provider = providerBaseUrl.provider;

  try {
    const whitelistedModels = getModelWhitelist(provider.baseUrl);

    const providerAuth = await validateProviderCredentials(
      provider,
      apiKey,
    );
    if (!providerAuth.ok) {
      res.json({
        success: false,
        message: providerAuth.message,
      });
      return;
    }

    if (providerAuth.skipCatalogProbe && whitelistedModels) {
      const modelValidation = validateSelectedModel(model, whitelistedModels, 'supported');
      if (!modelValidation.ok) {
        res.json({
          success: false,
          message: modelValidation.message,
        });
        return;
      }

      res.json({
        success: true,
        message: `Connection successful. Found ${whitelistedModels.length} supported models.`,
        models: whitelistedModels,
      });
      return;
    }

    const modelsResult = providerAuth.modelsResponse
      ? { ok: true as const, data: providerAuth.modelsResponse }
      : await fetchProviderModelsCatalog(provider, apiKey);
    if (!modelsResult.ok) {
      res.json({
        success: false,
        message: formatAiConfigurationFailure(modelsResult.message),
      });
      return;
    }

    const models = extractProviderModels(modelsResult.data);
    const returnedModels = whitelistedModels || models;
    const modelSource = whitelistedModels ? 'supported' : 'available';
    const modelValidation = validateSelectedModel(model, returnedModels, modelSource);
    if (!modelValidation.ok) {
      res.json({
        success: false,
        message: modelValidation.message,
      });
      return;
    }

    res.json({
      success: true,
      message: `Connection successful. Found ${returnedModels.length} ${modelSource} models.`,
      models: returnedModels,
    });
  } catch (error: any) {
    const message = error.name === 'TimeoutError'
      ? 'Connection timed out after 15s. Check that the Base URL is reachable.'
      : error.message || 'Connection failed. Check that the Base URL is reachable.';
    res.json({
      success: false,
      message: formatAiConfigurationFailure(message),
    });
  }
}

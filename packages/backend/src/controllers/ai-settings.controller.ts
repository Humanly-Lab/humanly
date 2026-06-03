import { Request, Response } from 'express';
import { UserAISettingsModel } from '../models/user-ai-settings.model';
import { logger } from '../utils/logger';
import {
  AI_CHAT_MAX_TOKENS_DEFAULT,
  AI_MAX_TOKENS_MAX,
  AI_MAX_TOKENS_MIN,
  AI_SHORTCUT_MAX_TOKENS_DEFAULT,
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
    normalizedUrl: string,
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

const PROVIDER_CREDENTIAL_RULES: Record<string, ProviderCredentialRule> = {
  'api.openai.com': {
    label: 'OpenAI',
    validate: async (normalizedUrl, apiKey) => {
      const modelsResult = await fetchProviderModelsCatalog(`${normalizedUrl}/models`, apiKey);
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
    validate: async (normalizedUrl, apiKey) => {
      const modelsResult = await fetchProviderModelsCatalog(`${normalizedUrl}/models`, apiKey);
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
    validate: async (normalizedUrl, apiKey) => {
      // OpenRouter's model catalog can be reachable even when the key does not
      // belong to OpenRouter. The /key endpoint validates the bearer credential
      // itself, so use it before returning the curated OpenRouter model list.
      const response = await fetch(`${normalizedUrl}/key`, {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        signal: AbortSignal.timeout(15000),
      });

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
    validate: async (normalizedUrl, apiKey) => {
      const modelsResult = await fetchProviderModelsCatalog(`${normalizedUrl}/models`, apiKey);
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

async function readProviderErrorMessage(response: globalThis.Response): Promise<string> {
  const contentType = response.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    const body = await response.json().catch(() => null) as ProviderAuthResponse | null;
    return body?.error?.message || body?.message || `API returned ${response.status}`;
  }

  const text = await response.text().catch(() => '');
  return text.trim() || `API returned ${response.status}`;
}

function validateProviderBaseUrl(url: URL): { ok: true } | { ok: false; message: string } {
  const failedGuard = PROVIDER_BASE_URL_GUARDS.find((guard) => guard.matches(url));
  return failedGuard
    ? { ok: false, message: failedGuard.message }
    : { ok: true };
}

async function fetchProviderModelsCatalog(
  modelsUrl: string,
  apiKey: string,
): Promise<{ ok: true; data: ProviderModelsResponse } | { ok: false; message: string }> {
  const response = await fetch(modelsUrl, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    signal: AbortSignal.timeout(15000),
  });

  const contentType = response.headers.get('content-type') || '';
  if (!contentType.includes('application/json')) {
    const bodyPreview = await response.text().catch(() => '');
    const htmlHint = bodyPreview.trim().startsWith('<!DOCTYPE') || bodyPreview.trim().startsWith('<html')
      ? ' The endpoint returned an HTML page.'
      : '';
    return {
      ok: false,
      message: [
        `Expected JSON from ${modelsUrl}, but received ${contentType || 'unknown content type'}.`,
        `Check that the Base URL is an OpenAI-compatible API endpoint.${htmlHint}`,
      ].join(' '),
    };
  }

  const data = await response.json() as ProviderModelsResponse;

  if (!response.ok) {
    let errorMessage = `API returned ${response.status}`;
    if (!Array.isArray(data)) {
      errorMessage = data.error?.message || data.message || errorMessage;
    }
    return {
      ok: false,
      message: errorMessage,
    };
  }

  return { ok: true, data };
}

async function validateProviderCredentials(
  normalizedUrl: string,
  hostname: string,
  apiKey: string,
): Promise<ProviderCredentialValidation> {
  const rule = PROVIDER_CREDENTIAL_RULES[hostname];
  if (!rule?.validate) {
    return { ok: true };
  }

  const providerValidation = await rule.validate(normalizedUrl, apiKey);
  if (providerValidation.ok) {
    return providerValidation;
  }
  return {
    ok: false,
    message: `${rule.label} authentication failed. Use a valid ${rule.label} API key for this provider. ${providerValidation.message}`,
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

  // Validate URL format
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    res.status(400).json({
      success: false,
      error: 'Invalid base URL format',
    });
    return;
  }

  const baseUrlGuard = validateProviderBaseUrl(parsedBaseUrl);
  if (!baseUrlGuard.ok) {
    res.status(400).json({
      success: false,
      error: baseUrlGuard.message,
    });
    return;
  }

  const whitelistedModels = getModelWhitelist(baseUrl);
  if (whitelistedModels && !whitelistedModels.includes(model)) {
    res.status(400).json({
      success: false,
      error: `Model is not available for this provider. Choose one of: ${whitelistedModels.join(', ')}`,
    });
    return;
  }

  // If apiKey is '__use_existing__', keep the current key but update other fields
  let keyToSave = apiKey;
  const existing = await UserAISettingsModel.getByUserId(userId);
  if (!apiKey || apiKey === '__use_existing__') {
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
    const normalizedUrl = baseUrl.replace(/\/+$/, '');
    const providerAuth = await validateProviderCredentials(
      normalizedUrl,
      parsedBaseUrl.hostname,
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
      const modelsResult = await fetchProviderModelsCatalog(`${normalizedUrl}/models`, keyToSave);
      if (!modelsResult.ok) {
        res.status(400).json({
          success: false,
          error: modelsResult.message,
        });
        return;
      }
    }
  } catch (error: any) {
    const message = error.name === 'TimeoutError'
      ? 'Connection timed out (15s)'
      : error.message || 'Connection failed';
    res.status(400).json({
      success: false,
      error: message,
    });
    return;
  }

  await UserAISettingsModel.upsert(userId, keyToSave, baseUrl, model, {
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
  let { apiKey, baseUrl } = req.body;

  if (!baseUrl) {
    res.status(400).json({
      success: false,
      error: 'Base URL is required',
    });
    return;
  }

  // If using existing key, load from DB
  if (!apiKey || apiKey === '__use_existing__') {
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

  // Validate URL format
  let parsedBaseUrl: URL;
  try {
    parsedBaseUrl = new URL(baseUrl);
  } catch {
    res.status(400).json({
      success: false,
      error: 'Invalid base URL format',
    });
    return;
  }

  const baseUrlGuard = validateProviderBaseUrl(parsedBaseUrl);
  if (!baseUrlGuard.ok) {
    res.json({
      success: false,
      message: baseUrlGuard.message,
    });
    return;
  }

  try {
    // Normalize base URL: remove trailing slash
    const normalizedUrl = baseUrl.replace(/\/+$/, '');
    const whitelistedModels = getModelWhitelist(baseUrl);

    const providerAuth = await validateProviderCredentials(
      normalizedUrl,
      parsedBaseUrl.hostname,
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
      res.json({
        success: true,
        message: `Connection successful. Found ${whitelistedModels.length} supported models.`,
        models: whitelistedModels,
      });
      return;
    }

    const modelsUrl = `${normalizedUrl}/models`;
    const modelsResult = providerAuth.modelsResponse
      ? { ok: true as const, data: providerAuth.modelsResponse }
      : await fetchProviderModelsCatalog(modelsUrl, apiKey);
    if (!modelsResult.ok) {
      res.json({
        success: false,
        message: modelsResult.message,
      });
      return;
    }

    // Extract model IDs from response. OpenAI-compatible providers usually
    // return { data: [{ id: "gpt-5.4-mini", ... }] }, while Together currently
    // returns a top-level array from /v1/models.
    let models: string[] = [];
    const modelList = Array.isArray(modelsResult.data)
      ? modelsResult.data
      : modelsResult.data.data;
    if (Array.isArray(modelList)) {
      models = modelList
        .map((m) => m.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .sort();
    }

    const returnedModels = whitelistedModels || models;
    const modelSource = whitelistedModels ? 'supported' : 'available';

    res.json({
      success: true,
      message: `Connection successful. Found ${returnedModels.length} ${modelSource} models.`,
      models: returnedModels,
    });
  } catch (error: any) {
    const message = error.name === 'TimeoutError'
      ? 'Connection timed out (15s)'
      : error.message || 'Connection failed';
    res.json({
      success: false,
      message,
    });
  }
}

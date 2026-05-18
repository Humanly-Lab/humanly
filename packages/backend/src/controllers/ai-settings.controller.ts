import { Request, Response } from 'express';
import { UserAISettingsModel } from '../models/user-ai-settings.model';
import { logger } from '../utils/logger';
import {
  AI_AGENT_MAX_TOKENS_DEFAULT,
  AI_MAX_TOKENS_MAX,
  AI_MAX_TOKENS_MIN,
  AI_RESPONSE_MAX_TOKENS_DEFAULT,
} from '@humanly/shared';

type ProviderModelsResponse =
  | Array<{ id?: unknown }>
  | {
      data?: Array<{ id?: unknown }>;
      error?: { message?: string };
      message?: string;
    };

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
  const { apiKey, baseUrl, model, responseMaxTokens, agentMaxTokens } = req.body;

  if (!baseUrl || !model) {
    res.status(400).json({
      success: false,
      error: 'Base URL and model are required',
    });
    return;
  }

  // Validate URL format
  try {
    new URL(baseUrl);
  } catch {
    res.status(400).json({
      success: false,
      error: 'Invalid base URL format',
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

  const parsedResponseMaxTokens = parseTokenBudget(
    responseMaxTokens,
    existing?.responseMaxTokens ?? AI_RESPONSE_MAX_TOKENS_DEFAULT
  );
  if (!parsedResponseMaxTokens.ok) {
    res.status(400).json({ success: false, error: parsedResponseMaxTokens.error });
    return;
  }

  const parsedAgentMaxTokens = parseTokenBudget(
    agentMaxTokens,
    existing?.agentMaxTokens ?? AI_AGENT_MAX_TOKENS_DEFAULT
  );
  if (!parsedAgentMaxTokens.ok) {
    res.status(400).json({ success: false, error: parsedAgentMaxTokens.error });
    return;
  }

  await UserAISettingsModel.upsert(userId, keyToSave, baseUrl, model, {
    responseMaxTokens: parsedResponseMaxTokens.value,
    agentMaxTokens: parsedAgentMaxTokens.value,
  });
  logger.info('AI settings saved', {
    userId,
    responseMaxTokens: parsedResponseMaxTokens.value,
    agentMaxTokens: parsedAgentMaxTokens.value,
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

  if (parsedBaseUrl.hostname.endsWith('together.ai')) {
    res.json({
      success: false,
      message: 'Together AI uses the OpenAI-compatible API base URL https://api.together.xyz/v1. The together.ai website URL returns HTML, not model JSON.',
    });
    return;
  }

  if (parsedBaseUrl.hostname === 'api.together.xyz' && !parsedBaseUrl.pathname.includes('/v1')) {
    res.json({
      success: false,
      message: 'Together AI base URL should include /v1: https://api.together.xyz/v1',
    });
    return;
  }

  try {
    // Normalize base URL: remove trailing slash
    const normalizedUrl = baseUrl.replace(/\/+$/, '');
    const modelsUrl = `${normalizedUrl}/models`;

    const response = await fetch(modelsUrl, {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      signal: AbortSignal.timeout(15000),
    });

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('application/json')) {
      const bodyPreview = await response.text().catch(() => '');
      res.json({
        success: false,
        message: `Expected JSON from ${modelsUrl}, but received ${contentType || 'unknown content type'}. Check that the Base URL is an OpenAI-compatible API endpoint, for Together AI use https://api.together.xyz/v1.${bodyPreview.trim().startsWith('<!DOCTYPE') || bodyPreview.trim().startsWith('<html') ? ' The endpoint returned an HTML page.' : ''}`,
      });
      return;
    }

    const data = await response.json() as ProviderModelsResponse;

    if (!response.ok) {
      let errorMessage = `API returned ${response.status}`;
      if (!Array.isArray(data)) {
        errorMessage = data.error?.message || data.message || errorMessage;
      }
      res.json({
        success: false,
        message: errorMessage,
      });
      return;
    }

    // Extract model IDs from response. OpenAI-compatible providers usually
    // return { data: [{ id: "gpt-4o", ... }] }, while Together currently
    // returns a top-level array from /v1/models.
    let models: string[] = [];
    const modelList = Array.isArray(data) ? data : data.data;
    if (Array.isArray(modelList)) {
      models = modelList
        .map((m) => m.id)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
        .sort();
    }

    res.json({
      success: true,
      message: `Connection successful. Found ${models.length} models.`,
      models,
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

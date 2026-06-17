import crypto from 'crypto';
import { pool } from '../config/database';
import { env } from '../config/env';
import {
  AI_CHAT_MAX_TOKENS_DEFAULT,
  AI_MAX_TOKENS_MAX,
  AI_MAX_TOKENS_MIN,
  AI_SHORTCUT_MAX_TOKENS_DEFAULT,
} from '@humanly/shared';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer {
  return Buffer.from(env.aiEncryptionKey, 'hex');
}

function encrypt(text: string): string {
  const iv = crypto.randomBytes(IV_LENGTH);
  const cipher = crypto.createCipheriv(ALGORITHM, getEncryptionKey(), iv);
  let encrypted = cipher.update(text, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  // Format: iv:authTag:encrypted
  return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
}

function decrypt(data: string): string {
  const parts = data.split(':');
  if (parts.length !== 3) throw new Error('Invalid encrypted data format');
  const iv = Buffer.from(parts[0], 'hex');
  const authTag = Buffer.from(parts[1], 'hex');
  const encrypted = parts[2];
  const decipher = crypto.createDecipheriv(ALGORITHM, getEncryptionKey(), iv);
  decipher.setAuthTag(authTag);
  let decrypted = decipher.update(encrypted, 'hex', 'utf8');
  decrypted += decipher.final('utf8');
  return decrypted;
}

function maskApiKey(key: string): string {
  if (key.length <= 8) return '****';
  return key.substring(0, 5) + '...' + key.substring(key.length - 4);
}

export interface UserAISettingsRow {
  id: string;
  user_id: string;
  encrypted_api_key: string;
  base_url: string;
  model: string;
  shortcut_max_tokens: number | null;
  chat_max_tokens: number | null;
  created_at: string;
  updated_at: string;
}

export interface UserAISettingsTokenBudget {
  shortcutMaxTokens?: number;
  chatMaxTokens?: number;
}

function normalizeTokenBudgetValue(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(AI_MAX_TOKENS_MAX, Math.max(AI_MAX_TOKENS_MIN, Math.round(parsed)));
}

export class UserAISettingsModel {
  static async getByUserId(userId: string): Promise<{
    apiKey: string;
    baseUrl: string;
    model: string;
    shortcutMaxTokens: number;
    chatMaxTokens: number;
    maskedApiKey: string;
    updatedAt: string;
  } | null> {
    const result = await pool.query(
      'SELECT * FROM user_ai_settings WHERE user_id = $1',
      [userId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0] as UserAISettingsRow;
    const apiKey = decrypt(row.encrypted_api_key);
    return {
      apiKey,
      baseUrl: row.base_url,
      model: row.model,
      shortcutMaxTokens: normalizeTokenBudgetValue(row.shortcut_max_tokens, AI_SHORTCUT_MAX_TOKENS_DEFAULT),
      chatMaxTokens: normalizeTokenBudgetValue(row.chat_max_tokens, AI_CHAT_MAX_TOKENS_DEFAULT),
      maskedApiKey: maskApiKey(apiKey),
      updatedAt: row.updated_at,
    };
  }

  static async getPublicByUserId(userId: string): Promise<{
    baseUrl: string;
    model: string;
    shortcutMaxTokens: number;
    chatMaxTokens: number;
    hasApiKey: boolean;
    maskedApiKey: string;
    updatedAt: string;
  } | null> {
    const result = await pool.query(
      'SELECT base_url, model, encrypted_api_key, shortcut_max_tokens, chat_max_tokens, updated_at FROM user_ai_settings WHERE user_id = $1',
      [userId]
    );
    if (result.rows.length === 0) return null;
    const row = result.rows[0];
    const apiKey = decrypt(row.encrypted_api_key);
    return {
      baseUrl: row.base_url,
      model: row.model,
      shortcutMaxTokens: normalizeTokenBudgetValue(row.shortcut_max_tokens, AI_SHORTCUT_MAX_TOKENS_DEFAULT),
      chatMaxTokens: normalizeTokenBudgetValue(row.chat_max_tokens, AI_CHAT_MAX_TOKENS_DEFAULT),
      hasApiKey: true,
      maskedApiKey: maskApiKey(apiKey),
      updatedAt: row.updated_at,
    };
  }

  static async upsert(
    userId: string,
    apiKey: string,
    baseUrl: string,
    model: string,
    tokenBudget: UserAISettingsTokenBudget = {}
  ): Promise<void> {
    const encryptedKey = encrypt(apiKey);
    const shortcutMaxTokens = normalizeTokenBudgetValue(
      tokenBudget.shortcutMaxTokens,
      AI_SHORTCUT_MAX_TOKENS_DEFAULT
    );
    const chatMaxTokens = normalizeTokenBudgetValue(
      tokenBudget.chatMaxTokens,
      AI_CHAT_MAX_TOKENS_DEFAULT
    );
    await pool.query(
      `INSERT INTO user_ai_settings (
         user_id,
         encrypted_api_key,
         base_url,
         model,
         shortcut_max_tokens,
         chat_max_tokens
       )
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET
         encrypted_api_key = $2,
         base_url = $3,
         model = $4,
         shortcut_max_tokens = $5,
         chat_max_tokens = $6,
         updated_at = NOW()`,
      [userId, encryptedKey, baseUrl, model, shortcutMaxTokens, chatMaxTokens]
    );
  }

  static async delete(userId: string): Promise<boolean> {
    const result = await pool.query(
      'DELETE FROM user_ai_settings WHERE user_id = $1',
      [userId]
    );
    return (result.rowCount ?? 0) > 0;
  }
}

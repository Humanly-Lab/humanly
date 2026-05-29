import dotenv from 'dotenv';
import path from 'path';

// Load environment variables from .env file
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

interface EnvConfig {
  // Server
  nodeEnv: string;
  port: number;

  // Database
  databaseUrl: string;
  databasePoolMin: number;
  databasePoolMax: number;
  databaseSsl: boolean;

  // Redis
  redisUrl: string;

  // JWT
  jwtSecret: string;
  jwtAccessExpires: string;
  jwtRefreshExpires: string;
  authCookieDomain?: string;

  // CORS
  corsOrigin: string;

  // Frontend URLs
  frontendAdminUrl: string;
  frontendUserUrl: string;
  publicApiUrl: string;

  // Email
  emailService: 'console' | 'sendgrid' | 'ses' | 'smtp';
  emailApiKey?: string;
  emailFrom: string;
  emailHost?: string;
  emailPort?: number;
  emailUser?: string;
  emailPassword?: string;
  emailStrictDelivery: boolean;

  // OAuth
  googleOAuthClientId?: string;
  googleOAuthClientSecret?: string;
  githubOAuthClientId?: string;
  githubOAuthClientSecret?: string;

  // Rate Limiting
  rateLimitEnabled: boolean;

  // Background jobs
  taskAutoSubmitEnabled: boolean;
  taskAutoSubmitIntervalMs: number;
  taskAutoSubmitBatchSize: number;

  // AWS
  awsRegion?: string;
  awsAccessKeyId?: string;
  awsSecretAccessKey?: string;

  // AI Configuration
  aiProvider: 'openai' | 'anthropic' | 'mock';
  aiApiKey?: string;
  aiModel?: string;
  aiBaseUrl?: string;
  aiMaxTokens: number;
  aiTemperature: number;
  aiAgentMaxToolCalls: number;
  aiProviderTimeoutMs: number;
  aiRateLimitRequests: number;
  aiRateLimitWindowMs: number;

  // Encryption
  aiEncryptionKey: string;

  // Logging
  logLevel: string;
}

function getEnv(key: string, defaultValue?: string): string {
  const value = process.env[key] || defaultValue;
  if (value === undefined) {
    throw new Error(`Environment variable ${key} is required but not set`);
  }
  return value;
}

function getEnvNumber(key: string, defaultValue?: number): number {
  const value = process.env[key];
  if (value === undefined) {
    if (defaultValue === undefined) {
      throw new Error(`Environment variable ${key} is required but not set`);
    }
    return defaultValue;
  }
  const parsed = parseInt(value, 10);
  if (isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number`);
  }
  return parsed;
}

function getEnvBoolean(key: string, defaultValue: boolean): boolean {
  const value = process.env[key];
  if (value === undefined) {
    return defaultValue;
  }
  return value.toLowerCase() === 'true';
}

function deriveFrontendAdminUrl(): string {
  if (process.env.FRONTEND_ADMIN_URL) {
    return process.env.FRONTEND_ADMIN_URL;
  }

  const corsAdminOrigin = (process.env.CORS_ORIGIN || '')
    .split(',')
    .map((origin) => origin.trim())
    .find((origin) => origin.includes('admin.'));
  if (corsAdminOrigin) {
    return corsAdminOrigin;
  }

  const frontendUserUrl = process.env.FRONTEND_USER_URL;
  if (frontendUserUrl) {
    try {
      const url = new URL(frontendUserUrl);
      if (url.hostname.startsWith('app.')) {
        url.hostname = url.hostname.replace(/^app\./, 'admin.');
        return url.origin;
      }
    } catch {
      // Fall through to local default.
    }
  }

  return 'http://localhost:3000';
}

export const env: EnvConfig = {
  // Server
  nodeEnv: getEnv('NODE_ENV', 'development'),
  port: getEnvNumber('PORT', 3001),

  // Database
  databaseUrl: getEnv('DATABASE_URL'),
  databasePoolMin: getEnvNumber('DATABASE_POOL_MIN', 10),
  databasePoolMax: getEnvNumber('DATABASE_POOL_MAX', 50),
  databaseSsl: getEnvBoolean('DATABASE_SSL', false),

  // Redis
  redisUrl: getEnv('REDIS_URL'),

  // JWT
  jwtSecret: getEnv('JWT_SECRET'),
  jwtAccessExpires: getEnv('JWT_ACCESS_EXPIRES', '1d'),
  jwtRefreshExpires: getEnv('JWT_REFRESH_EXPIRES', '7d'),
  authCookieDomain: process.env.AUTH_COOKIE_DOMAIN || undefined,

  // CORS
  corsOrigin: getEnv('CORS_ORIGIN', 'http://localhost:3000'),

  // Frontend URLs
  frontendAdminUrl: deriveFrontendAdminUrl().replace(/\/$/, ''),
  frontendUserUrl: getEnv('FRONTEND_USER_URL', 'http://localhost:3002'),
  publicApiUrl: getEnv('PUBLIC_API_URL', 'http://localhost:3001/api/v1').replace(/\/$/, ''),

  // Email
  emailService: getEnv('EMAIL_SERVICE', 'console') as any,
  emailApiKey: process.env.EMAIL_API_KEY,
  emailFrom: getEnv('EMAIL_FROM'),
  emailHost: process.env.EMAIL_HOST,
  emailPort: process.env.EMAIL_PORT ? getEnvNumber('EMAIL_PORT') : undefined,
  emailUser: process.env.EMAIL_USER,
  emailPassword: process.env.EMAIL_PASSWORD,
  emailStrictDelivery: getEnvBoolean('EMAIL_STRICT_DELIVERY', false),

  // OAuth
  googleOAuthClientId: process.env.GOOGLE_OAUTH_CLIENT_ID,
  googleOAuthClientSecret: process.env.GOOGLE_OAUTH_CLIENT_SECRET,
  githubOAuthClientId: process.env.GITHUB_OAUTH_CLIENT_ID,
  githubOAuthClientSecret: process.env.GITHUB_OAUTH_CLIENT_SECRET,

  // Rate Limiting
  rateLimitEnabled: getEnvBoolean('RATE_LIMIT_ENABLED', true),

  // Background jobs
  taskAutoSubmitEnabled: getEnvBoolean('TASK_AUTO_SUBMIT_ENABLED', true),
  taskAutoSubmitIntervalMs: getEnvNumber('TASK_AUTO_SUBMIT_INTERVAL_MS', 30000),
  taskAutoSubmitBatchSize: getEnvNumber('TASK_AUTO_SUBMIT_BATCH_SIZE', 25),

  // AWS
  awsRegion: process.env.AWS_REGION,
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  awsSecretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,

  // AI Configuration
  aiProvider: (getEnv('AI_PROVIDER', 'mock') as 'openai' | 'anthropic' | 'mock'),
  aiApiKey: process.env.AI_API_KEY,
  aiModel: process.env.AI_MODEL,
  aiBaseUrl: process.env.AI_BASE_URL,
  aiMaxTokens: getEnvNumber('AI_MAX_TOKENS', 2048),
  aiTemperature: parseFloat(getEnv('AI_TEMPERATURE', '0.7')),
  aiAgentMaxToolCalls: getEnvNumber('AI_AGENT_MAX_TOOL_CALLS', 60),
  aiProviderTimeoutMs: getEnvNumber('AI_PROVIDER_TIMEOUT_MS', 180000),
  aiRateLimitRequests: getEnvNumber('AI_RATE_LIMIT_REQUESTS', 20),
  aiRateLimitWindowMs: getEnvNumber('AI_RATE_LIMIT_WINDOW_MS', 60000),

  // Encryption
  aiEncryptionKey: getEnv('AI_ENCRYPTION_KEY', '0000000000000000000000000000000000000000000000000000000000000000'),

  // Logging
  logLevel: getEnv('LOG_LEVEL', 'info'),
};

export default env;

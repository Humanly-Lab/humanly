import crypto from 'crypto';
import { UserRole } from '@humanly/shared';
import { env } from '../config/env';
import { AppError } from '../middleware/error-handler';

export type OAuthProvider = 'google' | 'github';

export interface OAuthProfile {
  provider: OAuthProvider;
  providerUserId: string;
  email: string;
}

interface OAuthStatePayload {
  provider: OAuthProvider;
  role: UserRole;
  next: string;
  expiresAt: number;
  nonce: string;
}

interface ProviderConfig {
  clientId?: string;
  clientSecret?: string;
  authUrl: string;
  tokenUrl: string;
  scope: string;
}

const PROVIDERS: Record<OAuthProvider, ProviderConfig> = {
  google: {
    clientId: env.googleOAuthClientId,
    clientSecret: env.googleOAuthClientSecret,
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    scope: 'openid email profile',
  },
  github: {
    clientId: env.githubOAuthClientId,
    clientSecret: env.githubOAuthClientSecret,
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    scope: 'read:user user:email',
  },
};

function assertProvider(provider: string): OAuthProvider {
  if (provider !== 'google' && provider !== 'github') {
    throw new AppError(400, 'Unsupported OAuth provider');
  }
  return provider;
}

function getProviderConfig(provider: OAuthProvider): ProviderConfig {
  const config = PROVIDERS[provider];
  if (!config.clientId || !config.clientSecret) {
    throw new AppError(400, `${provider} login is not configured`);
  }
  return config;
}

function base64UrlJson(payload: object): string {
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

function signState(encodedPayload: string): string {
  return crypto
    .createHmac('sha256', env.jwtSecret)
    .update(encodedPayload)
    .digest('base64url');
}

function safeNextPath(next: unknown, fallback: string = '/documents'): string {
  if (typeof next !== 'string' || !next.startsWith('/') || next.startsWith('//')) {
    return fallback;
  }
  return next;
}

function redirectUri(provider: OAuthProvider): string {
  return `${env.publicApiUrl}/auth/oauth/${provider}/callback`;
}

async function fetchJson<T>(
  url: string,
  init: RequestInit,
  failureMessage: string
): Promise<T> {
  const response = await fetch(url, init);
  const text = await response.text();
  let body: any = {};

  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = { raw: text };
    }
  }

  if (!response.ok) {
    throw new AppError(502, body.error_description || body.error || failureMessage);
  }

  return body as T;
}

export class OAuthService {
  static getEnabledProviders(): Record<OAuthProvider, boolean> {
    return {
      google: Boolean(env.googleOAuthClientId && env.googleOAuthClientSecret),
      github: Boolean(env.githubOAuthClientId && env.githubOAuthClientSecret),
    };
  }

  static getAuthorizationUrl(
    rawProvider: string,
    rawRole: unknown,
    rawNext: unknown
  ): string {
    const provider = assertProvider(rawProvider);
    const config = getProviderConfig(provider);
    const role = rawRole === 'admin' ? 'admin' : 'user';
    const next = safeNextPath(rawNext, role === 'admin' ? '/tasks' : '/documents');
    const statePayload: OAuthStatePayload = {
      provider,
      role,
      next,
      expiresAt: Date.now() + 10 * 60 * 1000,
      nonce: crypto.randomUUID(),
    };
    const encodedPayload = base64UrlJson(statePayload);
    const state = `${encodedPayload}.${signState(encodedPayload)}`;

    const params = new URLSearchParams({
      client_id: config.clientId!,
      redirect_uri: redirectUri(provider),
      response_type: 'code',
      scope: config.scope,
      state,
    });

    if (provider === 'google') {
      params.set('prompt', 'select_account');
    }

    return `${config.authUrl}?${params.toString()}`;
  }

  static parseState(state: unknown): OAuthStatePayload {
    if (typeof state !== 'string') {
      throw new AppError(400, 'Missing OAuth state');
    }

    const [encodedPayload, signature] = state.split('.');
    if (!encodedPayload || !signature) {
      throw new AppError(400, 'Invalid OAuth state');
    }

    const expectedSignature = signState(encodedPayload);
    const actual = Buffer.from(signature);
    const expected = Buffer.from(expectedSignature);
    if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) {
      throw new AppError(400, 'Invalid OAuth state');
    }

    let payload: OAuthStatePayload;
    try {
      payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString('utf8'));
    } catch {
      throw new AppError(400, 'Invalid OAuth state');
    }

    assertProvider(payload.provider);
    if (payload.role !== 'admin' && payload.role !== 'user') {
      throw new AppError(400, 'Invalid OAuth role');
    }
    if (payload.expiresAt < Date.now()) {
      throw new AppError(400, 'OAuth state expired');
    }
    payload.next = safeNextPath(payload.next, payload.role === 'admin' ? '/tasks' : '/documents');
    return payload;
  }

  static async exchangeCodeForProfile(
    provider: OAuthProvider,
    code: unknown
  ): Promise<OAuthProfile> {
    if (typeof code !== 'string' || !code) {
      throw new AppError(400, 'Missing OAuth code');
    }

    if (provider === 'google') {
      return this.exchangeGoogleCode(code);
    }

    return this.exchangeGitHubCode(code);
  }

  private static async exchangeGoogleCode(code: string): Promise<OAuthProfile> {
    const config = getProviderConfig('google');
    const token = await fetchJson<{ access_token?: string }>(
      config.tokenUrl,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: config.clientId!,
          client_secret: config.clientSecret!,
          redirect_uri: redirectUri('google'),
          grant_type: 'authorization_code',
        }),
      },
      'Failed to exchange Google OAuth code'
    );

    if (!token.access_token) {
      throw new AppError(502, 'Google did not return an access token');
    }

    const profile = await fetchJson<{
      sub?: string;
      email?: string;
      email_verified?: boolean;
    }>(
      'https://openidconnect.googleapis.com/v1/userinfo',
      { headers: { Authorization: `Bearer ${token.access_token}` } },
      'Failed to fetch Google profile'
    );

    if (!profile.sub || !profile.email || profile.email_verified === false) {
      throw new AppError(400, 'Google account email must be verified');
    }

    return {
      provider: 'google',
      providerUserId: profile.sub,
      email: profile.email.toLowerCase(),
    };
  }

  private static async exchangeGitHubCode(code: string): Promise<OAuthProfile> {
    const config = getProviderConfig('github');
    const token = await fetchJson<{ access_token?: string }>(
      config.tokenUrl,
      {
        method: 'POST',
        headers: {
          Accept: 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          code,
          client_id: config.clientId!,
          client_secret: config.clientSecret!,
          redirect_uri: redirectUri('github'),
        }),
      },
      'Failed to exchange GitHub OAuth code'
    );

    if (!token.access_token) {
      throw new AppError(502, 'GitHub did not return an access token');
    }

    const user = await fetchJson<{ id?: number }>(
      'https://api.github.com/user',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token.access_token}`,
        },
      },
      'Failed to fetch GitHub profile'
    );

    const emails = await fetchJson<Array<{
      email: string;
      primary: boolean;
      verified: boolean;
    }>>(
      'https://api.github.com/user/emails',
      {
        headers: {
          Accept: 'application/vnd.github+json',
          Authorization: `Bearer ${token.access_token}`,
        },
      },
      'Failed to fetch GitHub email'
    );

    const primaryEmail = emails.find((item) => item.primary && item.verified)
      || emails.find((item) => item.verified);
    if (!user.id || !primaryEmail) {
      throw new AppError(400, 'GitHub account must expose a verified email');
    }

    return {
      provider: 'github',
      providerUserId: String(user.id),
      email: primaryEmail.email.toLowerCase(),
    };
  }
}

/**
 * Unit tests for AuthService.
 *
 * All database models and email service are mocked so these tests run
 * without a real database or Redis connection.
 */

// ── Mocks ─────────────────────────────────────────────────────────────────────

jest.mock('../../models/user.model');
jest.mock('../../models/refresh-token.model');
jest.mock('../../models/user-ai-settings.model');
jest.mock('../../services/email.service', () => ({
  emailService: {
    sendVerificationEmail: jest.fn().mockResolvedValue(undefined),
    sendWelcomeEmail: jest.fn().mockResolvedValue(undefined),
    sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
  },
}));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// ── Imports ───────────────────────────────────────────────────────────────────

import { AuthService } from '../../services/auth.service';
import { emailService } from '../../services/email.service';
import { UserModel } from '../../models/user.model';
import { RefreshTokenModel } from '../../models/refresh-token.model';
import { UserAISettingsModel } from '../../models/user-ai-settings.model';
import { hashPassword } from '../../utils/crypto';
import { PASSWORD_RESET_TOKEN_TTL_MS } from '../../constants/auth';

const MockUserModel = UserModel as jest.Mocked<typeof UserModel>;
const MockRefreshTokenModel = RefreshTokenModel as jest.Mocked<typeof RefreshTokenModel>;
const MockUserAISettingsModel = UserAISettingsModel as jest.Mocked<typeof UserAISettingsModel>;
const MockEmailService = emailService as jest.Mocked<typeof emailService>;

// ── Fixtures ──────────────────────────────────────────────────────────────────

async function makeUserWithPassword(overrides: Partial<any> = {}) {
  const passwordHash = await hashPassword('password123');
  return {
    id: 'user-1',
    email: 'alice@example.com',
    passwordHash,
    role: 'user',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeUser(overrides: Partial<any> = {}) {
  return {
    id: 'user-1',
    email: 'alice@example.com',
    role: 'user',
    emailVerified: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const originalEnv = { ...process.env };

beforeEach(() => {
  jest.clearAllMocks();
  process.env = { ...originalEnv };
});

afterEach(() => {
  process.env = { ...originalEnv };
});

// ── register ──────────────────────────────────────────────────────────────────

describe('AuthService.register', () => {
  it('creates and returns a new user', async () => {
    delete process.env.DEFAULT_AI_API_KEY;
    delete process.env.AI_API_KEY;
    MockUserModel.findByEmail.mockResolvedValue(null);
    const user = makeUser();
    MockUserModel.create.mockResolvedValue(user as any);

    const result = await AuthService.register('alice@example.com', 'password123');
    expect(result).toEqual(user);
    expect(MockUserModel.create).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alice@example.com' })
    );
    expect(MockUserAISettingsModel.upsert).not.toHaveBeenCalled();
  });

  it('throws 409 when email is already registered', async () => {
    MockUserModel.findByEmail.mockResolvedValue(makeUser() as any);
    await expect(AuthService.register('alice@example.com', 'pass')).rejects.toMatchObject({
      statusCode: 409,
    });
    expect(MockUserModel.create).not.toHaveBeenCalled();
  });

  it('initializes default AI settings for new users when a default key is configured', async () => {
    process.env.DEFAULT_AI_API_KEY = 'prof-key';
    process.env.DEFAULT_AI_MODEL = 'gpt-4o-mini';
    process.env.DEFAULT_AI_BASE_URL = 'https://api.openai.com/v1';

    MockUserModel.findByEmail.mockResolvedValue(null);
    const user = makeUser();
    MockUserModel.create.mockResolvedValue(user as any);
    MockUserAISettingsModel.upsert.mockResolvedValue(undefined);

    await AuthService.register('alice@example.com', 'password123');

    expect(MockUserAISettingsModel.upsert).toHaveBeenCalledWith(
      user.id,
      'prof-key',
      'https://api.openai.com/v1',
      'gpt-4o-mini'
    );
  });

  it('does not fail registration when default AI settings initialization fails', async () => {
    process.env.DEFAULT_AI_API_KEY = 'prof-key';

    MockUserModel.findByEmail.mockResolvedValue(null);
    const user = makeUser();
    MockUserModel.create.mockResolvedValue(user as any);
    MockUserAISettingsModel.upsert.mockRejectedValue(new Error('db error'));

    await expect(AuthService.register('alice@example.com', 'password123')).resolves.toEqual(user);
  });
});

// ── login ─────────────────────────────────────────────────────────────────────

describe('AuthService.login', () => {
  it('returns user + tokens for valid credentials', async () => {
    const userWithPw = await makeUserWithPassword();
    MockUserModel.findByEmail.mockResolvedValue(userWithPw as any);
    MockRefreshTokenModel.create.mockResolvedValue({} as any);
    MockRefreshTokenModel.deleteExpired.mockResolvedValue(undefined);

    const result = await AuthService.login('alice@example.com', 'password123');
    expect(result.user.email).toBe('alice@example.com');
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
  });

  it('throws 401 when user does not exist', async () => {
    MockUserModel.findByEmail.mockResolvedValue(null);
    await expect(AuthService.login('x@x.com', 'pass')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('throws 401 when password is wrong', async () => {
    const userWithPw = await makeUserWithPassword();
    MockUserModel.findByEmail.mockResolvedValue(userWithPw as any);
    await expect(AuthService.login('alice@example.com', 'wrongpass')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('throws 403 when email has not been verified', async () => {
    const userWithPw = await makeUserWithPassword({ emailVerified: false });
    MockUserModel.findByEmail.mockResolvedValue(userWithPw as any);

    await expect(AuthService.login('alice@example.com', 'password123')).rejects.toMatchObject({
      statusCode: 403,
      message: 'Please verify your email before logging in',
    });

    expect(MockRefreshTokenModel.create).not.toHaveBeenCalled();
  });
});

// ── loginWithOAuth ───────────────────────────────────────────────────────────

describe('AuthService.loginWithOAuth', () => {
  it('creates a verified user, links the provider account, and returns tokens', async () => {
    delete process.env.DEFAULT_AI_API_KEY;
    delete process.env.AI_API_KEY;
    MockUserModel.findByOAuthAccount.mockResolvedValue(null);
    MockUserModel.findByEmail.mockResolvedValue(null);
    MockUserModel.createOAuthUser.mockResolvedValue(makeUser({ id: 'oauth-user' }) as any);
    MockUserModel.createOAuthAccount.mockResolvedValue(undefined);
    MockRefreshTokenModel.create.mockResolvedValue({} as any);
    MockRefreshTokenModel.deleteExpired.mockResolvedValue(undefined);

    const result = await AuthService.loginWithOAuth({
      provider: 'google',
      providerUserId: 'google-123',
      email: 'alice@example.com',
    });

    expect(result.user.email).toBe('alice@example.com');
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    expect(MockUserModel.createOAuthUser).toHaveBeenCalledWith(
      expect.objectContaining({ email: 'alice@example.com', role: 'user' })
    );
    expect(MockUserModel.createOAuthAccount).toHaveBeenCalledWith(
      'oauth-user',
      expect.objectContaining({
        provider: 'google',
        providerUserId: 'google-123',
        email: 'alice@example.com',
      })
    );
  });

  it('links an existing verified email account on first OAuth login', async () => {
    const existingUser = await makeUserWithPassword();
    MockUserModel.findByOAuthAccount.mockResolvedValue(null);
    MockUserModel.findByEmail.mockResolvedValue(existingUser as any);
    MockUserModel.createOAuthAccount.mockResolvedValue(undefined);
    MockRefreshTokenModel.create.mockResolvedValue({} as any);
    MockRefreshTokenModel.deleteExpired.mockResolvedValue(undefined);

    const result = await AuthService.loginWithOAuth({
      provider: 'github',
      providerUserId: '42',
      email: 'alice@example.com',
    });

    expect(result.user.id).toBe('user-1');
    expect(MockUserModel.createOAuthUser).not.toHaveBeenCalled();
    expect(MockUserModel.createOAuthAccount).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ provider: 'github', providerUserId: '42' })
    );
  });

  it('throws 403 when the OAuth email is registered for the wrong role', async () => {
    MockUserModel.findByOAuthAccount.mockResolvedValue(null);
    MockUserModel.findByEmail.mockResolvedValue(
      (await makeUserWithPassword({ role: 'admin' })) as any
    );

    await expect(
      AuthService.loginWithOAuth(
        {
          provider: 'google',
          providerUserId: 'google-123',
          email: 'alice@example.com',
        },
        'user'
      )
    ).rejects.toMatchObject({ statusCode: 403 });
    expect(MockUserModel.createOAuthAccount).not.toHaveBeenCalled();
  });
});

// ── logout ────────────────────────────────────────────────────────────────────

describe('AuthService.logout', () => {
  it('deletes specific refresh token when provided', async () => {
    MockRefreshTokenModel.deleteByHash.mockResolvedValue(undefined);
    await AuthService.logout('user-1', 'somerefreshtoken');
    expect(MockRefreshTokenModel.deleteByHash).toHaveBeenCalledTimes(1);
    expect(MockRefreshTokenModel.deleteByUserId).not.toHaveBeenCalled();
  });

  it('deletes all refresh tokens when no token is provided (logout all devices)', async () => {
    MockRefreshTokenModel.deleteByUserId.mockResolvedValue(undefined);
    await AuthService.logout('user-1');
    expect(MockRefreshTokenModel.deleteByUserId).toHaveBeenCalledWith('user-1');
  });
});

// ── refreshToken ──────────────────────────────────────────────────────────────

describe('AuthService.refreshToken', () => {
  it('returns new token pair for valid refresh token', async () => {
    const { generateRefreshToken } = require('../../utils/jwt');
    const oldToken = generateRefreshToken({ userId: 'user-1', email: 'alice@example.com' });

    MockRefreshTokenModel.findByUserIdAndHash.mockResolvedValue({ id: 'rt-1' } as any);
    MockRefreshTokenModel.deleteByHash.mockResolvedValue(undefined);
    MockRefreshTokenModel.create.mockResolvedValue({} as any);
    MockUserModel.findById.mockResolvedValue(makeUser() as any);

    const result = await AuthService.refreshToken(oldToken);
    expect(result.accessToken).toBeTruthy();
    expect(result.refreshToken).toBeTruthy();
    // Old token should have been revoked and a new one stored
    expect(MockRefreshTokenModel.deleteByHash).toHaveBeenCalledTimes(1);
    expect(MockRefreshTokenModel.create).toHaveBeenCalledTimes(1);
  });

  it('throws 401 for an invalid/expired refresh token', async () => {
    await expect(AuthService.refreshToken('not-a-jwt')).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('throws 401 when refresh token is not found in database', async () => {
    const { generateRefreshToken } = require('../../utils/jwt');
    const token = generateRefreshToken({ userId: 'user-1', email: 'a@b.com' });
    MockRefreshTokenModel.findByUserIdAndHash.mockResolvedValue(null);
    await expect(AuthService.refreshToken(token)).rejects.toMatchObject({
      statusCode: 401,
    });
  });

  it('throws 403 and revokes the refresh token when the account is unverified', async () => {
    const { generateRefreshToken } = require('../../utils/jwt');
    const token = generateRefreshToken({ userId: 'user-1', email: 'alice@example.com' });

    MockRefreshTokenModel.findByUserIdAndHash.mockResolvedValue({ id: 'rt-1' } as any);
    MockRefreshTokenModel.deleteByHash.mockResolvedValue(undefined);
    MockUserModel.findById.mockResolvedValue(makeUser({ emailVerified: false }) as any);

    await expect(AuthService.refreshToken(token)).rejects.toMatchObject({
      statusCode: 403,
      message: 'Please verify your email before logging in',
    });

    expect(MockRefreshTokenModel.deleteByHash).toHaveBeenCalledTimes(1);
    expect(MockRefreshTokenModel.create).not.toHaveBeenCalled();
  });
});

// ── verifyEmail ───────────────────────────────────────────────────────────────

describe('AuthService.verifyEmail', () => {
  it('verifies email and returns updated user', async () => {
    const userWithPw = await makeUserWithPassword();
    MockUserModel.findByVerificationToken.mockResolvedValue(userWithPw as any);
    MockUserModel.verifyEmail.mockResolvedValue(undefined);
    MockRefreshTokenModel.deleteByUserId.mockResolvedValue(undefined);
    const updatedUser = makeUser({ emailVerified: true });
    MockUserModel.findById.mockResolvedValue(updatedUser as any);

    const result = await AuthService.verifyEmail('123456');
    expect(result.emailVerified).toBe(true);
    expect(MockEmailService.sendWelcomeEmail).toHaveBeenCalledWith(
      'alice@example.com',
      'user'
    );
  });

  it('throws 400 for invalid verification code', async () => {
    MockUserModel.findByVerificationToken.mockResolvedValue(null);
    await expect(AuthService.verifyEmail('000000')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

// ── forgotPassword ────────────────────────────────────────────────────────────

describe('AuthService.forgotPassword', () => {
  it('stores a reset token and sends a password-reset email for known user', async () => {
    MockUserModel.findByEmail.mockResolvedValue(makeUser() as any);
    MockUserModel.setPasswordResetToken.mockResolvedValue(undefined);
    await AuthService.forgotPassword('alice@example.com');
    expect(MockUserModel.setPasswordResetToken).toHaveBeenCalledWith(
      'user-1',
      expect.any(String),
      expect.any(Date)
    );
    expect(MockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
      'alice@example.com',
      expect.any(String)
    );
    expect(MockEmailService.sendVerificationEmail).not.toHaveBeenCalled();
  });

  it('sets password reset tokens to expire after 30 minutes', async () => {
    MockUserModel.findByEmail.mockResolvedValue(makeUser() as any);
    MockUserModel.setPasswordResetToken.mockResolvedValue(undefined);
    const requestedAt = Date.now();

    await AuthService.forgotPassword('alice@example.com');

    const expiresAt = MockUserModel.setPasswordResetToken.mock.calls[0][2] as Date;
    const expectedExpiry = requestedAt + PASSWORD_RESET_TOKEN_TTL_MS;
    expect(expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiry);
    expect(expiresAt.getTime()).toBeLessThan(expectedExpiry + 1000);
  });

  it('surfaces reset email delivery failures for known users', async () => {
    MockUserModel.findByEmail.mockResolvedValue(makeUser() as any);
    MockUserModel.setPasswordResetToken.mockResolvedValue(undefined);
    MockEmailService.sendPasswordResetEmail.mockRejectedValueOnce(new Error('sendgrid rejected'));

    await expect(AuthService.forgotPassword('alice@example.com')).rejects.toThrow(
      'sendgrid rejected'
    );
  });

  it('does nothing (no error, no DB write) for unknown email', async () => {
    MockUserModel.findByEmail.mockResolvedValue(null);
    await expect(AuthService.forgotPassword('unknown@x.com')).resolves.toBeUndefined();
    expect(MockUserModel.setPasswordResetToken).not.toHaveBeenCalled();
    expect(MockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    expect(MockEmailService.sendVerificationEmail).not.toHaveBeenCalled();
  });
});

// ── validatePasswordResetToken ────────────────────────────────────────────────

describe('AuthService.validatePasswordResetToken', () => {
  it('accepts a valid reset token without mutating the user', async () => {
    MockUserModel.findByResetToken.mockResolvedValue(makeUser() as any);

    await expect(
      AuthService.validatePasswordResetToken('validtoken')
    ).resolves.toBeUndefined();

    expect(MockUserModel.findByResetToken).toHaveBeenCalledWith('validtoken');
    expect(MockUserModel.resetPassword).not.toHaveBeenCalled();
    expect(MockRefreshTokenModel.deleteByUserId).not.toHaveBeenCalled();
  });

  it('throws 400 for an invalid or expired reset token', async () => {
    MockUserModel.findByResetToken.mockResolvedValue(null);

    await expect(
      AuthService.validatePasswordResetToken('badtoken')
    ).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

// ── resetPassword ─────────────────────────────────────────────────────────────

describe('AuthService.resetPassword', () => {
  it('resets password and invalidates all refresh tokens', async () => {
    MockUserModel.findByResetToken.mockResolvedValue(makeUser() as any);
    MockUserModel.resetPassword.mockResolvedValue(undefined);
    MockRefreshTokenModel.deleteByUserId.mockResolvedValue(undefined);

    await AuthService.resetPassword('validtoken', 'newPassword1!');
    expect(MockUserModel.resetPassword).toHaveBeenCalledWith('user-1', expect.any(String));
    expect(MockRefreshTokenModel.deleteByUserId).toHaveBeenCalledWith('user-1');
  });

  it('throws 400 for invalid/expired reset token', async () => {
    MockUserModel.findByResetToken.mockResolvedValue(null);
    await expect(AuthService.resetPassword('badtoken', 'newpass')).rejects.toMatchObject({
      statusCode: 400,
    });
  });
});

// ── getUserById ───────────────────────────────────────────────────────────────

describe('AuthService.getUserById', () => {
  it('returns user for valid ID', async () => {
    const user = makeUser();
    MockUserModel.findById.mockResolvedValue(user as any);
    const result = await AuthService.getUserById('user-1');
    expect(result).toEqual(user);
  });

  it('throws 404 for unknown user ID', async () => {
    MockUserModel.findById.mockResolvedValue(null);
    await expect(AuthService.getUserById('ghost')).rejects.toMatchObject({
      statusCode: 404,
    });
  });
});

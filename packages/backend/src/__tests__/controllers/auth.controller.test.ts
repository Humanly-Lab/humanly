jest.mock('../../services/auth.service');
jest.mock('../../services/oauth.service', () => ({
  OAuthService: {
    getEnabledProviders: jest.fn(() => []),
    getAuthorizationUrl: jest.fn(),
    parseState: jest.fn(),
    exchangeCodeForProfile: jest.fn(),
  },
}));
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

import { Request, Response, NextFunction } from 'express';
import {
  deleteCurrentUser,
  handleOAuthCallback,
  login,
  logout,
  register,
  updateCurrentUser,
} from '../../controllers/auth.controller';
import { AuthService } from '../../services/auth.service';
import { OAuthService } from '../../services/oauth.service';

const MockAuthService = AuthService as jest.Mocked<typeof AuthService>;
const MockOAuthService = OAuthService as jest.Mocked<typeof OAuthService>;

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    body: {},
    cookies: {},
    user: undefined,
    ...overrides,
  } as Request;
}

function makeRes(): jest.Mocked<Response> {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
}

async function runController(
  handler: (req: Request, res: Response, next: NextFunction) => void,
  req: Request,
  res: Response,
  next: NextFunction = jest.fn()
) {
  handler(req, res, next);
  await new Promise((resolve) => setImmediate(resolve));
  return next;
}

describe('auth controller cookies and profile names', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('registers without profile names so Basic Info can collect them later', async () => {
    const createdUser = {
      id: 'user-1',
      email: 'writer@mail.com',
      name: null,
      firstName: null,
      lastName: null,
      profileCompleted: false,
      emailVerified: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    MockAuthService.register.mockResolvedValue(createdUser);

    const req = makeReq({
      body: {
        email: 'writer@mail.com',
        password: 'Password123!',
      },
    });
    const res = makeRes();

    await runController(register, req, res);

    expect(MockAuthService.register).toHaveBeenCalledWith('writer@mail.com', 'Password123!');
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: { user: createdUser },
    }));
  });

  it('sets httpOnly auth cookies with consistent security options on login', async () => {
    MockAuthService.login.mockResolvedValue({
      user: {
        id: 'admin-1',
        email: 'admin@mail.com',
        profileCompleted: true,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      accessToken: 'access-token-1',
      refreshToken: 'refresh-token-1',
    } as any);

    const req = makeReq({
      body: {
        email: 'admin@mail.com',
        password: 'Password123!',
      },
    });
    const res = makeRes();

    await runController(login, req, res);

    expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'refresh-token-1', expect.objectContaining({
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    }));
    expect(res.cookie).toHaveBeenCalledWith('accessToken', 'access-token-1', expect.objectContaining({
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
      maxAge: 24 * 60 * 60 * 1000,
    }));
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        accessToken: 'access-token-1',
      }),
    }));
  });

  it('redirects admin OAuth callbacks to the admin portal callback', async () => {
    MockOAuthService.parseState.mockReturnValue({
      provider: 'google',
      next: '/tasks',
      expiresAt: Date.now() + 60000,
      nonce: 'nonce-1',
    } as any);
    MockOAuthService.exchangeCodeForProfile.mockResolvedValue({
      provider: 'google',
      providerUserId: 'google-1',
      email: 'admin@mail.com',
    });
    MockAuthService.loginWithOAuth.mockResolvedValue({
      user: {
        id: 'admin-1',
        email: 'admin@mail.com',
        profileCompleted: true,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      accessToken: 'access-token-1',
      refreshToken: 'refresh-token-1',
    } as any);

    const req = makeReq({
      params: { provider: 'google' },
      query: { state: 'state-1', code: 'code-1' },
    } as any);
    const res = makeRes();

    await runController(handleOAuthCallback, req, res);

    expect(MockAuthService.loginWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'google', email: 'admin@mail.com' })
    );
    expect(res.cookie).toHaveBeenCalledWith('refreshToken', 'refresh-token-1', expect.any(Object));
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringMatching(/^http:\/\/localhost:3000\/auth\/callback#/)
    );
    const redirectTarget = new URL((res.redirect as jest.Mock).mock.calls[0][0]);
    const hash = new URLSearchParams(redirectTarget.hash.slice(1));
    expect(hash.get('accessToken')).toBe('access-token-1');
    expect(hash.get('next')).toBe('/tasks');
  });

  it('redirects user OAuth callbacks to the user portal callback', async () => {
    MockOAuthService.parseState.mockReturnValue({
      provider: 'github',
      next: '/documents',
      expiresAt: Date.now() + 60000,
      nonce: 'nonce-2',
    } as any);
    MockOAuthService.exchangeCodeForProfile.mockResolvedValue({
      provider: 'github',
      providerUserId: 'github-1',
      email: 'writer@mail.com',
    });
    MockAuthService.loginWithOAuth.mockResolvedValue({
      user: {
        id: 'user-1',
        email: 'writer@mail.com',
        profileCompleted: true,
        emailVerified: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      accessToken: 'access-token-2',
      refreshToken: 'refresh-token-2',
    } as any);

    const req = makeReq({
      params: { provider: 'github' },
      query: { state: 'state-2', code: 'code-2' },
    } as any);
    const res = makeRes();

    await runController(handleOAuthCallback, req, res);

    expect(MockAuthService.loginWithOAuth).toHaveBeenCalledWith(
      expect.objectContaining({ provider: 'github', email: 'writer@mail.com' })
    );
    expect(res.redirect).toHaveBeenCalledWith(
      expect.stringMatching(/^http:\/\/localhost:3002\/auth\/callback#/)
    );
    const redirectTarget = new URL((res.redirect as jest.Mock).mock.calls[0][0]);
    const hash = new URLSearchParams(redirectTarget.hash.slice(1));
    expect(hash.get('accessToken')).toBe('access-token-2');
    expect(hash.get('next')).toBe('/documents');
  });

  it('clears auth cookies with the same base options on logout', async () => {
    MockAuthService.logout.mockResolvedValue(undefined);

    const req = makeReq({
      user: { userId: 'admin-1', email: 'admin@mail.com' },
      cookies: {
        refreshToken: 'refresh-token-1',
      },
    } as any);
    const res = makeRes();

    await runController(logout, req, res);

    expect(MockAuthService.logout).toHaveBeenCalledWith('admin-1', 'refresh-token-1');
    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', expect.objectContaining({
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
    }));
    expect(res.clearCookie).toHaveBeenCalledWith('accessToken', expect.objectContaining({
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
    }));
  });

  it('updates the current user profile through PATCH /auth/me', async () => {
    const updatedUser = {
      id: 'user-1',
      email: 'writer@mail.com',
      name: 'Writer Two',
      firstName: 'Writer',
      lastName: 'Two',
      profileCompleted: true,
      emailVerified: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    MockAuthService.updateUserProfile.mockResolvedValue(updatedUser);

    const req = makeReq({
      user: { userId: 'user-1', email: 'writer@mail.com' },
      body: { firstName: ' Writer ', lastName: ' Two ' },
    } as any);
    const res = makeRes();

    await runController(updateCurrentUser, req, res);

    expect(MockAuthService.updateUserProfile).toHaveBeenCalledWith('user-1', {
      firstName: 'Writer',
      lastName: 'Two',
    });
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { user: updatedUser },
    });
  });

  it('deletes the current user account and clears auth cookies', async () => {
    MockAuthService.deleteCurrentUser.mockResolvedValue(undefined);

    const req = makeReq({
      user: { userId: 'user-1', email: 'writer@mail.com' },
    } as any);
    const res = makeRes();

    await runController(deleteCurrentUser, req, res);

    expect(MockAuthService.deleteCurrentUser).toHaveBeenCalledWith('user-1');
    expect(res.clearCookie).toHaveBeenCalledWith('refreshToken', expect.objectContaining({
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
    }));
    expect(res.clearCookie).toHaveBeenCalledWith('accessToken', expect.objectContaining({
      httpOnly: true,
      secure: false,
      sameSite: 'strict',
      path: '/',
    }));
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Account deleted successfully',
    });
  });
});

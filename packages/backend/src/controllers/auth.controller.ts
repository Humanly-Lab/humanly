import { Request, Response } from 'express';
import { AuthService } from '../services/auth.service';
import { OAuthService } from '../services/oauth.service';
import { asyncHandler } from '../middleware/error-handler';
import {
  registerSchema,
  loginSchema,
  verifyEmailSchema,
  forgotPasswordSchema,
  resetPasswordSchema,
  passwordResetTokenSchema,
  updateUserProfileSchema,
} from '@humanly/shared';
import { logger } from '../utils/logger';
import { env } from '../config/env';

const AUTH_COOKIE_BASE_OPTIONS = {
  httpOnly: true,
  secure: env.nodeEnv === 'production',
  sameSite: 'strict' as const,
  path: '/',
  ...(env.authCookieDomain ? { domain: env.authCookieDomain } : {}),
};

function isAdminPortalNextPath(next: string): boolean {
  return next === '/tasks' || (next.startsWith('/tasks/') && !next.startsWith('/tasks/public/'));
}

function getOAuthCallbackFrontendUrl(next: string): string {
  return isAdminPortalNextPath(next) ? env.frontendAdminUrl : env.frontendUserUrl;
}

function setAuthCookies(res: Response, accessToken: string, refreshToken: string): void {
  res.cookie('refreshToken', refreshToken, {
    ...AUTH_COOKIE_BASE_OPTIONS,
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  res.cookie('accessToken', accessToken, {
    ...AUTH_COOKIE_BASE_OPTIONS,
    maxAge: 24 * 60 * 60 * 1000,
  });
}

function clearAuthCookies(res: Response): void {
  res.clearCookie('refreshToken', AUTH_COOKIE_BASE_OPTIONS);
  res.clearCookie('accessToken', AUTH_COOKIE_BASE_OPTIONS);
}

/**
 * Register a new user
 * POST /api/v1/auth/register
 */
export const register = asyncHandler(async (req: Request, res: Response) => {
  // Validate request body
  const { email, password } = registerSchema.parse(req.body);

  // Register user
  const user = await AuthService.register(email, password);

  if (!env.emailVerificationRequired) {
    const { user: authenticatedUser, accessToken, refreshToken } = await AuthService.login(
      email,
      password
    );

    setAuthCookies(res, accessToken, refreshToken);

    res.status(201).json({
      success: true,
      message: 'Registration successful',
      data: {
        user: authenticatedUser,
        accessToken,
      },
    });
    return;
  }

  res.status(201).json({
    success: true,
    message: 'Registration successful. Please check your email to verify your account.',
    data: { user },
  });
});

/**
 * Verify email address
 * POST /api/v1/auth/verify-email
 */
export const verifyEmail = asyncHandler(async (req: Request, res: Response) => {
  // Validate request body
  const { code } = verifyEmailSchema.parse(req.body);

  // Verify email
  const user = await AuthService.verifyEmail(code);

  res.json({
    success: true,
    message: 'Email verified successfully. You can now log in.',
    data: { user },
  });
});

/**
 * Resend verification email
 * POST /api/v1/auth/resend-verification
 */
export const resendVerificationEmail = asyncHandler(async (req: Request, res: Response) => {
  // Validate request body - expect email
  const { email } = req.body;
  if (!email || typeof email !== 'string') {
    res.status(400).json({
      success: false,
      error: 'Bad Request',
      message: 'Email is required',
    });
    return;
  }

  // Resend verification email
  await AuthService.resendVerificationEmail(email);

  res.json({
    success: true,
    message: 'If your email is registered and not verified, a new verification email has been sent.',
  });
});

/**
 * Login user
 * POST /api/v1/auth/login
 */
export const login = asyncHandler(async (req: Request, res: Response) => {
  // Validate request body
  const { email, password } = loginSchema.parse(req.body);

  // Login user
  const { user, accessToken, refreshToken } = await AuthService.login(email, password);

  setAuthCookies(res, accessToken, refreshToken);

  res.json({
    success: true,
    message: 'Login successful',
    data: {
      user,
      accessToken,
    },
  });
});

/**
 * Logout user
 * POST /api/v1/auth/logout
 */
export const logout = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  // Get refresh token from cookie or body
  const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

  // Logout user
  await AuthService.logout(userId, refreshToken);

  // Clear cookies
  clearAuthCookies(res);

  res.json({
    success: true,
    message: 'Logout successful',
  });
});

/**
 * Refresh access token
 * POST /api/v1/auth/refresh
 */
export const refreshToken = asyncHandler(async (req: Request, res: Response) => {
  // Get refresh token from cookie or body
  const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;

  if (!refreshToken) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Refresh token required',
    });
    return;
  }

  // Refresh tokens
  const { user, accessToken, refreshToken: newRefreshToken } = await AuthService.refreshToken(
    refreshToken
  );

  setAuthCookies(res, accessToken, newRefreshToken);

  res.json({
    success: true,
    message: 'Token refreshed successfully',
    data: {
      user,
      accessToken,
    },
  });
});

/**
 * Request password reset
 * POST /api/v1/auth/forgot-password
 */
export const forgotPassword = asyncHandler(async (req: Request, res: Response) => {
  // Validate request body
  const { email } = forgotPasswordSchema.parse(req.body);

  // Request password reset
  await AuthService.forgotPassword(email);

  // Always return success to prevent email enumeration
  res.json({
    success: true,
    message: 'If an account with that email exists, a password reset link has been sent.',
  });
});

/**
 * Validate password reset link
 * POST /api/v1/auth/reset-password/validate
 */
export const validatePasswordResetToken = asyncHandler(async (req: Request, res: Response) => {
  const { token } = passwordResetTokenSchema.parse(req.body);

  await AuthService.validatePasswordResetToken(token);

  res.json({
    success: true,
    message: 'Password reset token is valid.',
  });
});

/**
 * Reset password
 * POST /api/v1/auth/reset-password
 */
export const resetPassword = asyncHandler(async (req: Request, res: Response) => {
  // Validate request body
  const { token, newPassword } = resetPasswordSchema.parse(req.body);

  // Reset password
  await AuthService.resetPassword(token, newPassword);

  res.json({
    success: true,
    message: 'Password reset successful. You can now log in with your new password.',
  });
});

/**
 * Get current user
 * GET /api/v1/auth/me
 */
export const getCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  // Get user
  const user = await AuthService.getUserById(userId);

  res.json({
    success: true,
    data: { user },
  });
});

/**
 * Update current user profile
 * PATCH /api/v1/auth/me
 */
export const updateCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  const data = updateUserProfileSchema.parse(req.body);
  const user = await AuthService.updateUserProfile(userId, data);

  res.json({
    success: true,
    data: { user },
  });
});

/**
 * Delete current user account
 * DELETE /api/v1/auth/me
 */
export const deleteCurrentUser = asyncHandler(async (req: Request, res: Response) => {
  const userId = req.user?.userId;
  if (!userId) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Authentication required',
    });
    return;
  }

  await AuthService.deleteCurrentUser(userId);
  clearAuthCookies(res);

  res.json({
    success: true,
    message: 'Account deleted successfully',
  });
});

/**
 * List configured OAuth providers
 * GET /api/v1/auth/oauth/providers
 */
export const getOAuthProviders = asyncHandler(async (_req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      providers: OAuthService.getEnabledProviders(),
    },
  });
});

/**
 * Redirect to provider OAuth consent/login page
 * GET /api/v1/auth/oauth/:provider/start
 */
export const startOAuth = asyncHandler(async (req: Request, res: Response) => {
  const url = OAuthService.getAuthorizationUrl(
    req.params.provider,
    req.query.next
  );
  res.redirect(url);
});

/**
 * Provider OAuth callback
 * GET /api/v1/auth/oauth/:provider/callback
 */
export const handleOAuthCallback = asyncHandler(async (req: Request, res: Response) => {
  let redirectUrl = new URL('/auth/callback', env.frontendUserUrl);

  try {
    const state = OAuthService.parseState(req.query.state);
    redirectUrl = new URL('/auth/callback', getOAuthCallbackFrontendUrl(state.next));

    if (req.query.error) {
      throw new Error(String(req.query.error_description || req.query.error));
    }

    const profile = await OAuthService.exchangeCodeForProfile(state.provider, req.query.code);
    const { accessToken, refreshToken } = await AuthService.loginWithOAuth(profile);

    setAuthCookies(res, accessToken, refreshToken);

    redirectUrl.hash = new URLSearchParams({
      accessToken,
      next: state.next,
    }).toString();
  } catch (error: any) {
    logger.error('OAuth callback failed', {
      provider: req.params.provider,
      error: error?.message || error,
    });
    redirectUrl.hash = new URLSearchParams({
      error: error?.message || 'OAuth login failed',
    }).toString();
  }

  res.redirect(redirectUrl.toString());
});

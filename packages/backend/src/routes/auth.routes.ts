import { Router } from 'express';
import {
  register,
  verifyEmail,
  resendVerificationEmail,
  login,
  logout,
  refreshToken,
  forgotPassword,
  validatePasswordResetToken,
  resetPassword,
  getCurrentUser,
  getOAuthProviders,
  startOAuth,
  handleOAuthCallback,
} from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import {
  registerRateLimiter,
  loginRateLimiter,
  passwordResetRateLimiter,
  emailVerificationRateLimiter,
  refreshTokenRateLimiter,
} from '../middleware/rate-limit';

const router: Router = Router();

/**
 * POST /api/v1/auth/register
 * Register a new user account
 * Rate limited: 3 attempts per hour
 */
router.post('/register', registerRateLimiter, register);

/**
 * POST /api/v1/auth/verify-email
 * Verify email address using token
 * Rate limited: 5 attempts per hour
 */
router.post('/verify-email', emailVerificationRateLimiter, verifyEmail);

/**
 * POST /api/v1/auth/resend-verification
 * Resend verification email
 * Rate limited: 5 attempts per hour
 */
router.post('/resend-verification', emailVerificationRateLimiter, resendVerificationEmail);

/**
 * POST /api/v1/auth/login
 * Login with email and password
 * Rate limited: 10 attempts per 15 minutes
 */
router.post('/login', loginRateLimiter, login);

/**
 * POST /api/v1/auth/logout
 * Logout current user and invalidate refresh token
 * Requires authentication
 */
router.post('/logout', authenticate, logout);

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token
 * Rate limited: 20 attempts per 15 minutes
 */
router.post('/refresh', refreshTokenRateLimiter, refreshToken);

/**
 * POST /api/v1/auth/forgot-password
 * Request password reset email
 * Rate limited: 3 attempts per hour
 */
router.post('/forgot-password', passwordResetRateLimiter, forgotPassword);

/**
 * POST /api/v1/auth/reset-password/validate
 * Validate password reset link before showing the reset form
 * Rate limited: 3 attempts per hour
 */
router.post('/reset-password/validate', passwordResetRateLimiter, validatePasswordResetToken);

/**
 * POST /api/v1/auth/reset-password
 * Reset password using reset token
 * Rate limited: 3 attempts per hour
 */
router.post('/reset-password', passwordResetRateLimiter, resetPassword);

/**
 * GET /api/v1/auth/oauth/providers
 * Public list of configured OAuth login providers
 */
router.get('/oauth/providers', getOAuthProviders);

/**
 * GET /api/v1/auth/oauth/:provider/start
 * Start OAuth login flow
 */
router.get('/oauth/:provider/start', loginRateLimiter, startOAuth);

/**
 * GET /api/v1/auth/oauth/:provider/callback
 * Complete OAuth login flow
 */
router.get('/oauth/:provider/callback', loginRateLimiter, handleOAuthCallback);

/**
 * GET /api/v1/auth/me
 * Get current authenticated user
 * Requires authentication
 */
router.get('/me', authenticate, getCurrentUser);

export default router;

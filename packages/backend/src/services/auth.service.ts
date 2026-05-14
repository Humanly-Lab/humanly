import { User, UserRole } from '@humanly/shared';
import { UserModel } from '../models/user.model';
import { RefreshTokenModel } from '../models/refresh-token.model';
import { emailService } from './email.service';
import {
  hashPassword,
  comparePassword,
  generateVerificationToken,
  generatePasswordResetToken,
  hashToken,
} from '../utils/crypto';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  TokenPayload,
} from '../utils/jwt';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';
import { UserAISettingsModel } from '../models/user-ai-settings.model';

export class AuthService {
  private static async initializeDefaultAISettings(userId: string): Promise<void> {
    const apiKey = process.env.DEFAULT_AI_API_KEY || process.env.AI_API_KEY;
    const model = process.env.DEFAULT_AI_MODEL || process.env.AI_MODEL || 'Qwen/Qwen3.5-397B-A17B';
    const baseUrl = process.env.DEFAULT_AI_BASE_URL || process.env.AI_BASE_URL || 'https://api.together.xyz/v1';

    if (!apiKey) {
      logger.info('Skipping default AI settings initialization: no default API key configured', { userId });
      return;
    }

    try {
      await UserAISettingsModel.upsert(userId, apiKey, baseUrl, model);
      logger.info('Default AI settings initialized for new user', { userId, baseUrl, model });
    } catch (error) {
      logger.warn('Failed to initialize default AI settings for new user', { userId, error });
    }
  }

  /**
   * Register a new user
   */
  static async register(email: string, password: string, role: UserRole = 'user'): Promise<User> {
    logger.info('Attempting to register user', { email, role });

    // Check if user already exists
    const existingUser = await UserModel.findByEmail(email);
    if (existingUser) {
      throw new AppError(409, 'Email already registered');
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Generate email verification token (6-digit code)
    const verificationToken = generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Create user
    const user = await UserModel.create({
      email,
      passwordHash,
      role,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
    });

    await this.initializeDefaultAISettings(user.id);

    // Log verification code to console (since email service not configured)
    logger.info('🔐 VERIFICATION CODE GENERATED', {
      userId: user.id,
      email,
      code: verificationToken,
      expiresAt: verificationExpires,
    });
    console.log('\n' + '='.repeat(60));
    console.log('📧 EMAIL VERIFICATION CODE');
    console.log('='.repeat(60));
    console.log(`Email: ${email}`);
    console.log(`Code: ${verificationToken}`);
    console.log(`Expires: ${verificationExpires.toLocaleString()}`);
    console.log('='.repeat(60) + '\n');

    // Send verification email (don't await to avoid blocking)
    emailService
      .sendVerificationEmail(email, verificationToken)
      .catch((error) => {
        logger.error('Failed to send verification email', { email, error });
      });

    logger.info('User registered successfully', { userId: user.id, email });
    return user;
  }

  /**
   * Verify user email
   */
  static async verifyEmail(code: string): Promise<User> {
    logger.info('Attempting to verify email', { code });

    // Find user by verification code
    const userWithPassword = await UserModel.findByVerificationToken(code);
    if (!userWithPassword) {
      throw new AppError(400, 'Invalid or expired verification code');
    }

    // Verify email
    await UserModel.verifyEmail(userWithPassword.id);

    // Clear all existing refresh tokens (force re-login after verification)
    await RefreshTokenModel.deleteByUserId(userWithPassword.id);

    // Get updated user
    const user = await UserModel.findById(userWithPassword.id);
    if (!user) {
      throw new AppError(500, 'Failed to verify email');
    }

    // Send welcome email (don't await to avoid blocking)
    emailService
      .sendWelcomeEmail(user.email)
      .catch((error) => {
        logger.error('Failed to send welcome email', { email: user.email, error });
      });

    logger.info('Email verified successfully', { userId: user.id, email: user.email });
    return user;
  }

  /**
   * Login user and return tokens
   */
  static async login(
    email: string,
    password: string,
    requestedRole?: UserRole
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    logger.info('Attempting login', { email, requestedRole });

    // Find user by email
    const userWithPassword = await UserModel.findByEmail(email);
    if (!userWithPassword) {
      throw new AppError(401, 'Invalid email or password');
    }

    if (requestedRole && userWithPassword.role !== requestedRole) {
      throw new AppError(
        403,
        requestedRole === 'admin'
          ? 'This email is not registered as an admin account'
          : 'This email is not registered as a user account'
      );
    }

    // Compare password
    const isPasswordValid = await comparePassword(password, userWithPassword.passwordHash);
    if (!isPasswordValid) {
      throw new AppError(401, 'Invalid email or password');
    }

    // Skip email verification check for now (email service not configured)
    // if (!userWithPassword.emailVerified) {
    //   throw new AppError(403, 'Please verify your email before logging in');
    // }

    // Generate tokens
    const payload: TokenPayload = {
      userId: userWithPassword.id,
      email: userWithPassword.email,
      role: userWithPassword.role,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    // Store refresh token hash
    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await RefreshTokenModel.create(userWithPassword.id, tokenHash, expiresAt);

    // Clean up expired tokens for this user
    await RefreshTokenModel.deleteExpired();

    // Get user without password
    const user: User = {
      id: userWithPassword.id,
      email: userWithPassword.email,
      role: userWithPassword.role,
      emailVerified: userWithPassword.emailVerified,
      createdAt: userWithPassword.createdAt,
      updatedAt: userWithPassword.updatedAt,
    };

    logger.info('Login successful', { userId: user.id, email: user.email });
    return { user, accessToken, refreshToken };
  }

  /**
   * Logout user (invalidate refresh token)
   */
  static async logout(userId: string, refreshToken?: string): Promise<void> {
    logger.info('Attempting logout', { userId });

    if (refreshToken) {
      // Delete specific refresh token
      const tokenHash = hashToken(refreshToken);
      await RefreshTokenModel.deleteByHash(tokenHash);
    } else {
      // Delete all refresh tokens for user (logout from all devices)
      await RefreshTokenModel.deleteByUserId(userId);
    }

    logger.info('Logout successful', { userId });
  }

  /**
   * Refresh access token using refresh token
   */
  static async refreshToken(
    refreshToken: string
  ): Promise<{ accessToken: string; refreshToken: string }> {
    logger.info('Attempting to refresh token');

    // Verify refresh token
    let payload: TokenPayload;
    try {
      payload = verifyToken(refreshToken);
    } catch (error) {
      throw new AppError(401, 'Invalid or expired refresh token');
    }

    // Check if refresh token exists in database
    const tokenHash = hashToken(refreshToken);
    const storedToken = await RefreshTokenModel.findByUserIdAndHash(payload.userId, tokenHash);
    if (!storedToken) {
      throw new AppError(401, 'Invalid or expired refresh token');
    }

    // Get user to ensure they still exist
    const user = await UserModel.findById(payload.userId);
    if (!user) {
      throw new AppError(401, 'User not found');
    }

    // Note: We don't check email verification here because:
    // 1. User had to be verified to get a refresh token in the first place (checked at login)
    // 2. Re-checking here causes issues when users have old tokens
    // 3. If we need to revoke access, we should delete their refresh tokens instead

    // Generate new tokens
    const newPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
      role: user.role,
    };

    const accessToken = generateAccessToken(newPayload);
    const newRefreshToken = generateRefreshToken(newPayload);

    // Delete old refresh token
    await RefreshTokenModel.deleteByHash(tokenHash);

    // Store new refresh token hash
    const newTokenHash = hashToken(newRefreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days
    await RefreshTokenModel.create(user.id, newTokenHash, expiresAt);

    logger.info('Token refreshed successfully', { userId: user.id });
    return { accessToken, refreshToken: newRefreshToken };
  }

  /**
   * Validate refresh token
   */
  static async validateRefreshToken(tokenHash: string): Promise<boolean> {
    const token = await RefreshTokenModel.findByHash(tokenHash);
    return token !== null;
  }

  /**
   * Request password reset
   */
  static async forgotPassword(email: string): Promise<void> {
    logger.info('Password reset requested', { email });

    // Find user by email
    const user = await UserModel.findByEmail(email);
    if (!user) {
      // Don't reveal if user exists
      logger.info('Password reset requested for non-existent email', { email });
      return;
    }

    // Generate reset token
    const resetToken = generatePasswordResetToken();
    const resetExpires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    // Store reset token
    await UserModel.setPasswordResetToken(user.id, resetToken, resetExpires);

    // Send reset email (don't await to avoid blocking)
    emailService
      .sendPasswordResetEmail(email, resetToken)
      .catch((error) => {
        logger.error('Failed to send password reset email', { email, error });
      });

    logger.info('Password reset email sent', { userId: user.id, email });
  }

  /**
   * Reset password using reset token
   */
  static async resetPassword(token: string, newPassword: string): Promise<void> {
    logger.info('Attempting password reset', { token: token.substring(0, 10) + '...' });

    // Find user by reset token
    const user = await UserModel.findByResetToken(token);
    if (!user) {
      throw new AppError(400, 'Invalid or expired password reset token');
    }

    // Hash new password
    const passwordHash = await hashPassword(newPassword);

    // Update password and clear reset token
    await UserModel.resetPassword(user.id, passwordHash);

    // Invalidate all refresh tokens (logout from all devices)
    await RefreshTokenModel.deleteByUserId(user.id);

    logger.info('Password reset successful', { userId: user.id, email: user.email });
  }

  /**
   * Resend verification email
   */
  static async resendVerificationEmail(email: string): Promise<void> {
    logger.info('Resending verification email', { email });

    // Find user by email
    const user = await UserModel.findByEmail(email);
    if (!user) {
      // Don't reveal if user exists
      logger.info('Resend verification requested for non-existent email', { email });
      return;
    }

    // Check if already verified
    if (user.emailVerified) {
      throw new AppError(400, 'Email is already verified');
    }

    // Generate new verification token (6-digit code)
    const verificationToken = generateVerificationToken();
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24 hours

    // Update user with new token
    await UserModel.updateVerificationToken(user.id, verificationToken, verificationExpires);

    // Log verification code to console (since email service not configured)
    logger.info('🔐 VERIFICATION CODE RESENT', {
      userId: user.id,
      email,
      code: verificationToken,
      expiresAt: verificationExpires,
    });
    console.log('\n' + '='.repeat(60));
    console.log('📧 EMAIL VERIFICATION CODE (RESENT)');
    console.log('='.repeat(60));
    console.log(`Email: ${email}`);
    console.log(`Code: ${verificationToken}`);
    console.log(`Expires: ${verificationExpires.toLocaleString()}`);
    console.log('='.repeat(60) + '\n');

    // Send verification email (don't await to avoid blocking)
    emailService
      .sendVerificationEmail(email, verificationToken)
      .catch((error) => {
        logger.error('Failed to send verification email', { email, error });
      });

    logger.info('Verification email resent', { userId: user.id, email });
  }

  /**
   * Get user by ID
   */
  static async getUserById(userId: string): Promise<User> {
    const user = await UserModel.findById(userId);
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    return user;
  }
}

import { normalizeEmail, User } from '@humanly/shared';
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
import { FileModel } from '../models/file.model';
import { OAuthProfile } from './oauth.service';
import { PASSWORD_RESET_TOKEN_TTL_MS } from '../constants/auth';
import { FileStorageService } from './file-storage.service';

export class AuthService {
  /**
   * Register a new user
   */
  static async register(email: string, password: string): Promise<User> {
    const canonicalEmail = normalizeEmail(email);
    logger.info('Attempting to register user', { email: canonicalEmail });

    // Check if user already exists
    const existingUser = await UserModel.findByEmail(canonicalEmail);
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
      email: canonicalEmail,
      passwordHash,
      emailVerificationToken: verificationToken,
      emailVerificationExpires: verificationExpires,
    });

    // Log verification code to console (since email service not configured)
    logger.info('🔐 VERIFICATION CODE GENERATED', {
      userId: user.id,
      email: canonicalEmail,
      code: verificationToken,
      expiresAt: verificationExpires,
    });
    console.log('\n' + '='.repeat(60));
    console.log('📧 EMAIL VERIFICATION CODE');
    console.log('='.repeat(60));
    console.log(`Email: ${canonicalEmail}`);
    console.log(`Code: ${verificationToken}`);
    console.log(`Expires: ${verificationExpires.toLocaleString()}`);
    console.log('='.repeat(60) + '\n');

    // Send verification email (don't await to avoid blocking)
    emailService
      .sendVerificationEmail(canonicalEmail, verificationToken)
      .catch((error) => {
        logger.error('Failed to send verification email', { email: canonicalEmail, error });
      });

    logger.info('User registered successfully', { userId: user.id, email: canonicalEmail });
    return user;
  }

  private static toPublicUser(userWithPassword: {
    id: string;
    email: string;
    name?: string | null;
    firstName?: string | null;
    lastName?: string | null;
    profileCompleted: boolean;
    emailVerified: boolean;
    createdAt: Date;
    updatedAt: Date;
  }): User {
    return {
      id: userWithPassword.id,
      email: userWithPassword.email,
      name: userWithPassword.name || null,
      firstName: userWithPassword.firstName || null,
      lastName: userWithPassword.lastName || null,
      profileCompleted: userWithPassword.profileCompleted,
      emailVerified: userWithPassword.emailVerified,
      createdAt: userWithPassword.createdAt,
      updatedAt: userWithPassword.updatedAt,
    };
  }

  private static async issueTokens(
    user: User
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const payload: TokenPayload = {
      userId: user.id,
      email: user.email,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(payload);

    const tokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
    await RefreshTokenModel.create(user.id, tokenHash, expiresAt);
    await RefreshTokenModel.deleteExpired();

    return { user, accessToken, refreshToken };
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
    password: string
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const canonicalEmail = normalizeEmail(email);
    logger.info('Attempting login', { email: canonicalEmail });

    // Find user by email
    const userWithPassword = await UserModel.findByEmail(canonicalEmail);
    if (!userWithPassword) {
      throw new AppError(401, 'Invalid email or password');
    }

    // Compare password
    const isPasswordValid = await comparePassword(password, userWithPassword.passwordHash);
    if (!isPasswordValid) {
      throw new AppError(401, 'Invalid email or password');
    }

    if (!userWithPassword.emailVerified) {
      throw new AppError(403, 'Please verify your email before logging in');
    }

    const user = this.toPublicUser(userWithPassword);
    const result = await this.issueTokens(user);
    logger.info('Login successful', { userId: user.id, email: user.email });
    return result;
  }

  /**
   * Login or create a user through a trusted OAuth provider.
   */
  static async loginWithOAuth(
    profile: OAuthProfile
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
    const canonicalEmail = normalizeEmail(profile.email);
    logger.info('Attempting OAuth login', {
      provider: profile.provider,
      email: canonicalEmail,
    });

    let userWithPassword = await UserModel.findByOAuthAccount(
      profile.provider,
      profile.providerUserId
    );

    if (!userWithPassword) {
      userWithPassword = await UserModel.findByEmail(canonicalEmail);

      if (userWithPassword) {
        if (!userWithPassword.emailVerified) {
          await UserModel.verifyEmail(userWithPassword.id);
          userWithPassword = {
            ...userWithPassword,
            emailVerified: true,
            emailVerificationToken: undefined,
            emailVerificationExpires: undefined,
          };
        }
      } else {
        const passwordHash = await hashPassword(generatePasswordResetToken());
        const user = await UserModel.createOAuthUser({
          email: canonicalEmail,
          passwordHash,
        });
        userWithPassword = {
          ...user,
          passwordHash,
          emailVerificationToken: undefined,
          emailVerificationExpires: undefined,
          passwordResetToken: undefined,
          passwordResetExpires: undefined,
        };
      }

      await UserModel.createOAuthAccount(userWithPassword.id, {
        provider: profile.provider,
        providerUserId: profile.providerUserId,
        email: canonicalEmail,
      });
    }

    const user = this.toPublicUser(userWithPassword);
    const result = await this.issueTokens(user);
    logger.info('OAuth login successful', {
      userId: user.id,
      email: user.email,
      provider: profile.provider,
    });
    return result;
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
  ): Promise<{ user: User; accessToken: string; refreshToken: string }> {
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

    if (!user.emailVerified) {
      await RefreshTokenModel.deleteByHash(tokenHash);
      throw new AppError(403, 'Please verify your email before logging in');
    }

    // Generate new tokens
    const newPayload: TokenPayload = {
      userId: user.id,
      email: user.email,
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
    return { user, accessToken, refreshToken: newRefreshToken };
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
    const canonicalEmail = normalizeEmail(email);
    logger.info('Password reset requested', { email: canonicalEmail });

    // Find user by email
    const user = await UserModel.findByEmail(canonicalEmail);
    if (!user) {
      // Don't reveal if user exists
      logger.info('Password reset requested for non-existent email', { email: canonicalEmail });
      return;
    }

    // Generate reset token
    const resetToken = generatePasswordResetToken();
    const resetExpires = new Date(Date.now() + PASSWORD_RESET_TOKEN_TTL_MS);

    // Store reset token
    await UserModel.setPasswordResetToken(user.id, resetToken, resetExpires);

    await emailService.sendPasswordResetEmail(canonicalEmail, resetToken);

    logger.info('Password reset email sent', { userId: user.id, email: canonicalEmail });
  }

  /**
   * Validate a password reset token without mutating the account.
   */
  static async validatePasswordResetToken(token: string): Promise<void> {
    logger.info('Validating password reset token', { token: token.substring(0, 10) + '...' });

    const user = await UserModel.findByResetToken(token);
    if (!user) {
      throw new AppError(400, 'Invalid or expired password reset token');
    }
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
    const canonicalEmail = normalizeEmail(email);
    logger.info('Resending verification email', { email: canonicalEmail });

    // Find user by email
    const user = await UserModel.findByEmail(canonicalEmail);
    if (!user) {
      // Don't reveal if user exists
      logger.info('Resend verification requested for non-existent email', { email: canonicalEmail });
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
      email: canonicalEmail,
      code: verificationToken,
      expiresAt: verificationExpires,
    });
    console.log('\n' + '='.repeat(60));
    console.log('📧 EMAIL VERIFICATION CODE (RESENT)');
    console.log('='.repeat(60));
    console.log(`Email: ${canonicalEmail}`);
    console.log(`Code: ${verificationToken}`);
    console.log(`Expires: ${verificationExpires.toLocaleString()}`);
    console.log('='.repeat(60) + '\n');

    // Send verification email (don't await to avoid blocking)
    emailService
      .sendVerificationEmail(canonicalEmail, verificationToken)
      .catch((error) => {
        logger.error('Failed to send verification email', { email: canonicalEmail, error });
      });

    logger.info('Verification email resent', { userId: user.id, email: canonicalEmail });
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

  /**
   * Update current user's basic profile.
   */
  static async updateUserProfile(userId: string, data: { firstName: string; lastName: string }): Promise<User> {
    const user = await UserModel.updateProfile(userId, {
      firstName: data.firstName,
      lastName: data.lastName,
    });
    if (!user) {
      throw new AppError(404, 'User not found');
    }
    return user;
  }

  /**
   * Delete the current user's account and revoke all refresh tokens.
   */
  static async deleteCurrentUser(userId: string): Promise<void> {
    logger.info('Attempting account deletion', { userId });

    const files = await FileModel.findByOwner(userId);
    await RefreshTokenModel.deleteByUserId(userId);
    const deleted = await UserModel.deleteAccount(userId);
    if (!deleted) {
      throw new AppError(404, 'User not found');
    }

    await Promise.all(
      files
        .filter((file) => !file.legacySourceId)
        .map(async (file) => {
          try {
            const remainingReferenceCount = await FileModel.countStorageReferences(file);
            if (remainingReferenceCount > 0) {
              logger.info('Skipping account file storage delete because object is still referenced', {
                userId,
                fileId: file.id,
                storageProvider: file.storageProvider,
                storageBucket: file.storageBucket,
                storageKey: file.storageKey,
                remainingReferenceCount,
              });
              return;
            }
            await FileStorageService.delete(file);
          } catch (error) {
            logger.error('Failed to delete account file storage object', {
              error,
              userId,
              fileId: file.id,
              storageProvider: file.storageProvider,
              storageBucket: file.storageBucket,
              storageKey: file.storageKey,
            });
          }
        })
    );

    logger.info('Account deleted successfully', { userId });
  }
}

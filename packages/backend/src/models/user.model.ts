import { query, queryOne } from '../config/database';
import { User, UserRole, UserWithPassword } from '@humanly/shared';
import { PASSWORD_RESET_TOKEN_TTL_MS } from '../constants/auth';

export interface CreateUserData {
  email: string;
  passwordHash: string;
  role?: UserRole;
  emailVerificationToken: string;
  emailVerificationExpires: Date;
}

export interface OAuthAccountData {
  provider: string;
  providerUserId: string;
  email: string;
}

export class UserModel {
  /**
   * Create a new user
   */
  static async create(data: CreateUserData): Promise<User> {
    const sql = `
      INSERT INTO users (email, password_hash, role, email_verification_token, email_verification_expires)
      VALUES ($1, $2, $3, $4, $5)
      RETURNING id, email, role, email_verified as "emailVerified", created_at as "createdAt", updated_at as "updatedAt"
    `;
    const user = await queryOne<User>(sql, [
      data.email,
      data.passwordHash,
      data.role || 'user',
      data.emailVerificationToken,
      data.emailVerificationExpires,
    ]);
    if (!user) throw new Error('Failed to create user');
    return user;
  }

  /**
   * Create an email-verified user from a trusted OAuth provider.
   */
  static async createOAuthUser(data: {
    email: string;
    passwordHash: string;
    role?: UserRole;
  }): Promise<User> {
    const sql = `
      INSERT INTO users (email, password_hash, role, email_verified)
      VALUES ($1, $2, $3, TRUE)
      RETURNING id, email, role, email_verified as "emailVerified", created_at as "createdAt", updated_at as "updatedAt"
    `;
    const user = await queryOne<User>(sql, [
      data.email,
      data.passwordHash,
      data.role || 'user',
    ]);
    if (!user) throw new Error('Failed to create OAuth user');
    return user;
  }

  /**
   * Find user by email
   */
  static async findByEmail(email: string): Promise<UserWithPassword | null> {
    const sql = `
      SELECT id, email, role, password_hash, email_verified,
             email_verification_token, email_verification_expires,
             password_reset_token, password_reset_expires, password_reset_requested_at,
             created_at, updated_at
      FROM users
      WHERE email = $1
    `;
    const user = await queryOne<any>(sql, [email]);
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      passwordHash: user.password_hash,
      emailVerified: user.email_verified,
      emailVerificationToken: user.email_verification_token,
      emailVerificationExpires: user.email_verification_expires,
      passwordResetToken: user.password_reset_token,
      passwordResetExpires: user.password_reset_expires,
      passwordResetRequestedAt: user.password_reset_requested_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  /**
   * Find user by ID
   */
  static async findById(id: string): Promise<User | null> {
    const sql = `
      SELECT id, email, role, email_verified as "emailVerified", created_at as "createdAt", updated_at as "updatedAt"
      FROM users
      WHERE id = $1
    `;
    return queryOne<User>(sql, [id]);
  }

  /**
   * Find a Humanly user linked to an OAuth provider account.
   */
  static async findByOAuthAccount(
    provider: string,
    providerUserId: string
  ): Promise<UserWithPassword | null> {
    const sql = `
      SELECT u.id, u.email, u.role, u.password_hash, u.email_verified,
             u.email_verification_token, u.email_verification_expires,
             u.password_reset_token, u.password_reset_expires, u.password_reset_requested_at,
             u.created_at, u.updated_at
      FROM user_oauth_accounts oa
      JOIN users u ON u.id = oa.user_id
      WHERE oa.provider = $1
        AND oa.provider_user_id = $2
    `;
    const user = await queryOne<any>(sql, [provider, providerUserId]);
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      passwordHash: user.password_hash,
      emailVerified: user.email_verified,
      emailVerificationToken: user.email_verification_token,
      emailVerificationExpires: user.email_verification_expires,
      passwordResetToken: user.password_reset_token,
      passwordResetExpires: user.password_reset_expires,
      passwordResetRequestedAt: user.password_reset_requested_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  /**
   * Link a trusted OAuth identity to an existing Humanly user.
   */
  static async createOAuthAccount(
    userId: string,
    data: OAuthAccountData
  ): Promise<void> {
    const sql = `
      INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, email)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (provider, provider_user_id) DO NOTHING
    `;
    await query(sql, [userId, data.provider, data.providerUserId, data.email]);
  }

  /**
   * Find user by verification token
   */
  static async findByVerificationToken(token: string): Promise<UserWithPassword | null> {
    const sql = `
      SELECT id, email, role, password_hash, email_verified,
             email_verification_token, email_verification_expires,
             created_at, updated_at
      FROM users
      WHERE email_verification_token = $1
        AND email_verification_expires > NOW()
    `;
    const user = await queryOne<any>(sql, [token]);
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      passwordHash: user.password_hash,
      emailVerified: user.email_verified,
      emailVerificationToken: user.email_verification_token,
      emailVerificationExpires: user.email_verification_expires,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  /**
   * Find user by password reset token
   */
  static async findByResetToken(token: string): Promise<UserWithPassword | null> {
    const sql = `
      SELECT id, email, role, password_hash, email_verified,
             password_reset_token, password_reset_expires, password_reset_requested_at,
             created_at, updated_at
      FROM users
      WHERE password_reset_token = $1
        AND password_reset_expires > NOW()
        AND password_reset_requested_at IS NOT NULL
        AND password_reset_requested_at > NOW() - ($2::int * INTERVAL '1 millisecond')
    `;
    const user = await queryOne<any>(sql, [token, PASSWORD_RESET_TOKEN_TTL_MS]);
    if (!user) return null;

    return {
      id: user.id,
      email: user.email,
      role: user.role,
      passwordHash: user.password_hash,
      emailVerified: user.email_verified,
      passwordResetToken: user.password_reset_token,
      passwordResetExpires: user.password_reset_expires,
      passwordResetRequestedAt: user.password_reset_requested_at,
      createdAt: user.created_at,
      updatedAt: user.updated_at,
    };
  }

  /**
   * Verify user email
   */
  static async verifyEmail(id: string): Promise<void> {
    const sql = `
      UPDATE users
      SET email_verified = TRUE,
          email_verification_token = NULL,
          email_verification_expires = NULL
      WHERE id = $1
    `;
    await query(sql, [id]);
  }

  /**
   * Set password reset token
   */
  static async setPasswordResetToken(
    id: string,
    token: string,
    expires: Date
  ): Promise<void> {
    const sql = `
      UPDATE users
      SET password_reset_token = $1,
          password_reset_expires = $2,
          password_reset_requested_at = NOW()
      WHERE id = $3
    `;
    await query(sql, [token, expires, id]);
  }

  /**
   * Reset password
   */
  static async resetPassword(id: string, passwordHash: string): Promise<void> {
    const sql = `
      UPDATE users
      SET password_hash = $1,
          password_reset_token = NULL,
          password_reset_expires = NULL,
          password_reset_requested_at = NULL
      WHERE id = $2
    `;
    await query(sql, [passwordHash, id]);
  }

  /**
   * Update password
   */
  static async updatePassword(id: string, passwordHash: string): Promise<void> {
    const sql = `
      UPDATE users
      SET password_hash = $1
      WHERE id = $2
    `;
    await query(sql, [passwordHash, id]);
  }

  /**
   * Update verification token (for resending verification email)
   */
  static async updateVerificationToken(
    id: string,
    token: string,
    expires: Date
  ): Promise<void> {
    const sql = `
      UPDATE users
      SET email_verification_token = $1,
          email_verification_expires = $2
      WHERE id = $3
    `;
    await query(sql, [token, expires, id]);
  }

  /**
   * Delete user
   */
  static async delete(id: string): Promise<void> {
    const sql = 'DELETE FROM users WHERE id = $1';
    await query(sql, [id]);
  }
}

import { query, queryOne, transaction } from '../config/database';
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

export interface UpdateUserProfileData {
  name: string;
}

export class UserModel {
  /**
   * Create a new user
   */
  static async create(data: CreateUserData): Promise<User> {
    const sql = `
      INSERT INTO users (email, password_hash, role, email_verification_token, email_verification_expires, profile_completed)
      VALUES ($1, $2, $3, $4, $5, FALSE)
      RETURNING id, email, role, name, profile_completed as "profileCompleted",
                email_verified as "emailVerified", created_at as "createdAt", updated_at as "updatedAt"
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
      INSERT INTO users (email, password_hash, role, email_verified, profile_completed)
      VALUES ($1, $2, $3, TRUE, FALSE)
      RETURNING id, email, role, name, profile_completed as "profileCompleted",
                email_verified as "emailVerified", created_at as "createdAt", updated_at as "updatedAt"
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
             name, profile_completed,
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
      name: user.name,
      profileCompleted: user.profile_completed,
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
      SELECT id, email, role, name, profile_completed as "profileCompleted",
             email_verified as "emailVerified", created_at as "createdAt", updated_at as "updatedAt"
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
             u.name, u.profile_completed,
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
      name: user.name,
      profileCompleted: user.profile_completed,
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
             name, profile_completed,
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
      name: user.name,
      profileCompleted: user.profile_completed,
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
             name, profile_completed,
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
      name: user.name,
      profileCompleted: user.profile_completed,
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
   * Update editable user profile fields.
   */
  static async updateProfile(id: string, data: UpdateUserProfileData): Promise<User | null> {
    const sql = `
      UPDATE users
      SET name = $1,
          profile_completed = TRUE
      WHERE id = $2
      RETURNING id, email, role, name, profile_completed as "profileCompleted",
                email_verified as "emailVerified", created_at as "createdAt", updated_at as "updatedAt"
    `;
    return queryOne<User>(sql, [data.name, id]);
  }

  /**
   * Delete a user account and rows that are not covered by current FK cascades.
   */
  static async deleteAccount(id: string): Promise<boolean> {
    return transaction(async (client) => {
      const ownedTasks = 'SELECT id FROM tasks WHERE user_id = $1';
      const ownedDocuments = 'SELECT id FROM documents WHERE user_id = $1';
      const affectedSubmissions = `
        SELECT id FROM submissions
        WHERE user_id = $1
           OR task_id IN (${ownedTasks})
           OR document_id IN (${ownedDocuments})
      `;

      await client.query('DELETE FROM paper_access_logs WHERE reviewer_id = $1', [id]);
      await client.query('DELETE FROM review_recordings WHERE reviewer_id = $1', [id]);
      await client.query('DELETE FROM review_ai_interaction_logs WHERE reviewer_id = $1', [id]);
      await client.query('DELETE FROM review_ai_sessions WHERE reviewer_id = $1', [id]);
      await client.query('DELETE FROM review_comments WHERE reviewer_id = $1', [id]);
      await client.query('DELETE FROM review_events WHERE reviewer_id = $1', [id]);
      await client.query('DELETE FROM reviews WHERE reviewer_id = $1', [id]);
      await client.query('DELETE FROM paper_reviewers WHERE reviewer_id = $1 OR assigned_by = $1', [id]);
      await client.query('DELETE FROM papers WHERE uploaded_by = $1', [id]);

      await client.query(`
        UPDATE submissions
        SET certificate_id = NULL
        WHERE id IN (${affectedSubmissions})
      `, [id]);
      await client.query(`
        UPDATE certificates
        SET submission_id = NULL
        WHERE user_id = $1
           OR document_id IN (${ownedDocuments})
           OR submission_id IN (${affectedSubmissions})
      `, [id]);
      await client.query(`
        DELETE FROM certificates
        WHERE user_id = $1
           OR document_id IN (${ownedDocuments})
           OR submission_id IN (${affectedSubmissions})
      `, [id]);
      await client.query(`
        DELETE FROM submissions
        WHERE id IN (${affectedSubmissions})
      `, [id]);
      await client.query(`
        DELETE FROM task_enrollments
        WHERE user_id = $1
           OR task_id IN (${ownedTasks})
      `, [id]);
      await client.query('DELETE FROM ai_chat_attachments WHERE user_id = $1', [id]);
      await client.query('DELETE FROM ai_interaction_logs WHERE user_id = $1', [id]);
      await client.query('DELETE FROM ai_chat_sessions WHERE user_id = $1', [id]);
      await client.query('DELETE FROM ai_selection_actions WHERE user_id = $1', [id]);
      await client.query('DELETE FROM user_ai_settings WHERE user_id = $1', [id]);
      await client.query('DELETE FROM user_oauth_accounts WHERE user_id = $1', [id]);
      await client.query(`
        DELETE FROM document_events
        WHERE user_id = $1
           OR document_id IN (${ownedDocuments})
      `, [id]);
      await client.query(`
        DELETE FROM files
        WHERE owner_user_id = $1
           OR document_id IN (${ownedDocuments})
           OR task_id IN (${ownedTasks})
      `, [id]);
      await client.query('DELETE FROM documents WHERE user_id = $1', [id]);
      await client.query('DELETE FROM tasks WHERE user_id = $1', [id]);

      const result = await client.query('DELETE FROM users WHERE id = $1', [id]);
      return result.rowCount > 0;
    });
  }
}

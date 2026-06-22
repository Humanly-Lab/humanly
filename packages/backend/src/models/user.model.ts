import { query, queryOne, transaction } from '../config/database';
import { normalizeEmail, User, UserWithPassword } from '@humanly/shared';
import { PASSWORD_RESET_TOKEN_TTL_MS } from '../constants/auth';

const USER_SELECT = `
  id,
  email,
  name,
  first_name as "firstName",
  last_name as "lastName",
  profile_completed as "profileCompleted",
  email_verified as "emailVerified",
  created_at as "createdAt",
  updated_at as "updatedAt"
`;

const USER_WITH_PASSWORD_SELECT = `
  ${USER_SELECT},
  password_hash as "passwordHash",
  email_verification_token as "emailVerificationToken",
  email_verification_expires as "emailVerificationExpires",
  password_reset_token as "passwordResetToken",
  password_reset_expires as "passwordResetExpires",
  password_reset_requested_at as "passwordResetRequestedAt"
`;

export interface CreateUserData {
  email: string;
  passwordHash: string;
  firstName?: string | null;
  lastName?: string | null;
  emailVerificationToken: string;
  emailVerificationExpires: Date;
}

export interface OAuthAccountData {
  provider: string;
  providerUserId: string;
  email: string;
}

export interface UpdateUserProfileData {
  firstName: string;
  lastName: string;
}

function getFullName(firstName: string, lastName: string): string {
  return `${firstName.trim()} ${lastName.trim()}`.trim();
}

export class UserModel {
  /**
   * Create a new user
   */
  static async create(data: CreateUserData): Promise<User> {
    const email = normalizeEmail(data.email);
    const firstName = data.firstName?.trim() || null;
    const lastName = data.lastName?.trim() || null;
    const profileCompleted = firstName !== null && lastName !== null;
    const name = profileCompleted ? getFullName(firstName, lastName) : null;
    const sql = `
      INSERT INTO users (
        email,
        password_hash,
        name,
        first_name,
        last_name,
        email_verification_token,
        email_verification_expires,
        profile_completed
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
      RETURNING ${USER_SELECT}
    `;
    const user = await queryOne<User>(sql, [
      email,
      data.passwordHash,
      name,
      firstName,
      lastName,
      data.emailVerificationToken,
      data.emailVerificationExpires,
      profileCompleted,
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
  }): Promise<User> {
    const email = normalizeEmail(data.email);
    const sql = `
      INSERT INTO users (email, password_hash, email_verified, profile_completed)
      VALUES ($1, $2, TRUE, FALSE)
      RETURNING ${USER_SELECT}
    `;
    const user = await queryOne<User>(sql, [
      email,
      data.passwordHash,
    ]);
    if (!user) throw new Error('Failed to create OAuth user');
    return user;
  }

  /**
   * Find user by email
   */
  static async findByEmail(email: string): Promise<UserWithPassword | null> {
    const canonicalEmail = normalizeEmail(email);
    const sql = `
      SELECT ${USER_WITH_PASSWORD_SELECT}
      FROM users
      WHERE lower(trim(email)) = $1
      ORDER BY created_at ASC
      LIMIT 1
    `;
    return queryOne<UserWithPassword>(sql, [canonicalEmail]);
  }

  /**
   * Find user by ID
   */
  static async findById(id: string): Promise<User | null> {
    const sql = `
      SELECT ${USER_SELECT}
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
      SELECT
        u.id,
        u.email,
        u.name,
        u.first_name as "firstName",
        u.last_name as "lastName",
        u.profile_completed as "profileCompleted",
        u.email_verified as "emailVerified",
        u.created_at as "createdAt",
        u.updated_at as "updatedAt",
        u.password_hash as "passwordHash",
        u.email_verification_token as "emailVerificationToken",
        u.email_verification_expires as "emailVerificationExpires",
        u.password_reset_token as "passwordResetToken",
        u.password_reset_expires as "passwordResetExpires",
        u.password_reset_requested_at as "passwordResetRequestedAt"
      FROM user_oauth_accounts oa
      JOIN users u ON u.id = oa.user_id
      WHERE oa.provider = $1
        AND oa.provider_user_id = $2
    `;
    return queryOne<UserWithPassword>(sql, [provider, providerUserId]);
  }

  /**
   * Link a trusted OAuth identity to an existing Humanly user.
   */
  static async createOAuthAccount(
    userId: string,
    data: OAuthAccountData
  ): Promise<void> {
    const email = normalizeEmail(data.email);
    const sql = `
      INSERT INTO user_oauth_accounts (user_id, provider, provider_user_id, email)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (provider, provider_user_id) DO NOTHING
    `;
    await query(sql, [userId, data.provider, data.providerUserId, email]);
  }

  /**
   * Find user by verification token
   */
  static async findByVerificationToken(token: string): Promise<UserWithPassword | null> {
    const sql = `
      SELECT ${USER_WITH_PASSWORD_SELECT}
      FROM users
      WHERE email_verification_token = $1
        AND email_verification_expires > NOW()
    `;
    return queryOne<UserWithPassword>(sql, [token]);
  }

  /**
   * Find user by password reset token
   */
  static async findByResetToken(token: string): Promise<UserWithPassword | null> {
    const sql = `
      SELECT ${USER_WITH_PASSWORD_SELECT}
      FROM users
      WHERE password_reset_token = $1
        AND password_reset_expires > NOW()
        AND password_reset_requested_at IS NOT NULL
        AND password_reset_requested_at > NOW() - ($2::int * INTERVAL '1 millisecond')
    `;
    return queryOne<UserWithPassword>(sql, [token, PASSWORD_RESET_TOKEN_TTL_MS]);
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
    const firstName = data.firstName.trim();
    const lastName = data.lastName.trim();
    const name = getFullName(firstName, lastName);
    const sql = `
      UPDATE users
      SET name = $1,
          first_name = $2,
          last_name = $3,
          profile_completed = TRUE
      WHERE id = $4
      RETURNING ${USER_SELECT}
    `;
    return queryOne<User>(sql, [name, firstName, lastName, id]);
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
      const deleteIfTableExists = async (tableName: string, sql: string) => {
        const table = await client.query('SELECT to_regclass($1) AS "tableName"', [`public.${tableName}`]);
        if (table.rows?.[0]?.tableName) {
          await client.query(sql, [id]);
        }
      };

      await deleteIfTableExists('paper_access_logs', 'DELETE FROM paper_access_logs WHERE reviewer_id = $1');
      await deleteIfTableExists('review_recordings', 'DELETE FROM review_recordings WHERE reviewer_id = $1');
      await deleteIfTableExists('review_ai_interaction_logs', 'DELETE FROM review_ai_interaction_logs WHERE reviewer_id = $1');
      await deleteIfTableExists('review_ai_sessions', 'DELETE FROM review_ai_sessions WHERE reviewer_id = $1');
      await deleteIfTableExists('review_comments', 'DELETE FROM review_comments WHERE reviewer_id = $1');
      await deleteIfTableExists('review_events', 'DELETE FROM review_events WHERE reviewer_id = $1');
      await deleteIfTableExists('reviews', 'DELETE FROM reviews WHERE reviewer_id = $1');
      await deleteIfTableExists('paper_reviewers', 'DELETE FROM paper_reviewers WHERE reviewer_id = $1 OR assigned_by = $1');
      await deleteIfTableExists('papers', 'DELETE FROM papers WHERE uploaded_by = $1');

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

import crypto from 'crypto';
import bcrypt from 'bcrypt';

const BCRYPT_ROUNDS = 12;

/**
 * Hash a password using bcrypt
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_ROUNDS);
}

/**
 * Compare a password with a hash
 */
export async function comparePassword(
  password: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(password, hash);
}

/**
 * Generate a random token (hex string)
 */
export function generateToken(bytes: number = 32): string {
  return crypto.randomBytes(bytes).toString('hex');
}

/**
 * Generate a task token (64 characters)
 */
export function generateTaskToken(): string {
  return generateToken(32); // 32 bytes = 64 hex characters
}

/**
 * Generate an email verification token (6-digit code)
 */
export function generateVerificationToken(): string {
  // Generate a random 6-digit code
  return Math.floor(100000 + Math.random() * 900000).toString();
}

/**
 * Generate a password reset token
 */
export function generatePasswordResetToken(): string {
  return generateToken(32);
}

/**
 * Hash a token for storage (for refresh tokens)
 */
export function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Generate a random string for session IDs
 */
export function generateSessionId(): string {
  return generateToken(16); // 16 bytes = 32 hex characters
}

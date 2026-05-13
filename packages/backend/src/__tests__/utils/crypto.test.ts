import {
  hashPassword,
  comparePassword,
  generateToken,
  generateTaskToken,
  generateVerificationToken,
  generatePasswordResetToken,
  hashToken,
  generateSessionId,
} from '../../utils/crypto';

describe('crypto utils', () => {
  // ── hashPassword / comparePassword ──────────────────────────────────────────

  describe('hashPassword', () => {
    it('returns a bcrypt hash string', async () => {
      const hash = await hashPassword('mypassword');
      expect(hash).toMatch(/^\$2b\$\d+\$/);
    });

    it('produces a different hash each call (salted)', async () => {
      const hash1 = await hashPassword('same');
      const hash2 = await hashPassword('same');
      expect(hash1).not.toBe(hash2);
    });
  });

  describe('comparePassword', () => {
    it('returns true for matching password', async () => {
      const hash = await hashPassword('correct');
      expect(await comparePassword('correct', hash)).toBe(true);
    });

    it('returns false for wrong password', async () => {
      const hash = await hashPassword('correct');
      expect(await comparePassword('wrong', hash)).toBe(false);
    });
  });

  // ── generateToken ────────────────────────────────────────────────────────────

  describe('generateToken', () => {
    it('returns a hex string of default length (64 chars = 32 bytes)', () => {
      const token = generateToken();
      expect(token).toMatch(/^[0-9a-f]{64}$/);
    });

    it('respects custom byte length', () => {
      const token = generateToken(16);
      expect(token).toHaveLength(32); // 16 bytes → 32 hex chars
    });

    it('generates unique values each call', () => {
      expect(generateToken()).not.toBe(generateToken());
    });
  });

  // ── generateTaskToken ─────────────────────────────────────────────────────

  describe('generateTaskToken', () => {
    it('returns a 64-character hex string', () => {
      expect(generateTaskToken()).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ── generateVerificationToken ────────────────────────────────────────────────

  describe('generateVerificationToken', () => {
    it('returns a 6-digit numeric string', () => {
      const code = generateVerificationToken();
      expect(code).toMatch(/^\d{6}$/);
    });

    it('is between 100000 and 999999', () => {
      for (let i = 0; i < 20; i++) {
        const n = parseInt(generateVerificationToken(), 10);
        expect(n).toBeGreaterThanOrEqual(100000);
        expect(n).toBeLessThanOrEqual(999999);
      }
    });
  });

  // ── generatePasswordResetToken ───────────────────────────────────────────────

  describe('generatePasswordResetToken', () => {
    it('returns a 64-character hex string', () => {
      expect(generatePasswordResetToken()).toMatch(/^[0-9a-f]{64}$/);
    });
  });

  // ── hashToken ────────────────────────────────────────────────────────────────

  describe('hashToken', () => {
    it('returns a 64-character SHA-256 hex digest', () => {
      expect(hashToken('anytoken')).toMatch(/^[0-9a-f]{64}$/);
    });

    it('is deterministic', () => {
      expect(hashToken('abc')).toBe(hashToken('abc'));
    });

    it('different inputs produce different hashes', () => {
      expect(hashToken('a')).not.toBe(hashToken('b'));
    });
  });

  // ── generateSessionId ────────────────────────────────────────────────────────

  describe('generateSessionId', () => {
    it('returns a 32-character hex string (16 bytes)', () => {
      expect(generateSessionId()).toMatch(/^[0-9a-f]{32}$/);
    });
  });
});

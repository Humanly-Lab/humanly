import jwt from 'jsonwebtoken';
import {
  generateAccessToken,
  generateRefreshToken,
  verifyToken,
  decodeToken,
  TokenPayload,
} from '../../utils/jwt';

const payload: TokenPayload = { userId: 'user-123', email: 'user@example.com' };

describe('jwt utils', () => {
  // ── generateAccessToken ──────────────────────────────────────────────────────

  describe('generateAccessToken', () => {
    it('returns a JWT string', () => {
      const token = generateAccessToken(payload);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('encodes userId and email in payload', () => {
      const token = generateAccessToken(payload);
      const decoded = jwt.decode(token) as TokenPayload;
      expect(decoded.userId).toBe(payload.userId);
      expect(decoded.email).toBe(payload.email);
      expect(decoded).not.toHaveProperty('role');
    });
  });

  // ── generateRefreshToken ─────────────────────────────────────────────────────

  describe('generateRefreshToken', () => {
    it('returns a JWT string', () => {
      const token = generateRefreshToken(payload);
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);
    });

    it('access and refresh tokens are different', () => {
      // Different expiry means different tokens even for same payload
      const access = generateAccessToken(payload);
      const refresh = generateRefreshToken(payload);
      expect(access).not.toBe(refresh);
    });
  });

  // ── verifyToken ──────────────────────────────────────────────────────────────

  describe('verifyToken', () => {
    it('returns the original payload for a valid token', () => {
      const token = generateAccessToken(payload);
      const result = verifyToken(token);
      expect(result.userId).toBe(payload.userId);
      expect(result.email).toBe(payload.email);
    });

    it('throws a JsonWebTokenError for a tampered token', () => {
      const token = generateAccessToken(payload);
      const tampered = token.slice(0, -5) + 'XXXXX';
      expect(() => verifyToken(tampered)).toThrow(jwt.JsonWebTokenError);
    });

    it('throws a JsonWebTokenError for a token signed with a different secret', () => {
      const bad = jwt.sign(payload, 'wrong-secret', { expiresIn: '1h' });
      expect(() => verifyToken(bad)).toThrow(jwt.JsonWebTokenError);
    });

    it('throws a TokenExpiredError for an expired token', () => {
      const expired = jwt.sign(payload, process.env.JWT_SECRET!, { expiresIn: -1 });
      expect(() => verifyToken(expired)).toThrow(jwt.TokenExpiredError);
    });
  });

  // ── decodeToken ──────────────────────────────────────────────────────────────

  describe('decodeToken', () => {
    it('returns payload for a valid token without verifying signature', () => {
      const token = generateAccessToken(payload);
      const result = decodeToken(token);
      expect(result).not.toBeNull();
      expect(result!.userId).toBe(payload.userId);
    });

    it('returns null for a completely invalid string', () => {
      expect(decodeToken('not.a.token')).toBeNull();
    });
  });
});

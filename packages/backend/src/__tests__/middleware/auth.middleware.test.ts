import { Request, Response, NextFunction } from 'express';
import { authenticate, requireAuth, optionalAuth } from '../../middleware/auth.middleware';
import { generateAccessToken } from '../../utils/jwt';
import { AppError } from '../../middleware/error-handler';

jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

const validPayload = { userId: 'u-1', email: 'alice@example.com' };

function makeReq(overrides: Partial<Request> = {}): Request {
  return {
    headers: {},
    cookies: {},
    ...overrides,
  } as unknown as Request;
}

function makeRes(): Response {
  return {} as Response;
}

// ── authenticate ──────────────────────────────────────────────────────────────

describe('authenticate', () => {
  it('attaches user to req and calls next for valid Bearer token', () => {
    const token = generateAccessToken(validPayload);
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const next: NextFunction = jest.fn();
    authenticate(req, makeRes(), next);
    expect(req.user).toMatchObject(validPayload);
    expect(next).toHaveBeenCalledWith(/* no args */);
  });

  it('attaches user from cookie when no Authorization header', () => {
    const token = generateAccessToken(validPayload);
    const req = makeReq({ headers: {}, cookies: { accessToken: token } });
    const next: NextFunction = jest.fn();
    authenticate(req, makeRes(), next);
    expect(req.user?.userId).toBe('u-1');
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next with AppError(401) when no token present', () => {
    const req = makeReq();
    const next: NextFunction = jest.fn();
    authenticate(req, makeRes(), next);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it('calls next with AppError(401) for invalid token', () => {
    const req = makeReq({ headers: { authorization: 'Bearer bad.token.here' } });
    const next: NextFunction = jest.fn();
    authenticate(req, makeRes(), next);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });

  it('calls next with AppError(401) for expired token', () => {
    const jwt = require('jsonwebtoken');
    const expired = jwt.sign(validPayload, process.env.JWT_SECRET!, { expiresIn: -1 });
    const req = makeReq({ headers: { authorization: `Bearer ${expired}` } });
    const next: NextFunction = jest.fn();
    authenticate(req, makeRes(), next);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });
});

// ── requireAuth ───────────────────────────────────────────────────────────────

describe('requireAuth', () => {
  it('calls next with no args when req.user is set', () => {
    const req = makeReq({ user: validPayload } as any);
    const next: NextFunction = jest.fn();
    requireAuth(req, makeRes(), next);
    expect(next).toHaveBeenCalledWith();
  });

  it('calls next with AppError(401) when req.user is absent', () => {
    const req = makeReq();
    const next: NextFunction = jest.fn();
    requireAuth(req, makeRes(), next);
    const err = (next as jest.Mock).mock.calls[0][0];
    expect(err).toBeInstanceOf(AppError);
    expect(err.statusCode).toBe(401);
  });
});

// ── optionalAuth ──────────────────────────────────────────────────────────────

describe('optionalAuth', () => {
  it('attaches user when valid token is present', () => {
    const token = generateAccessToken(validPayload);
    const req = makeReq({ headers: { authorization: `Bearer ${token}` } });
    const next: NextFunction = jest.fn();
    optionalAuth(req, makeRes(), next);
    expect(req.user?.userId).toBe('u-1');
    expect(next).toHaveBeenCalledWith();
  });

  it('still calls next (without error) when no token is present', () => {
    const req = makeReq();
    const next: NextFunction = jest.fn();
    optionalAuth(req, makeRes(), next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });

  it('still calls next (without error) for an invalid token', () => {
    const req = makeReq({ headers: { authorization: 'Bearer garbage' } });
    const next: NextFunction = jest.fn();
    optionalAuth(req, makeRes(), next);
    expect(req.user).toBeUndefined();
    expect(next).toHaveBeenCalledWith();
  });
});

import { Request, Response, NextFunction } from 'express';
import { ZodError, z } from 'zod';
import { AppError, errorHandler, asyncHandler } from '../../middleware/error-handler';

// Silence logger output during tests
jest.mock('../../utils/logger', () => ({
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() },
}));

// Minimal mock helpers
function mockRes() {
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return res;
}

function mockReq(overrides: Partial<Request> = {}): Request {
  return { path: '/test', method: 'GET', ...overrides } as Request;
}

const next: NextFunction = jest.fn();

// ── AppError ─────────────────────────────────────────────────────────────────

describe('AppError', () => {
  it('extends Error with statusCode', () => {
    const err = new AppError(404, 'Not found');
    expect(err).toBeInstanceOf(Error);
    expect(err.statusCode).toBe(404);
    expect(err.message).toBe('Not found');
    expect(err.isOperational).toBe(true);
  });

  it('accepts custom isOperational flag', () => {
    const err = new AppError(500, 'Crash', false);
    expect(err.isOperational).toBe(false);
  });

  it('instanceof check works correctly (prototype chain fix)', () => {
    const err = new AppError(400, 'Bad');
    expect(err instanceof AppError).toBe(true);
  });
});

// ── errorHandler ─────────────────────────────────────────────────────────────

describe('errorHandler', () => {
  it('responds 400 with validation details for ZodError', () => {
    const schema = z.object({ name: z.string() });
    let zodErr!: ZodError;
    try { schema.parse({ name: 123 }); } catch (e) { zodErr = e as ZodError; }

    const res = mockRes();
    errorHandler(zodErr, mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.details).toBeDefined();
  });

  it('responds with AppError statusCode and message', () => {
    const err = new AppError(403, 'Forbidden');
    const res = mockRes();
    errorHandler(err, mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(403);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.success).toBe(false);
    expect(body.message).toBe('Forbidden');
  });

  it('responds 401 for JsonWebTokenError', () => {
    const err = Object.assign(new Error('jwt malformed'), { name: 'JsonWebTokenError' });
    const res = mockRes();
    errorHandler(err, mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('responds 401 for TokenExpiredError', () => {
    const err = Object.assign(new Error('jwt expired'), { name: 'TokenExpiredError' });
    const res = mockRes();
    errorHandler(err, mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('responds 409 for duplicate key database error', () => {
    const err = new Error('duplicate key value violates unique constraint');
    const res = mockRes();
    errorHandler(err, mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(409);
  });

  it('responds 400 for malformed JSON body-parser errors', () => {
    const err = Object.assign(new SyntaxError('Unexpected token b in JSON'), {
      status: 400,
      type: 'entity.parse.failed',
    });
    const res = mockRes();
    errorHandler(err, mockReq({ method: 'POST' }), res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe('Invalid JSON');
  });

  it('responds 400 for invalid PostgreSQL UUID input', () => {
    const err = Object.assign(new Error('invalid input syntax for type uuid'), {
      code: '22P02',
    });
    const res = mockRes();
    errorHandler(err, mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toBe('Invalid identifier format');
  });

  it('responds 500 for unknown errors', () => {
    const err = new Error('something unexpected');
    const res = mockRes();
    errorHandler(err, mockReq(), res, next);
    expect(res.status).toHaveBeenCalledWith(500);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.success).toBe(false);
  });
});

// ── asyncHandler ─────────────────────────────────────────────────────────────

describe('asyncHandler', () => {
  it('calls next with error when async handler rejects', async () => {
    const err = new AppError(500, 'Async boom');
    const handler = asyncHandler(async () => { throw err; });
    const mockNext = jest.fn();
    handler(mockReq(), mockRes(), mockNext);
    // Give microtask queue time to flush
    await new Promise(r => setImmediate(r));
    expect(mockNext).toHaveBeenCalledWith(err);
  });

  it('does not call next when handler resolves normally', async () => {
    const handler = asyncHandler(async (_req, res) => {
      res.json({ ok: true });
    });
    const res = mockRes();
    const mockNext = jest.fn();
    handler(mockReq(), res, mockNext);
    await new Promise(r => setImmediate(r));
    expect(mockNext).not.toHaveBeenCalled();
  });
});

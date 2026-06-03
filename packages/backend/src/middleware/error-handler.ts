import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import { logger } from '../utils/logger';

export class AppError extends Error {
  constructor(
    public statusCode: number,
    public message: string,
    public isOperational: boolean = true
  ) {
    super(message);
    Object.setPrototypeOf(this, AppError.prototype);
  }
}

export function errorHandler(
  error: Error | AppError | ZodError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const errorWithMeta = error as Error & {
    code?: string;
    status?: number;
    statusCode?: number;
    type?: string;
  };

  // Log error
  logger.error('Error occurred', {
    error: error.message,
    stack: error.stack,
    path: req.path,
    method: req.method,
  });

  // Handle Zod validation errors
  if (error instanceof ZodError) {
    res.status(400).json({
      success: false,
      error: 'Validation error',
      message: 'Invalid request data',
      details: error.errors.map((err) => ({
        field: err.path.join('.'),
        message: err.message,
      })),
    });
    return;
  }

  // Handle malformed JSON bodies produced by express.json/body-parser.
  if (
    errorWithMeta.type === 'entity.parse.failed' ||
    (error instanceof SyntaxError && errorWithMeta.status === 400)
  ) {
    res.status(400).json({
      success: false,
      error: 'Invalid JSON',
      message: 'Request body contains malformed JSON',
    });
    return;
  }

  // Handle custom AppError
  if (error instanceof AppError) {
    res.status(error.statusCode).json({
      success: false,
      error: error.message,
      message: error.message,
    });
    return;
  }

  // Handle JWT errors
  if (error.name === 'JsonWebTokenError') {
    res.status(401).json({
      success: false,
      error: 'Invalid token',
      message: 'Authentication token is invalid',
    });
    return;
  }

  if (error.name === 'TokenExpiredError') {
    res.status(401).json({
      success: false,
      error: 'Token expired',
      message: 'Authentication token has expired',
    });
    return;
  }

  // Handle PostgreSQL invalid_text_representation, commonly raised by invalid UUID params.
  if (errorWithMeta.code === '22P02') {
    res.status(400).json({
      success: false,
      error: 'Invalid identifier format',
      message: 'One or more identifiers are malformed',
    });
    return;
  }

  // Handle database errors
  if (error.message.includes('duplicate key')) {
    res.status(409).json({
      success: false,
      error: 'Duplicate entry',
      message: 'A record with this information already exists',
    });
    return;
  }

  // Default error response
  res.status(500).json({
    success: false,
    error: 'Internal server error',
    message: 'An unexpected error occurred',
  });
}

// Async error handler wrapper
export function asyncHandler(
  fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

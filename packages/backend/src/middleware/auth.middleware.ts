import { Request, Response, NextFunction } from 'express';
import { verifyToken, TokenPayload } from '../utils/jwt';
import { AppError } from './error-handler';
import { logger } from '../utils/logger';

// Extend Express Request type to include user
declare global {
  namespace Express {
    interface Request {
      user?: TokenPayload;
    }
  }
}

/**
 * Middleware to authenticate requests using JWT
 * Checks for token in Authorization header or cookies
 */
export function authenticate(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Try to get token from Authorization header
    let token: string | undefined;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // If not in header, try cookies
    if (!token && req.cookies) {
      token = req.cookies.accessToken;
    }

    if (!token) {
      throw new AppError(401, 'Authentication required');
    }

    // Verify token
    const payload = verifyToken(token);

    // Attach user to request
    req.user = payload;

    logger.debug('User authenticated', { userId: payload.userId, email: payload.email });
    next();
  } catch (error) {
    if (error instanceof AppError) {
      next(error);
    } else if (error instanceof Error) {
      if (error.message === 'Invalid or expired token') {
        next(new AppError(401, 'Invalid or expired authentication token'));
      } else {
        next(new AppError(401, 'Authentication failed'));
      }
    } else {
      next(new AppError(401, 'Authentication failed'));
    }
  }
}

/**
 * Middleware to require authentication
 * This is a convenience wrapper around authenticate that throws if user is not authenticated
 */
export function requireAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  if (!req.user) {
    return next(new AppError(401, 'Authentication required'));
  }
  next();
}

/**
 * Middleware to require one of the provided authenticated user roles.
 */
export function requireRole(...allowedRoles: Array<NonNullable<TokenPayload['role']>>) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      return next(new AppError(401, 'Authentication required'));
    }

    if (!req.user.role || !allowedRoles.includes(req.user.role)) {
      return next(new AppError(403, 'Insufficient permissions'));
    }

    next();
  };
}

/**
 * Optional authentication middleware
 * Attaches user to request if token is valid, but doesn't fail if missing
 */
export function optionalAuth(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  try {
    // Try to get token from Authorization header
    let token: string | undefined;
    const authHeader = req.headers.authorization;

    if (authHeader && authHeader.startsWith('Bearer ')) {
      token = authHeader.substring(7);
    }

    // If not in header, try cookies
    if (!token && req.cookies) {
      token = req.cookies.accessToken;
    }

    // If token exists, try to verify it
    if (token) {
      const payload = verifyToken(token);
      req.user = payload;
      logger.debug('User authenticated (optional)', { userId: payload.userId });
    }

    next();
  } catch (error) {
    // For optional auth, we don't fail on invalid token
    logger.debug('Optional auth failed, continuing without user');
    next();
  }
}

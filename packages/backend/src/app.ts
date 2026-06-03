import express, { Express, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import { env } from './config/env';
import { logger } from './utils/logger';

// Middleware
import { errorHandler } from './middleware/error-handler';

// Routes
import authRoutes from './routes/auth.routes';
import taskRoutes from './routes/tasks.routes';
import trackingRoutes from './routes/events.routes';
import exportRoutes from './routes/export.routes';
import analyticsRoutes from './routes/analytics.routes';
import trackerRoutes from './routes/tracker.routes';
import documentRoutes from './routes/documents.routes';
import certificateRoutes from './routes/certificates.routes';
import aiRoutes from './routes/ai.routes';
import fileRoutes from './routes/files.routes';

export function createApp(): Express {
  const app = express();

  // Trust proxy - required for HTTPS detection behind nginx
  app.set('trust proxy', 1);

  // Security middleware with exceptions for tracker routes
  app.use((req: Request, res: Response, next: NextFunction) => {
    // For tracker routes, use relaxed security headers to allow cross-origin embedding
    if (req.path.startsWith('/tracker')) {
      helmet({
        crossOriginResourcePolicy: { policy: 'cross-origin' },
        contentSecurityPolicy: false,
      })(req, res, next);
    } else {
      helmet()(req, res, next);
    }
  });

  // CORS configuration - Different policies for different routes
  const allowedOrigins = env.corsOrigin.split(',').map(origin => origin.trim());

  // Public tracker routes need to allow all origins (for Qualtrics, Google Forms, etc.)
  app.use('/tracker', cors({
    origin: '*',
    methods: ['GET', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Cache-Control'],
    exposedHeaders: ['Content-Type', 'Cache-Control'],
  }));

  // Public tracking API routes need to allow all origins (for third-party integrations)
  app.use('/api/v1/track', cors({
    origin: '*',
    credentials: false,
    methods: ['GET', 'POST', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'X-Task-Token', 'X-Session-Id'],
  }));

  // Restricted CORS for authenticated API routes
  app.use(
    cors({
      origin: allowedOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
      allowedHeaders: ['Content-Type', 'Authorization', 'X-Task-Token', 'X-Session-Id'],
    })
  );

  // Compression
  app.use(compression());

  // Body parsing middleware
  app.use(express.json({ limit: '10mb' }));
  app.use(express.urlencoded({ extended: true, limit: '10mb' }));

  // Cookie parser
  app.use(cookieParser());

  // Request logging
  app.use((req: Request, res: Response, next: NextFunction) => {
    const start = Date.now();
    res.on('finish', () => {
      const duration = Date.now() - start;
      logger.info(`${req.method} ${req.path}`, {
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration,
        ip: req.ip,
      });
    });
    next();
  });

  const healthHandler = (_req: Request, res: Response) => {
    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  };

  // Health check endpoints
  app.get('/health', healthHandler);
  app.get('/api/v1/health', healthHandler);

  // API version
  app.get('/api/v1', (_req: Request, res: Response) => {
    res.json({
      name: 'humanly API',
      version: '1.0.0',
      description: 'Text provenance service API',
    });
  });

  // Tracker routes (public access)
  app.use('/tracker', trackerRoutes);

  // API routes
  app.use('/api/v1/auth', authRoutes);
  app.use('/api/v1/tasks', taskRoutes);
  app.use('/api/v1/documents', documentRoutes);
  app.use('/api/v1/certificates', certificateRoutes);
  app.use('/api/v1/track', trackingRoutes);
  app.use('/api/v1/tasks', exportRoutes);
  app.use('/api/v1/tasks', analyticsRoutes);
  app.use('/api/v1/ai', aiRoutes);
  app.use('/api/v1', fileRoutes);

  // 404 handler
  app.use((req: Request, res: Response) => {
    res.status(404).json({
      success: false,
      error: 'Not found',
      message: `Cannot ${req.method} ${req.path}`,
    });
  });

  // Error handling middleware (must be last)
  app.use(errorHandler);

  return app;
}

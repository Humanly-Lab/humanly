import { createApp } from './app';
import { createServer, startServer } from './server';
import { testDatabaseConnection, closeDatabaseConnection } from './config/database';
import { createRedisClient, closeRedisConnection } from './config/redis';
import { logger } from './utils/logger';
import { env } from './config/env';
import { startTimedTaskAutoSubmitJob } from './jobs/timed-task-auto-submit.job';

async function main() {
  try {
    // Initialize database connection
    logger.info('Connecting to database...');
    await testDatabaseConnection();

    // Initialize Redis connection
    logger.info('Connecting to Redis...');
    await createRedisClient();

    // Create Express app
    const app = createApp();

    // Create HTTP server with Socket.IO
    const { httpServer, io } = createServer(app);

    // Store io instance globally for use in routes (we'll improve this later)
    (global as any).io = io;

    // Start server
    startServer(httpServer, env.port);

    // Start background jobs
    const timedTaskAutoSubmitJob = startTimedTaskAutoSubmitJob();

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received, shutting down gracefully`);

      // Close HTTP server
      httpServer.close(() => {
        logger.info('HTTP server closed');
      });

      // Close Socket.IO
      io.close(() => {
        logger.info('Socket.IO server closed');
      });

      // Stop background jobs
      timedTaskAutoSubmitJob.stop();

      // Close database connection
      await closeDatabaseConnection();

      // Close Redis connection
      await closeRedisConnection();

      process.exit(0);
    };

    // Handle shutdown signals
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

    // Handle uncaught errors
    process.on('uncaughtException', (error) => {
      logger.error('Uncaught Exception', error);
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.error('Unhandled Rejection', { reason, promise });
      process.exit(1);
    });
  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

main();

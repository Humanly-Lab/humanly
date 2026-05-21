// Set required environment variables before any module is imported.
// jest.config.js references this file via `setupFiles` (not setupFilesAfterFramework),
// so these assignments run before any module-level code in `config/env.ts`.

process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/testdb';
process.env.REDIS_URL = 'redis://localhost:6379';
process.env.JWT_SECRET = 'test-jwt-secret-key-for-unit-tests-only';
process.env.JWT_ACCESS_EXPIRES = '15m';
process.env.JWT_REFRESH_EXPIRES = '7d';
process.env.EMAIL_FROM = 'test@example.com';
process.env.EMAIL_SERVICE = 'console';
process.env.CORS_ORIGIN = 'http://localhost:3000';
process.env.FRONTEND_USER_URL = 'http://localhost:3002';
process.env.PUBLIC_API_URL = 'http://localhost:3001/api/v1';
process.env.AI_PROVIDER = 'mock';
process.env.AI_ENCRYPTION_KEY = '0'.repeat(64);
process.env.RATE_LIMIT_ENABLED = 'false';
process.env.LOG_LEVEL = 'silent';

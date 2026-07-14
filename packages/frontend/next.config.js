const path = require('path');

const API_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
const EDITION =
  process.env.NEXT_PUBLIC_EDITION === 'cloud' ? 'cloud' : 'community';
const publisherEditionUiModule =
  EDITION === 'cloud'
    ? path.resolve(__dirname, '../../ee/packages/billing/src/publisher.tsx')
    : path.resolve(__dirname, 'src/edition/community-publisher-ui.tsx');

if (
  API_URL &&
  !API_URL.startsWith('http://') &&
  !API_URL.startsWith('https://')
) {
  throw new Error(
    `NEXT_PUBLIC_API_URL must start with http:// or https://. Received: ${API_URL}`
  );
}

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  // In production the Publisher Portal is served at /admin via nginx.
  // Set NEXT_PUBLIC_BASE_PATH=/admin as a Docker build arg before building.
  basePath: process.env.NEXT_PUBLIC_BASE_PATH || '',
  transpilePackages: ['@humanly/shared'],
  env: {
    NEXT_PUBLIC_API_URL: API_URL,
    NEXT_PUBLIC_EDITION: EDITION,
    NEXT_PUBLIC_WS_URL: process.env.NEXT_PUBLIC_WS_URL,
    NEXT_PUBLIC_TRACKER_URL: process.env.NEXT_PUBLIC_TRACKER_URL,
  },
  async rewrites() {
    // Only proxy /api/* in local dev. In production, nginx routes /api/ directly
    // to the backend and NEXT_PUBLIC_API_URL is an absolute https:// URL.
    if (process.env.NODE_ENV === 'production') return [];
    if (!API_URL) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${API_URL}/:path*`,
      },
    ];
  },
  images: {
    domains: ['localhost', 'yourdomain.com'],
  },
  webpack: (config) => {
    // Exact match: import from '@humanly/shared'
    config.resolve.alias['@humanly/shared$'] = path.resolve(__dirname, '../shared/src/index.ts');
    // Subpath match: import from '@humanly/shared/types/...'
    config.resolve.alias['@humanly/shared'] = path.resolve(__dirname, '../shared/src');
    config.resolve.alias['@humanly-edition/publisher-ui'] = publisherEditionUiModule;
    // Ensure root node_modules is searchable (for zod and other deps)
    config.resolve.modules = [
      path.resolve(__dirname, '../../node_modules'),
      ...(config.resolve.modules || ['node_modules']),
    ];
    return config;
  },
};

module.exports = nextConfig;

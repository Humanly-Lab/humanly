/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  distDir: process.env.NEXT_DIST_DIR || '.next',
  transpilePackages: ['@humanly/shared', '@humanly/editor'],
  env: {
    NEXT_PUBLIC_API_URL: process.env.NEXT_PUBLIC_API_URL,
  },
  async rewrites() {
    // Only proxy /api/* in local dev. In production, nginx routes /api/ directly
    // to the backend and NEXT_PUBLIC_API_URL is an absolute https:// URL.
    if (process.env.NODE_ENV === 'production') return [];
    if (!process.env.NEXT_PUBLIC_API_URL) return [];
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL}/:path*`,
      },
    ];
  },
  images: {
    domains: ['localhost', 'api.writehumanly.net', 'yourdomain.com'],
  },
  webpack: (config) => {
    // Required for pdfjs-dist SSR compatibility
    config.resolve.alias.canvas = false;
    return config;
  },
};

module.exports = nextConfig;

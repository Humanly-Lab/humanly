import type { MetadataRoute } from 'next';
import { DEFAULT_MARKETING_ORIGIN } from '@/lib/app-origin';

const marketingOrigin =
  process.env.NEXT_PUBLIC_MARKETING_ORIGIN || DEFAULT_MARKETING_ORIGIN;

// Public marketing surface only; the product app is intentionally excluded.
export default function sitemap(): MetadataRoute.Sitemap {
  return [
    { path: '/', priority: 1 },
    { path: '/about', priority: 0.8 },
    { path: '/research', priority: 0.8 },
    { path: '/pricing', priority: 0.8 },
    { path: '/docs', priority: 0.5 },
    { path: '/privacy', priority: 0.3 },
    { path: '/terms', priority: 0.3 },
  ].map(({ path, priority }) => ({
    url: `${marketingOrigin}${path}`,
    changeFrequency: 'weekly',
    priority,
  }));
}

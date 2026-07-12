import type { MetadataRoute } from 'next';
import { DEFAULT_MARKETING_ORIGIN } from '@/lib/app-origin';

const marketingOrigin =
  process.env.NEXT_PUBLIC_MARKETING_ORIGIN || DEFAULT_MARKETING_ORIGIN;

// Marketing pages are indexable; workspace routes stay out of search results.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/documents/', '/logs/', '/api/'],
    },
    sitemap: `${marketingOrigin}/sitemap.xml`,
  };
}

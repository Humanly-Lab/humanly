import { productAppHref } from './app-origin';

const MARKETING_HOSTS = new Set(['writehumanly.net']);
const PASS_THROUGH_PREFIXES = [
  '/_next',
  '/api',
  '/brand',
  '/health',
];
const PASS_THROUGH_PATHS = new Set([
  '/',
  '/favicon.ico',
  '/icon.svg',
  '/apple-icon.png',
  '/manifest.json',
  '/robots.txt',
  '/sitemap.xml',
]);

function isMarketingAssetPath(pathname: string): boolean {
  return PASS_THROUGH_PATHS.has(pathname)
    || PASS_THROUGH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function getApexRedirectLocation(host: string | null | undefined, pathname: string, search = ''): string | null {
  const normalizedHost = host?.split(':')[0].toLowerCase();
  if (!normalizedHost || !MARKETING_HOSTS.has(normalizedHost) || isMarketingAssetPath(pathname)) {
    return null;
  }

  return productAppHref(`${pathname}${search}`, { allowRelativeInNonProduction: false });
}

export const DEFAULT_PRODUCT_APP_ORIGIN = 'https://app.writehumanly.net';
export const DEFAULT_MARKETING_ORIGIN = 'https://writehumanly.net';
export const DEFAULT_ADMIN_APP_ORIGIN = 'https://admin.writehumanly.net';

function normalizeOrigin(origin?: string): string {
  if (!origin) return '';
  return origin.replace(/\/+$/, '');
}

interface ProductAppOriginOptions {
  allowRelativeInNonProduction?: boolean;
}

type OriginOptions = ProductAppOriginOptions;

type LocationLike = Pick<Location, 'hostname' | 'origin' | 'port' | 'protocol'>;

function currentLocation(): LocationLike | undefined {
  return typeof window === 'undefined' ? undefined : window.location;
}

export function getProductAppOrigin(options: ProductAppOriginOptions = {}): string {
  const { allowRelativeInNonProduction = true } = options;
  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_PRODUCT_APP_ORIGIN);
  if (configuredOrigin) return configuredOrigin;

  if (process.env.NODE_ENV === 'production' || !allowRelativeInNonProduction) {
    return DEFAULT_PRODUCT_APP_ORIGIN;
  }

  return '';
}

export function productAppHref(path: string, options: ProductAppOriginOptions = {}): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const origin = getProductAppOrigin(options);
  return origin ? `${origin}${normalizedPath}` : normalizedPath;
}

export function getMarketingOrigin(options: OriginOptions = {}): string {
  const { allowRelativeInNonProduction = true } = options;
  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_MARKETING_ORIGIN);
  if (configuredOrigin) return configuredOrigin;

  if (process.env.NODE_ENV === 'production' || !allowRelativeInNonProduction) {
    return DEFAULT_MARKETING_ORIGIN;
  }

  return '';
}

export function marketingHref(path: string, options: OriginOptions = {}): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  const origin = getMarketingOrigin(options);
  return origin ? `${origin}${normalizedPath}` : normalizedPath;
}

export function getAdminAppOrigin(location: LocationLike | undefined = currentLocation()): string {
  const configuredOrigin = normalizeOrigin(process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN);
  if (configuredOrigin) return configuredOrigin;

  if (!location) return DEFAULT_ADMIN_APP_ORIGIN;

  const isLocalBrowser = location.hostname === 'localhost' || location.hostname === '127.0.0.1';
  if (isLocalBrowser) {
    return `${location.protocol}//${location.hostname}:3000`;
  }

  if (location.hostname.startsWith('app.')) {
    const adminHost = location.hostname.replace(/^app\./, 'admin.');
    return `${location.protocol}//${adminHost}${location.port ? `:${location.port}` : ''}`;
  }

  return DEFAULT_ADMIN_APP_ORIGIN;
}

export function adminAppHref(path: string, location?: LocationLike): string {
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  return `${getAdminAppOrigin(location)}${normalizedPath}`;
}

export const DEFAULT_PRODUCT_APP_ORIGIN = 'https://app.writehumanly.net';
export const DEFAULT_MARKETING_ORIGIN = 'https://writehumanly.net';

function normalizeOrigin(origin?: string): string {
  if (!origin) return '';
  return origin.replace(/\/+$/, '');
}

interface ProductAppOriginOptions {
  allowRelativeInNonProduction?: boolean;
}

type OriginOptions = ProductAppOriginOptions;

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

type LocationLike = Pick<Location, 'hostname' | 'origin' | 'port' | 'protocol'>;

const LOCAL_FRONTEND_USER_URL = 'http://localhost:3002';
const PRODUCTION_FRONTEND_USER_URL = 'https://app.writehumanly.net';

export type CanonicalAuthMode = 'login' | 'register';

function stripTrailingSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

function isLocalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.hostname === 'localhost' || parsed.hostname === '127.0.0.1';
  } catch {
    return false;
  }
}

function currentLocation(): LocationLike | undefined {
  return typeof window === 'undefined' ? undefined : window.location;
}

export function getFrontendUserUrl(location: LocationLike | undefined = currentLocation()): string {
  const configured = process.env.NEXT_PUBLIC_FRONTEND_USER_URL;
  const normalizedConfigured = configured ? stripTrailingSlash(configured) : '';
  const isLocalBrowser = location?.hostname === 'localhost' || location?.hostname === '127.0.0.1';

  if (normalizedConfigured && (!isLocalUrl(normalizedConfigured) || isLocalBrowser)) {
    return normalizedConfigured;
  }

  if (!location) {
    return normalizedConfigured
      || (process.env.NODE_ENV === 'production'
        ? PRODUCTION_FRONTEND_USER_URL
        : LOCAL_FRONTEND_USER_URL);
  }

  if (isLocalBrowser) {
    return `${location.protocol}//${location.hostname}:3002`;
  }

  if (location.hostname.startsWith('admin.')) {
    const appHost = location.hostname.replace(/^admin\./, 'app.');
    return `${location.protocol}//${appHost}${location.port ? `:${location.port}` : ''}`;
  }

  return location.origin;
}

export function buildCertificateVerifyUrl(
  verificationToken: string,
  location?: LocationLike,
): string {
  return `${getFrontendUserUrl(location)}/verify/${encodeURIComponent(verificationToken)}`;
}

export function buildTaskShareUrl(
  taskToken: string,
  location?: LocationLike,
): string {
  return `${getFrontendUserUrl(location)}/tasks/public/${encodeURIComponent(taskToken)}`;
}

export function sanitizePublisherReturnPath(
  value: string | null | undefined,
): string {
  if (!value || !value.startsWith('/') || value.startsWith('//')) {
    return '/tasks';
  }

  const pathname = value.split(/[?#]/, 1)[0];
  const isPublisherPath = pathname === '/tasks'
    || (pathname.startsWith('/tasks/') && !pathname.startsWith('/tasks/public/'));
  return isPublisherPath ? value : '/tasks';
}

export function buildFrontendUserAuthUrl(
  mode: CanonicalAuthMode,
  nextPath: string | null | undefined = '/tasks',
  location?: LocationLike,
): string {
  const safeNext = sanitizePublisherReturnPath(nextPath);
  return `${getFrontendUserUrl(location)}/${mode}?next=${encodeURIComponent(safeNext)}`;
}

export function navigateToFrontendUser(
  path = '/',
  location?: LocationLike,
): void {
  if (typeof window === 'undefined') return;
  const normalizedPath = path.startsWith('/') ? path : `/${path}`;
  window.location.assign(`${getFrontendUserUrl(location)}${normalizedPath}`);
}

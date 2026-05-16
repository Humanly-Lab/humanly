type LocationLike = Pick<Location, 'hostname' | 'origin' | 'port' | 'protocol'>;

const LOCAL_FRONTEND_USER_URL = 'http://localhost:3002';

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
    return normalizedConfigured || LOCAL_FRONTEND_USER_URL;
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

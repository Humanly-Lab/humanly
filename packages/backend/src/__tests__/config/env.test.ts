import { deriveSharedCookieDomain, resolveAuthCookieDomain } from '../../config/env';

const originalEnv = { ...process.env };

describe('auth cookie domain config', () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('derives a shared cookie domain for app and admin subdomains', () => {
    expect(
      deriveSharedCookieDomain(
        'https://app.writehumanly.net',
        'https://admin.writehumanly.net'
      )
    ).toBe('.writehumanly.net');
  });

  it('does not derive a cookie domain for localhost development', () => {
    expect(
      deriveSharedCookieDomain('http://localhost:3002', 'http://localhost:3000')
    ).toBeUndefined();
  });

  it('does not derive a cookie domain across unrelated roots', () => {
    expect(
      deriveSharedCookieDomain(
        'https://app.writehumanly.net',
        'https://admin.example.com'
      )
    ).toBeUndefined();
  });

  it('uses an explicit auth cookie domain before deriving one', () => {
    process.env.NODE_ENV = 'production';
    process.env.AUTH_COOKIE_DOMAIN = '.auth.example.com';
    process.env.FRONTEND_USER_URL = 'https://app.writehumanly.net';
    process.env.FRONTEND_ADMIN_URL = 'https://admin.writehumanly.net';

    expect(resolveAuthCookieDomain()).toBe('.auth.example.com');
  });

  it('derives the production auth cookie domain when it is not configured', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_COOKIE_DOMAIN;
    process.env.FRONTEND_USER_URL = 'https://app.writehumanly.net';
    process.env.FRONTEND_ADMIN_URL = 'https://admin.writehumanly.net';

    expect(resolveAuthCookieDomain()).toBe('.writehumanly.net');
  });

  it('derives the production auth cookie domain from the user portal URL when admin URL is omitted', () => {
    process.env.NODE_ENV = 'production';
    delete process.env.AUTH_COOKIE_DOMAIN;
    delete process.env.FRONTEND_ADMIN_URL;
    process.env.CORS_ORIGIN = 'https://app.writehumanly.net';
    process.env.FRONTEND_USER_URL = 'https://app.writehumanly.net';

    expect(resolveAuthCookieDomain()).toBe('.writehumanly.net');
  });

  it('leaves the auth cookie domain unset outside production', () => {
    process.env.NODE_ENV = 'development';
    delete process.env.AUTH_COOKIE_DOMAIN;
    process.env.FRONTEND_USER_URL = 'https://app.writehumanly.net';
    process.env.FRONTEND_ADMIN_URL = 'https://admin.writehumanly.net';

    expect(resolveAuthCookieDomain()).toBeUndefined();
  });
});

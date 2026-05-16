import { buildCertificateVerifyUrl, getFrontendUserUrl } from '../../lib/certificate-url';

const locationFor = (url: string) => {
  const parsed = new URL(url);
  return {
    hostname: parsed.hostname,
    origin: parsed.origin,
    port: parsed.port,
    protocol: parsed.protocol,
  } as Location;
};

describe('admin certificate verification URLs', () => {
  const originalFrontendUserUrl = process.env.NEXT_PUBLIC_FRONTEND_USER_URL;

  afterEach(() => {
    process.env.NEXT_PUBLIC_FRONTEND_USER_URL = originalFrontendUserUrl;
  });

  it('keeps localhost links local during development', () => {
    delete process.env.NEXT_PUBLIC_FRONTEND_USER_URL;

    expect(getFrontendUserUrl(locationFor('http://localhost:3000/tasks'))).toBe('http://localhost:3002');
  });

  it('infers the deployed user portal from the deployed admin host', () => {
    delete process.env.NEXT_PUBLIC_FRONTEND_USER_URL;

    expect(getFrontendUserUrl(locationFor('https://admin.writehumanly.net/tasks'))).toBe(
      'https://app.writehumanly.net'
    );
  });

  it('ignores a localhost fallback when rendering on the deployed admin host', () => {
    process.env.NEXT_PUBLIC_FRONTEND_USER_URL = 'http://localhost:3002';

    expect(getFrontendUserUrl(locationFor('https://admin.writehumanly.net/tasks'))).toBe(
      'https://app.writehumanly.net'
    );
  });

  it('builds verification links with an encoded token', () => {
    delete process.env.NEXT_PUBLIC_FRONTEND_USER_URL;

    expect(buildCertificateVerifyUrl('token/with/slash', locationFor('https://admin.writehumanly.net/tasks'))).toBe(
      'https://app.writehumanly.net/verify/token%2Fwith%2Fslash'
    );
  });
});

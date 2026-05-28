import { getApexRedirectLocation } from '@/lib/apex-routing';

describe('apex domain routing', () => {
  it('keeps the apex root as the marketing homepage', () => {
    expect(getApexRedirectLocation('writehumanly.net', '/')).toBeNull();
  });

  it('hands non-root apex paths to the product app domain', () => {
    expect(getApexRedirectLocation('writehumanly.net', '/register', '?next=%2Fdocuments')).toBe(
      'https://app.writehumanly.net/register?next=%2Fdocuments'
    );
  });

  it('does not redirect app subdomain product paths', () => {
    expect(getApexRedirectLocation('app.writehumanly.net', '/register')).toBeNull();
  });

  it('keeps apex static assets on the marketing domain', () => {
    expect(getApexRedirectLocation('writehumanly.net', '/brand/pencil-angled.png')).toBeNull();
    expect(getApexRedirectLocation('writehumanly.net', '/_next/static/chunk.js')).toBeNull();
  });
});

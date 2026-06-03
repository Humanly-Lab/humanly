import { render, screen } from '@testing-library/react';

import AuthLayout from '@/app/(auth)/layout';
import { adminAppHref, marketingHref, productAppHref } from '@/lib/app-origin';

describe('marketing and product origins', () => {
  const originalMarketingOrigin = process.env.NEXT_PUBLIC_MARKETING_ORIGIN;
  const originalProductAppOrigin = process.env.NEXT_PUBLIC_PRODUCT_APP_ORIGIN;
  const originalAdminAppOrigin = process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN;

  const restoreOrigins = () => {
    if (originalMarketingOrigin === undefined) {
      delete process.env.NEXT_PUBLIC_MARKETING_ORIGIN;
    } else {
      process.env.NEXT_PUBLIC_MARKETING_ORIGIN = originalMarketingOrigin;
    }

    if (originalProductAppOrigin === undefined) {
      delete process.env.NEXT_PUBLIC_PRODUCT_APP_ORIGIN;
    } else {
      process.env.NEXT_PUBLIC_PRODUCT_APP_ORIGIN = originalProductAppOrigin;
    }

    if (originalAdminAppOrigin === undefined) {
      delete process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN;
    } else {
      process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN = originalAdminAppOrigin;
    }
  };

  beforeEach(() => {
    restoreOrigins();
  });

  it('centralizes external origin mapping without component-level hardcoding', () => {
    process.env.NEXT_PUBLIC_MARKETING_ORIGIN = 'https://writehumanly.net/';
    process.env.NEXT_PUBLIC_PRODUCT_APP_ORIGIN = 'https://app.writehumanly.net/';
    process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN = 'https://admin.writehumanly.net/';

    expect(marketingHref('/')).toBe('https://writehumanly.net/');
    expect(productAppHref('/register')).toBe('https://app.writehumanly.net/register');
    expect(adminAppHref('/tasks')).toBe('https://admin.writehumanly.net/tasks');
  });

  it('infers the admin portal origin from local and deployed app hosts', () => {
    expect(
      adminAppHref('/tasks', {
        protocol: 'http:',
        hostname: 'localhost',
        port: '3002',
        origin: 'http://localhost:3002',
      } as Location)
    ).toBe('http://localhost:3000/tasks');

    expect(
      adminAppHref('/tasks', {
        protocol: 'https:',
        hostname: 'app.writehumanly.net',
        port: '',
        origin: 'https://app.writehumanly.net',
      } as Location)
    ).toBe('https://admin.writehumanly.net/tasks');
  });

  it('sends auth-layout logo clicks back to the marketing homepage', () => {
    process.env.NEXT_PUBLIC_MARKETING_ORIGIN = 'https://writehumanly.net';

    render(
      <AuthLayout>
        <div>auth content</div>
      </AuthLayout>
    );

    expect(screen.getByRole('link', { name: 'Humanly' })).toHaveAttribute(
      'href',
      'https://writehumanly.net/'
    );
  });
});

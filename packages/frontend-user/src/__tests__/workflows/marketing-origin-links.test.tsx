import { render, screen } from '@testing-library/react';

import AuthLayout from '@/app/(auth)/layout';
import { marketingHref, productAppHref } from '@/lib/app-origin';

describe('marketing and product origins', () => {
  const originalMarketingOrigin = process.env.NEXT_PUBLIC_MARKETING_ORIGIN;
  const originalProductAppOrigin = process.env.NEXT_PUBLIC_PRODUCT_APP_ORIGIN;

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
  };

  beforeEach(() => {
    restoreOrigins();
  });

  it('centralizes external origin mapping without component-level hardcoding', () => {
    process.env.NEXT_PUBLIC_MARKETING_ORIGIN = 'https://writehumanly.net/';
    process.env.NEXT_PUBLIC_PRODUCT_APP_ORIGIN = 'https://app.writehumanly.net/';

    expect(marketingHref('/')).toBe('https://writehumanly.net/');
    expect(productAppHref('/register')).toBe('https://app.writehumanly.net/register');
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

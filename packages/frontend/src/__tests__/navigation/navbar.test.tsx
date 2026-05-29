import type * as React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Navbar } from '@/components/navigation/navbar';

const mockPush = jest.fn();
const mockLogout = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('next/link', () => ({
  __esModule: true,
  default: ({
    href,
    children,
    ...props
  }: React.AnchorHTMLAttributes<HTMLAnchorElement> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    user: {
      email: 'admin@mail.com',
    },
    logout: mockLogout,
  }),
}));

describe('admin navbar', () => {
  const originalFrontendUserUrl = process.env.NEXT_PUBLIC_FRONTEND_USER_URL;

  beforeEach(() => {
    mockPush.mockClear();
    mockLogout.mockClear();
    process.env.NEXT_PUBLIC_FRONTEND_USER_URL = 'https://app.writehumanly.net';
  });

  afterEach(() => {
    if (originalFrontendUserUrl === undefined) {
      delete process.env.NEXT_PUBLIC_FRONTEND_USER_URL;
    } else {
      process.env.NEXT_PUBLIC_FRONTEND_USER_URL = originalFrontendUserUrl;
    }
  });

  it('uses the brand as the only tasks link in the top bar', () => {
    render(<Navbar />);

    const brandLink = screen.getByRole('link', { name: /humanly admin/i });
    expect(brandLink).toHaveAttribute('href', '/tasks');
    expect(brandLink.querySelector('img[src="/brand/pencil-angled.png"]')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /^tasks$/i })).not.toBeInTheDocument();
  });

  it('keeps the mobile account menu without the redundant tasks link', () => {
    render(<Navbar />);

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    expect(screen.getByRole('heading', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getAllByText('admin@mail.com')).toHaveLength(2);
    expect(screen.queryByRole('link', { name: /^tasks$/i })).not.toBeInTheDocument();
  });

  it('links admins back to the user portal from the account dropdown', async () => {
    const user = userEvent.setup();
    render(<Navbar />);

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /admin@mail\.com/i }));
    });

    const switchLink = screen.getByRole('menuitem', { name: /switch to user view/i });
    expect(switchLink).toHaveAttribute('href', 'https://app.writehumanly.net/documents?switchSession=1');
  });

  it('links admins back to the user portal from the mobile menu', () => {
    render(<Navbar />);

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    const switchLink = screen.getByRole('link', { name: /switch to user view/i });
    expect(switchLink).toHaveAttribute('href', 'https://app.writehumanly.net/documents?switchSession=1');
  });
});

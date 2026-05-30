import type * as React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Navbar } from '@/components/navigation/navbar';

const mockPush = jest.fn();
const mockLogout = jest.fn();
const mockUpdateUser = jest.fn();
const mockDeleteAccount = jest.fn();
let mockUser: { email: string; name?: string | null } | null = {
  email: 'admin@mail.com',
};

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
    user: mockUser,
    logout: mockLogout,
    updateUser: mockUpdateUser,
    deleteAccount: mockDeleteAccount,
  }),
}));

describe('admin navbar', () => {
  const originalFrontendUserUrl = process.env.NEXT_PUBLIC_FRONTEND_USER_URL;

  beforeEach(() => {
    mockPush.mockClear();
    mockLogout.mockClear();
    mockUpdateUser.mockReset();
    mockUpdateUser.mockResolvedValue(undefined);
    mockDeleteAccount.mockReset();
    mockDeleteAccount.mockResolvedValue(undefined);
    mockUser = {
      email: 'admin@mail.com',
    };
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

  it('uses display name as the account label when available', async () => {
    mockUser = {
      email: 'admin@mail.com',
      name: 'Admin One',
    };
    const user = userEvent.setup();

    render(<Navbar />);

    await user.click(screen.getByRole('button', { name: /admin one/i }));

    expect(screen.queryByRole('button', { name: /admin@mail\.com/i })).not.toBeInTheDocument();
    expect(screen.getByText('My Account')).toBeInTheDocument();
  });

  it('opens My Account settings and saves the display name', async () => {
    mockUser = {
      email: 'admin@mail.com',
      name: 'Admin One',
    };
    const user = userEvent.setup();

    render(<Navbar />);

    await user.click(screen.getByRole('button', { name: /admin one/i }));
    await user.click(screen.getByRole('menuitem', { name: /settings/i }));

    expect(screen.getByRole('heading', { name: /my account/i })).toBeInTheDocument();
    expect(screen.getByText('Email address')).toBeInTheDocument();
    expect(screen.getByText('admin@mail.com')).toBeInTheDocument();
    expect(screen.queryByDisplayValue('admin@mail.com')).not.toBeInTheDocument();

    const displayName = screen.getByLabelText(/display name/i);
    await user.clear(displayName);
    await user.type(displayName, 'Admin Two');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ name: 'Admin Two' });
    });
  });

  it('deletes the account from My Account settings after confirmation', async () => {
    mockUser = {
      email: 'admin@mail.com',
      name: 'Admin One',
    };
    const user = userEvent.setup();

    render(<Navbar />);

    await user.click(screen.getByRole('button', { name: /admin one/i }));
    await user.click(screen.getByRole('menuitem', { name: /settings/i }));
    await user.click(screen.getByRole('button', { name: /delete my account/i }));

    expect(screen.getByRole('heading', { name: /delete account/i })).toBeInTheDocument();
    await user.type(screen.getByLabelText(/type delete to confirm/i), 'DELETE');
    await user.click(screen.getByRole('button', { name: /^delete account$/i }));

    await waitFor(() => {
      expect(mockDeleteAccount).toHaveBeenCalledTimes(1);
    });
    expect(mockPush).toHaveBeenCalledWith('/login');
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

  it('opens My Account settings from the mobile menu', async () => {
    const user = userEvent.setup();
    render(<Navbar />);

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));
    await user.click(screen.getByRole('button', { name: /settings/i }));

    expect(screen.getByRole('heading', { name: /my account/i })).toBeInTheDocument();
  });
});

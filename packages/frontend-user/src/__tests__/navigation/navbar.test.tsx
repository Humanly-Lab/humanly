import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Navbar } from '@/components/navigation/navbar';

const mockPush = jest.fn();
const mockLogout = jest.fn();
let mockPathname = '/documents';
let mockUser: { email: string; role?: 'admin' | 'user' } | null = {
  email: 'writer@mail.com',
  role: 'user',
};

jest.mock('next/navigation', () => ({
  usePathname: () => mockPathname,
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: () => ({
    user: mockUser,
    logout: mockLogout,
  }),
}));

describe('user navbar', () => {
  const originalAdminAppOrigin = process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN;

  beforeEach(() => {
    mockPush.mockClear();
    mockLogout.mockClear();
    mockPathname = '/documents';
    mockUser = {
      email: 'writer@mail.com',
      role: 'user',
    };

    if (originalAdminAppOrigin === undefined) {
      delete process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN;
    } else {
      process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN = originalAdminAppOrigin;
    }
  });

  it('shows the admin portal switch for regular users', async () => {
    process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN = 'https://admin.writehumanly.net';
    const user = userEvent.setup();

    render(<Navbar />);

    await user.click(screen.getByRole('button', { name: /writer@mail\.com/i }));

    const switchLink = screen.getByRole('menuitem', { name: /switch to admin view/i });
    expect(switchLink).toHaveAttribute('href', 'https://admin.writehumanly.net/tasks?switchSession=1');
  });

  it('shows the admin portal switch for admin users', async () => {
    process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN = 'https://admin.writehumanly.net';
    mockUser = {
      email: 'admin@mail.com',
      role: 'admin',
    };
    const user = userEvent.setup();

    render(<Navbar />);

    await user.click(screen.getByRole('button', { name: /admin@mail\.com/i }));

    const switchLink = screen.getByRole('menuitem', { name: /switch to admin view/i });
    expect(switchLink).toHaveAttribute('href', 'https://admin.writehumanly.net/tasks?switchSession=1');
  });

  it('shows the admin portal switch in the mobile menu for regular users', () => {
    process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN = 'http://localhost:3000';

    render(<Navbar />);

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    const switchLink = screen.getByRole('link', { name: /switch to admin view/i });
    expect(switchLink).toHaveAttribute('href', 'http://localhost:3000/tasks?switchSession=1');
  });
});

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { Navbar } from '@/components/navigation/navbar';

const mockPush = jest.fn();
	const mockLogout = jest.fn();
	const mockUpdateUser = jest.fn();
	const mockDeleteAccount = jest.fn();
	let mockPathname = '/documents';
	let mockUser: {
	  email: string;
	  name?: string | null;
	  firstName?: string | null;
	  lastName?: string | null;
	  profileCompleted?: boolean;
	} | null = {
	  email: 'writer@mail.com',
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
    deleteAccount: mockDeleteAccount,
    updateUser: mockUpdateUser,
  }),
}));

describe('user navbar', () => {
  const originalAdminAppOrigin = process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN;

  beforeEach(() => {
    mockPush.mockClear();
    mockLogout.mockClear();
    mockDeleteAccount.mockReset();
    mockDeleteAccount.mockResolvedValue(undefined);
    mockUpdateUser.mockReset();
    mockUpdateUser.mockResolvedValue(undefined);
    mockPathname = '/documents';
    mockUser = {
      email: 'writer@mail.com',
      profileCompleted: true,
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

    const switchLink = screen.getByRole('menuitem', { name: /admin portal/i });
    expect(switchLink).toHaveAttribute('href', 'https://admin.writehumanly.net/tasks?switchSession=1');
  });

  it('links the wordmark to the workspace for regular users', () => {
    render(<Navbar />);

    expect(screen.getByRole('link', { name: /humanly/i })).toHaveAttribute('href', '/documents');
  });

  it('shows the admin portal switch for admin users', async () => {
    process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN = 'https://admin.writehumanly.net';
    mockUser = {
      email: 'admin@mail.com',
    };
    const user = userEvent.setup();

    render(<Navbar />);

    await user.click(screen.getByRole('button', { name: /admin@mail\.com/i }));

    const switchLink = screen.getByRole('menuitem', { name: /admin portal/i });
    expect(switchLink).toHaveAttribute('href', 'https://admin.writehumanly.net/tasks?switchSession=1');
  });

	  it('opens My Account profile editing and saves the first and last name', async () => {
	    mockUser = {
	      email: 'writer@mail.com',
	      name: 'Writer One',
	      firstName: 'Writer',
	      lastName: 'One',
	      profileCompleted: true,
	    };
    const user = userEvent.setup();

    render(<Navbar />);

    await user.click(screen.getByRole('button', { name: /writer one/i }));
    await user.click(screen.getByRole('menuitem', { name: /settings/i }));

	    expect(screen.getByRole('heading', { name: /my account/i })).toBeInTheDocument();
	    expect(screen.getByText('Email address')).toBeInTheDocument();
	    expect(screen.getByText('writer@mail.com')).toBeInTheDocument();
	    expect(screen.queryByDisplayValue('writer@mail.com')).not.toBeInTheDocument();
	    const firstName = screen.getByLabelText(/first name/i);
	    const lastName = screen.getByLabelText(/last name/i);
	    await user.clear(firstName);
	    await user.type(firstName, 'Writer');
    await user.clear(lastName);
    await user.type(lastName, 'Two');
    await user.click(screen.getByRole('button', { name: /^save$/i }));

    await waitFor(() => {
      expect(mockUpdateUser).toHaveBeenCalledWith({ firstName: 'Writer', lastName: 'Two' });
    });
	  });

  it('deletes the account from My Account settings after confirmation', async () => {
    mockUser = {
      email: 'writer@mail.com',
      name: 'Writer One',
      profileCompleted: true,
    };
    const user = userEvent.setup();

    render(<Navbar />);

    await user.click(screen.getByRole('button', { name: /writer one/i }));
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

  it('shows the admin portal switch in the mobile menu for regular users', () => {
    process.env.NEXT_PUBLIC_ADMIN_APP_ORIGIN = 'http://localhost:3000';

    render(<Navbar />);

    fireEvent.click(screen.getByRole('button', { name: /open menu/i }));

    const switchLink = screen.getByRole('link', { name: /admin portal/i });
    expect(switchLink).toHaveAttribute('href', 'http://localhost:3000/tasks?switchSession=1');
  });

  it('renders guest mode as a disabled account button without account actions', async () => {
    mockUser = {
      email: 'public-task-guest@guest.humanly.local',
    };
    const user = userEvent.setup();

    render(<Navbar />);

    const guestButtons = screen.getAllByRole('button', { name: /guest/i });
    expect(guestButtons[0]).toBeDisabled();

    await user.click(guestButtons[0]);

    expect(screen.queryByText(/admin portal/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/logout/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/settings/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/delete my account/i)).not.toBeInTheDocument();
  });

  it('does not link the wordmark back to the workspace for public task guests', () => {
    mockUser = {
      email: 'public-task-guest@guest.humanly.local',
    };

    render(<Navbar />);

    expect(screen.getByText('humanly')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: /humanly/i })).not.toBeInTheDocument();
  });
});

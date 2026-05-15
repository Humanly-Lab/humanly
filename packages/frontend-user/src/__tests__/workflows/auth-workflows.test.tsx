import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LoginPage from '@/app/(auth)/login/page';
import RegisterPage from '@/app/(auth)/register/page';

const mockPush = jest.fn();
const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockResendVerificationEmail = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/stores/auth-store', () => ({
  useAuthStore: (selector?: any) => {
    const state = {
      login: mockLogin,
      register: mockRegister,
      resendVerificationEmail: mockResendVerificationEmail,
      isLoading: false,
    };

    return selector ? selector(state) : state;
  },
}));

describe('user auth workflows', () => {
  beforeEach(() => {
    jest.useRealTimers();
    mockPush.mockClear();
    mockLogin.mockReset();
    mockRegister.mockReset();
    mockResendVerificationEmail.mockReset();
  });

  it('shows an error for invalid login and routes valid login to documents', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new Error('Invalid email or password'));

    const { rerender } = render(<LoginPage />);

    await user.type(screen.getByLabelText(/email address/i), 'missing@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText('Invalid email or password')).toBeInTheDocument();
    expect(mockPush).not.toHaveBeenCalled();

    mockLogin.mockResolvedValueOnce(undefined);
    rerender(<LoginPage />);

    await user.clear(screen.getByLabelText(/email address/i));
    await user.type(screen.getByLabelText(/email address/i), 'user@example.com');
    await user.clear(screen.getByLabelText(/^password$/i));
    await user.type(screen.getByLabelText(/^password$/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    await waitFor(() => {
      expect(mockLogin).toHaveBeenLastCalledWith('user@example.com', 'Password123!', 'user');
      expect(mockPush).toHaveBeenCalledWith('/documents');
    });
  });

  it('blocks weak registration passwords and redirects valid registration to login', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    const { unmount } = render(<RegisterPage />);

    await user.type(screen.getByLabelText(/^name$/i), 'QA User');
    await user.type(screen.getByLabelText(/^email$/i), 'qa@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'weakpass');
    await user.type(screen.getByPlaceholderText('Confirm your password'), 'weakpass');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    expect(await screen.findByText(/password must contain/i)).toBeInTheDocument();
    expect(mockRegister).not.toHaveBeenCalled();

    unmount();
    mockRegister.mockResolvedValueOnce(undefined);
    render(<RegisterPage />);

    await user.type(screen.getByLabelText(/^name$/i), 'QA User');
    await user.type(screen.getByLabelText(/^email$/i), 'qa@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'Password123!');
    await user.type(screen.getByPlaceholderText('Confirm your password'), 'Password123!');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    expect(await screen.findByText(/account created/i)).toBeInTheDocument();
    expect(mockRegister).toHaveBeenCalledWith('qa@example.com', 'Password123!', 'QA User', 'user');

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(mockPush).toHaveBeenCalledWith('/login');
  });
});

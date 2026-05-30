import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import LoginPage from '@/app/(auth)/login/page';
import RegisterPage from '@/app/(auth)/register/page';

const mockPush = jest.fn();
const mockReplace = jest.fn();
const mockLogin = jest.fn();
const mockRegister = jest.fn();
const mockResendVerificationEmail = jest.fn();
const mockApiGet = jest.fn();
const mockCheckAuth = jest.fn();
let mockIsAuthenticated = false;

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
  }),
}));

jest.mock('@/stores/auth-store', () => {
  const getState = () => ({
    login: mockLogin,
    register: mockRegister,
    resendVerificationEmail: mockResendVerificationEmail,
    checkAuth: mockCheckAuth,
    isAuthenticated: mockIsAuthenticated,
    isLoading: false,
  });

  const useAuthStore = (selector?: any) => {
    const state = {
      login: mockLogin,
      register: mockRegister,
      resendVerificationEmail: mockResendVerificationEmail,
      checkAuth: mockCheckAuth,
      isAuthenticated: mockIsAuthenticated,
      isLoading: false,
    };

    return selector ? selector(state) : state;
  };
  useAuthStore.getState = getState;

  return { useAuthStore };
});

jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  default: {
    get: (...args: any[]) => mockApiGet(...args),
  },
  getApiUrl: (path: string) => `http://localhost:3001/api/v1${path}`,
}));

describe('user auth workflows', () => {
  beforeEach(() => {
    jest.useRealTimers();
    mockPush.mockClear();
    mockReplace.mockClear();
    mockLogin.mockReset();
    mockRegister.mockReset();
    mockResendVerificationEmail.mockReset();
    mockCheckAuth.mockReset();
    mockCheckAuth.mockResolvedValue(undefined);
    mockIsAuthenticated = false;
    mockApiGet.mockResolvedValue({
      data: {
        providers: {
          google: false,
          github: false,
        },
      },
    });
    window.localStorage.clear();
  });

  it('shows an error for invalid login and routes valid login to documents', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new Error('Invalid email or password'));

    const { rerender } = render(<LoginPage />);

    expect(screen.queryByLabelText(/remember me/i)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: /forgot password/i })).toHaveAttribute(
      'href',
      '/forgot-password'
    );

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

  it('keeps Google and GitHub quick login side-by-side on mobile-sized auth pages', async () => {
    mockApiGet.mockResolvedValueOnce({
      data: {
        providers: {
          google: true,
          github: true,
        },
      },
    });

    render(<LoginPage />);

    const googleButton = await screen.findByRole('button', { name: /google/i });
    const githubButton = await screen.findByRole('button', { name: /github/i });

    expect(googleButton.parentElement).toBe(githubButton.parentElement);
    expect(googleButton.parentElement).toHaveClass('grid-cols-2');
  });

  it('redirects authenticated users away from the login page after restoring auth', async () => {
    mockIsAuthenticated = true;

    render(<LoginPage />);

    await waitFor(() => {
      expect(mockCheckAuth).toHaveBeenCalled();
      expect(mockReplace).toHaveBeenCalledWith('/documents');
    });
    expect(screen.getByRole('heading', { name: /welcome back/i })).toBeInTheDocument();
  });

  it('lets unverified users resend verification and continue to the code page', async () => {
    const user = userEvent.setup();
    mockLogin.mockRejectedValueOnce(new Error('Please verify your email before logging in'));
    mockResendVerificationEmail.mockResolvedValueOnce(undefined);

    render(<LoginPage />);

    await user.type(screen.getByLabelText(/email address/i), 'pending@example.com');
    await user.type(screen.getByLabelText(/^password$/i), 'Password123!');
    await user.click(screen.getByRole('button', { name: /^sign in$/i }));

    expect(await screen.findByText(/email not verified/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /resend verification email/i }));

    expect(await screen.findByRole('link', { name: /enter verification code/i })).toHaveAttribute(
      'href',
      '/verify-email?email=pending%40example.com'
    );
    expect(window.localStorage.getItem('pendingVerificationEmail')).toBe('pending@example.com');
  });

  it('blocks weak registration passwords and redirects valid registration to email verification', async () => {
    jest.useFakeTimers();
    const user = userEvent.setup({ advanceTimers: jest.advanceTimersByTime });

    const { unmount } = render(<RegisterPage />);

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

    expect(screen.queryByLabelText(/user name/i)).not.toBeInTheDocument();
    expect(screen.getByText(/collect basic profile info/i)).toBeInTheDocument();
    await user.type(screen.getByLabelText(/^email$/i), 'qa@example.com');
    await user.type(screen.getByPlaceholderText('Enter your password'), 'Password123!');
    await user.type(screen.getByPlaceholderText('Confirm your password'), 'Password123!');
    await user.click(screen.getByRole('checkbox'));
    await user.click(screen.getByRole('button', { name: /^create account$/i }));

    expect(await screen.findByText(/check your email/i)).toBeInTheDocument();
    expect(mockRegister).toHaveBeenCalledWith('qa@example.com', 'Password123!', 'user');
    expect(window.localStorage.getItem('pendingVerificationEmail')).toBe('qa@example.com');

    act(() => {
      jest.advanceTimersByTime(1200);
    });

    expect(mockPush).toHaveBeenCalledWith('/verify-email?email=qa%40example.com');
  });
});

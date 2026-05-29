import { act, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { OAuthButtons } from '@/components/auth/oauth-buttons';
import OAuthCallbackPage from '@/app/(auth)/auth/callback/page';

const mockApiGet = jest.fn();
const mockSetAccessToken = jest.fn();
const mockClearTokens = jest.fn();
const mockFetchUser = jest.fn();
const mockReplace = jest.fn();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    replace: mockReplace,
  }),
}));

jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  api: {
    get: (...args: any[]) => mockApiGet(...args),
  },
  getApiUrl: (path: string) => `http://localhost:3001${path}`,
  TokenManager: {
    setAccessToken: (...args: any[]) => mockSetAccessToken(...args),
    clearTokens: (...args: any[]) => mockClearTokens(...args),
  },
}));

jest.mock('@/stores/auth-store', () => {
  return {
    useAuthStore: (selector?: any) => {
      const state = {
        fetchUser: (...args: any[]) => mockFetchUser(...args),
      };
      return selector ? selector(state) : state;
    },
  };
});

describe('admin OAuth workflow', () => {
  const originalLocation = window.location;

  beforeEach(() => {
    jest.clearAllMocks();
    mockApiGet.mockResolvedValue({
      data: {
        providers: {
          google: true,
          github: true,
        },
      },
    });
    mockFetchUser.mockResolvedValue(undefined);

    Object.defineProperty(window, 'location', {
      configurable: true,
      value: {
        href: '',
        hash: '',
      },
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'location', {
      configurable: true,
      value: originalLocation,
    });
  });

  it('renders configured Google and GitHub providers and starts admin OAuth', async () => {
    const user = userEvent.setup();

    render(<OAuthButtons />);

    expect(await screen.findByRole('button', { name: /google/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /github/i })).toBeInTheDocument();
    expect(mockApiGet).toHaveBeenCalledWith('/api/v1/auth/oauth/providers');

    await act(async () => {
      await user.click(screen.getByRole('button', { name: /google/i }));
    });

    expect(window.location.href).toBe(
      'http://localhost:3001/api/v1/auth/oauth/google/start?role=admin&next=%2Ftasks'
    );
  });

  it('stores the OAuth access token and redirects to the safe admin next path', async () => {
    window.location.hash = '#accessToken=access-token-1&next=%2Ftasks%2Fnew';

    render(<OAuthCallbackPage />);

    await waitFor(() => {
      expect(mockSetAccessToken).toHaveBeenCalledWith('access-token-1');
      expect(mockFetchUser).toHaveBeenCalledTimes(1);
      expect(mockReplace).toHaveBeenCalledWith('/tasks/new');
    });
  });

  it('rejects unsafe OAuth next paths on the admin callback', async () => {
    window.location.hash = '#accessToken=access-token-1&next=https%3A%2F%2Fevil.test';

    render(<OAuthCallbackPage />);

    await waitFor(() => {
      expect(mockReplace).toHaveBeenCalledWith('/tasks');
    });
  });
});

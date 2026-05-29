const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockGetAccessToken = jest.fn();
const mockSetAccessToken = jest.fn();
const mockClearTokens = jest.fn();
const mockInitializeSocket = jest.fn();
const mockDisconnectSocket = jest.fn();

jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  default: {
    get: (...args: any[]) => mockApiGet(...args),
    post: (...args: any[]) => mockApiPost(...args),
  },
  TokenManager: {
    getAccessToken: (...args: any[]) => mockGetAccessToken(...args),
    setAccessToken: (...args: any[]) => mockSetAccessToken(...args),
    clearTokens: (...args: any[]) => mockClearTokens(...args),
  },
  ApiError: class ApiError extends Error {},
}));

jest.mock('@/lib/socket-client', () => ({
  initializeSocket: (...args: any[]) => mockInitializeSocket(...args),
  disconnectSocket: (...args: any[]) => mockDisconnectSocket(...args),
}));

import { useAuthStore } from '@/stores/auth-store';

const user = {
  id: 'user-1',
  email: 'writer@example.com',
  role: 'user' as const,
  emailVerified: true,
  createdAt: '2026-05-19T00:00:00.000Z',
  updatedAt: '2026-05-19T00:00:00.000Z',
};

describe('user auth store session restore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('refreshes from cookie before checking /auth/me when local access token is missing', async () => {
    mockGetAccessToken.mockReturnValue(null);
    mockApiPost.mockResolvedValueOnce({
      data: {
        accessToken: 'fresh-access-token',
      },
    });
    mockApiGet.mockResolvedValueOnce({
      data: {
        user,
      },
    });

    await useAuthStore.getState().checkAuth();

    expect(mockApiPost).toHaveBeenCalledWith('/auth/refresh', {}, { skipAuthRedirect: true });
    expect(mockSetAccessToken).toHaveBeenCalledWith('fresh-access-token');
    expect(mockApiGet).toHaveBeenCalledWith('/auth/me', { skipAuthRedirect: true });
    expect(mockInitializeSocket).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      user,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  });

  it('forces cookie refresh for portal switches even when a stale local access token exists', async () => {
    mockGetAccessToken.mockReturnValue('stale-user-access-token');
    mockApiPost.mockResolvedValueOnce({
      data: {
        accessToken: 'fresh-switched-access-token',
      },
    });
    mockApiGet.mockResolvedValueOnce({
      data: {
        user,
      },
    });

    await useAuthStore.getState().checkAuth({ forceRefresh: true });

    expect(mockClearTokens).toHaveBeenCalledTimes(1);
    expect(mockGetAccessToken).not.toHaveBeenCalled();
    expect(mockApiPost).toHaveBeenCalledWith('/auth/refresh', {}, { skipAuthRedirect: true });
    expect(mockSetAccessToken).toHaveBeenCalledWith('fresh-switched-access-token');
    expect(mockApiGet).toHaveBeenCalledWith('/auth/me', { skipAuthRedirect: true });
    expect(useAuthStore.getState()).toMatchObject({
      user,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  });

  it('clears auth state when local token and refresh cookie are both unavailable', async () => {
    mockGetAccessToken.mockReturnValue(null);
    mockApiPost.mockRejectedValueOnce(new Error('refresh failed'));

    await useAuthStore.getState().checkAuth();

    expect(mockApiPost).toHaveBeenCalledWith('/auth/refresh', {}, { skipAuthRedirect: true });
    expect(mockApiGet).not.toHaveBeenCalled();
    expect(mockClearTokens).toHaveBeenCalledTimes(1);
    expect(mockInitializeSocket).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('clears the local session without calling the backend', () => {
    useAuthStore.setState({
      user,
      isAuthenticated: true,
      isLoading: true,
      error: 'stale error',
    });

    useAuthStore.getState().clearLocalSession();

    expect(mockClearTokens).toHaveBeenCalledTimes(1);
    expect(mockDisconnectSocket).toHaveBeenCalledTimes(1);
    expect(mockApiPost).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });
});

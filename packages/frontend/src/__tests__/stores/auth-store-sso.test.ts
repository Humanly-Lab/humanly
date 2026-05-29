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

describe('admin auth store cross-portal session restore', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    useAuthStore.setState({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('refreshes from a shared cookie before checking /auth/me when no admin token is in memory', async () => {
    mockGetAccessToken.mockReturnValue(null);
    mockApiPost.mockResolvedValueOnce({
      data: {
        accessToken: 'fresh-admin-access-token',
      },
    });
    mockApiGet.mockResolvedValueOnce({
      data: {
        user,
      },
    });

    await useAuthStore.getState().fetchUser();

    expect(mockApiPost).toHaveBeenCalledWith('/api/v1/auth/refresh');
    expect(mockSetAccessToken).toHaveBeenCalledWith('fresh-admin-access-token');
    expect(mockApiGet).toHaveBeenCalledWith('/api/v1/auth/me');
    expect(mockInitializeSocket).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      user,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  });

  it('clears admin session state if the shared refresh cookie is unavailable', async () => {
    mockGetAccessToken.mockReturnValue(null);
    mockApiPost.mockRejectedValueOnce(new Error('refresh failed'));

    await expect(useAuthStore.getState().fetchUser()).rejects.toThrow('refresh failed');

    expect(mockApiGet).not.toHaveBeenCalled();
    expect(mockClearTokens).toHaveBeenCalled();
    expect(mockInitializeSocket).not.toHaveBeenCalled();
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });
});

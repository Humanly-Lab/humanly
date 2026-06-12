const mockApiGet = jest.fn();
const mockApiPost = jest.fn();
const mockApiPatch = jest.fn();
const mockApiDelete = jest.fn();
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
    patch: (...args: any[]) => mockApiPatch(...args),
    delete: (...args: any[]) => mockApiDelete(...args),
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
  emailVerified: true,
  createdAt: '2026-05-19T00:00:00.000Z',
  updatedAt: '2026-05-19T00:00:00.000Z',
};

const switchedAdminUser = {
  ...user,
  id: 'admin-b',
  email: 'admin-b@example.com',
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

  it('uses the switched cookie account when a stale user-portal token belongs to another account', async () => {
    mockGetAccessToken.mockReturnValue('stale-user-a-access-token');
    mockApiPost.mockResolvedValueOnce({
      data: {
        accessToken: 'fresh-admin-b-access-token',
      },
    });
    mockApiGet.mockResolvedValueOnce({
      data: {
        user: switchedAdminUser,
      },
    });

    await useAuthStore.getState().checkAuth({ forceRefresh: true });

    expect(mockClearTokens).not.toHaveBeenCalled();
    expect(mockGetAccessToken).toHaveBeenCalledTimes(1);
    expect(mockApiPost).toHaveBeenCalledWith('/auth/refresh', {}, { skipAuthRedirect: true });
    expect(mockSetAccessToken).toHaveBeenCalledWith('fresh-admin-b-access-token');
    expect(mockApiGet).toHaveBeenCalledWith('/auth/me', { skipAuthRedirect: true });
    expect(useAuthStore.getState()).toMatchObject({
      user: switchedAdminUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  });

  it('does not restore a shared cookie session when cookie refresh is disabled', async () => {
    mockGetAccessToken.mockReturnValue(null);

    await useAuthStore.getState().checkAuth({ allowCookieRefresh: false });

    expect(mockApiPost).not.toHaveBeenCalled();
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

  it('checks an existing app token without falling back to shared cookie refresh', async () => {
    mockGetAccessToken.mockReturnValue('existing-user-access-token');
    mockApiGet.mockResolvedValueOnce({
      data: {
        user,
      },
    });

    await useAuthStore.getState().checkAuth({ allowCookieRefresh: false });

    expect(mockApiPost).not.toHaveBeenCalled();
    expect(mockApiGet).toHaveBeenCalledWith('/auth/me', {
      skipAuthRedirect: true,
      skipAuthRefresh: true,
    });
    expect(useAuthStore.getState()).toMatchObject({
      user,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  });

  it('falls back to the existing app token when a forced portal-switch refresh is unavailable', async () => {
    mockGetAccessToken.mockReturnValue('existing-user-access-token');
    mockApiPost.mockRejectedValueOnce(new Error('refresh failed'));
    mockApiGet.mockResolvedValueOnce({
      data: {
        user,
      },
    });

    await useAuthStore.getState().checkAuth({ forceRefresh: true });

    expect(mockApiPost).toHaveBeenCalledWith('/auth/refresh', {}, { skipAuthRedirect: true });
    expect(mockSetAccessToken).not.toHaveBeenCalled();
    expect(mockClearTokens).not.toHaveBeenCalled();
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

  it('registers without sending profile names or role', async () => {
    mockApiPost.mockResolvedValueOnce({
      data: {
        user: {
          ...user,
          firstName: null,
          lastName: null,
          profileCompleted: false,
        },
      },
    });

    await useAuthStore.getState().register('writer@example.com', 'Password123!');

    expect(mockApiPost).toHaveBeenCalledWith('/auth/register', {
      email: 'writer@example.com',
      password: 'Password123!',
    });
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });

  it('updates the user profile through /auth/me without dropping auth state', async () => {
    useAuthStore.setState({
      user,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    const updatedUser = {
      ...user,
      name: 'QA Writer',
      firstName: 'QA',
      lastName: 'Writer',
      profileCompleted: true,
      updatedAt: '2026-05-20T00:00:00.000Z',
    };
    mockApiPatch.mockResolvedValueOnce({
      data: {
        user: updatedUser,
      },
    });

    await useAuthStore.getState().updateUser({ firstName: 'QA', lastName: 'Writer' });

    expect(mockApiPatch).toHaveBeenCalledWith('/auth/me', { firstName: 'QA', lastName: 'Writer' });
    expect(useAuthStore.getState()).toMatchObject({
      user: updatedUser,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
  });

  it('deletes the account through /auth/me and clears local session state', async () => {
    useAuthStore.setState({
      user,
      isAuthenticated: true,
      isLoading: false,
      error: null,
    });
    mockApiDelete.mockResolvedValueOnce({
      success: true,
      message: 'Account deleted successfully',
    });

    await useAuthStore.getState().deleteAccount();

    expect(mockApiDelete).toHaveBeenCalledWith('/auth/me');
    expect(mockClearTokens).toHaveBeenCalledTimes(1);
    expect(mockDisconnectSocket).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState()).toMatchObject({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,
    });
  });
});

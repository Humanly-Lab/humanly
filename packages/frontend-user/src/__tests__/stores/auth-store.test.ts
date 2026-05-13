/**
 * Auth store tests — api and socket are mocked so no network calls occur.
 */

// Mock the api module before importing the store
jest.mock('@/lib/api-client', () => ({
  __esModule: true,
  default: {
    get: jest.fn(),
    post: jest.fn(),
    put: jest.fn(),
    patch: jest.fn(),
    delete: jest.fn(),
  },
  TokenManager: {
    getAccessToken: jest.fn(() => null),
    setAccessToken: jest.fn(),
    setRefreshToken: jest.fn(),
    clearTokens: jest.fn(),
    getRefreshToken: jest.fn(() => null),
  },
  ApiError: class ApiError extends Error {
    constructor(message: string, public statusCode?: number) {
      super(message);
      this.name = 'ApiError';
    }
  },
  apiClient: { get: jest.fn(), post: jest.fn(), interceptors: { request: { use: jest.fn() }, response: { use: jest.fn() } } },
}));

jest.mock('@/lib/socket-client', () => ({
  initializeSocket: jest.fn(),
  disconnectSocket: jest.fn(),
}));

import api, { TokenManager } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';

const mockApi = api as jest.Mocked<typeof api>;

const fakeUser = {
  id: 'u1',
  email: 'test@example.com',
  emailVerified: true,
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
};

// Reset store state between tests
beforeEach(() => {
  useAuthStore.setState({
    user: null,
    isAuthenticated: false,
    isLoading: false,
    error: null,
  });
  jest.clearAllMocks();
});

describe('login', () => {
  it('sets isLoading while request is in flight', async () => {
    let resolve!: (v: any) => void;
    mockApi.post.mockReturnValueOnce(new Promise(r => { resolve = r; }));

    const promise = useAuthStore.getState().login('a@b.com', 'pass1234');
    expect(useAuthStore.getState().isLoading).toBe(true);

    resolve({ data: { user: fakeUser, accessToken: 'tok' } });
    await promise;
    expect(useAuthStore.getState().isLoading).toBe(false);
  });

  it('stores user and sets isAuthenticated on success', async () => {
    mockApi.post.mockResolvedValueOnce({ data: { user: fakeUser, accessToken: 'tok' } });

    await useAuthStore.getState().login('a@b.com', 'pass1234');

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(true);
    expect(state.user?.email).toBe('test@example.com');
    expect(TokenManager.setAccessToken).toHaveBeenCalledWith('tok');
  });

  it('sets error and throws on failure', async () => {
    mockApi.post.mockRejectedValueOnce(new Error('Invalid credentials'));

    await expect(useAuthStore.getState().login('a@b.com', 'wrong')).rejects.toThrow();

    const state = useAuthStore.getState();
    expect(state.isAuthenticated).toBe(false);
    expect(state.isLoading).toBe(false);
    expect(state.error).toBeTruthy();
  });
});

describe('logout', () => {
  it('clears user and isAuthenticated', async () => {
    useAuthStore.setState({ user: fakeUser, isAuthenticated: true });
    mockApi.post.mockResolvedValueOnce({});

    await useAuthStore.getState().logout();

    const state = useAuthStore.getState();
    expect(state.user).toBeNull();
    expect(state.isAuthenticated).toBe(false);
    expect(TokenManager.clearTokens).toHaveBeenCalled();
  });

  it('still clears state even when API call fails', async () => {
    useAuthStore.setState({ user: fakeUser, isAuthenticated: true });
    mockApi.post.mockRejectedValueOnce(new Error('Network error'));

    await useAuthStore.getState().logout();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(TokenManager.clearTokens).toHaveBeenCalled();
  });
});

describe('clearError', () => {
  it('resets error to null', () => {
    useAuthStore.setState({ error: 'some error' });
    useAuthStore.getState().clearError();
    expect(useAuthStore.getState().error).toBeNull();
  });
});

describe('checkAuth', () => {
  it('clears state when no token is present', async () => {
    (TokenManager.getAccessToken as jest.Mock).mockReturnValueOnce(null);
    useAuthStore.setState({ isAuthenticated: true, user: fakeUser });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().isAuthenticated).toBe(false);
    expect(useAuthStore.getState().user).toBeNull();
  });

  it('sets user when token is valid', async () => {
    (TokenManager.getAccessToken as jest.Mock).mockReturnValueOnce('valid-token');
    mockApi.get.mockResolvedValueOnce({ data: { user: fakeUser } });

    await useAuthStore.getState().checkAuth();

    expect(useAuthStore.getState().isAuthenticated).toBe(true);
    expect(useAuthStore.getState().user?.id).toBe('u1');
  });
});

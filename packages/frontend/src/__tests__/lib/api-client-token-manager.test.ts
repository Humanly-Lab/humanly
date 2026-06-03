import { TokenManager } from '@/lib/api-client';

describe('admin api TokenManager', () => {
  beforeEach(() => {
    TokenManager.clearTokens();
    localStorage.clear();
  });

  it('keeps new access tokens in memory instead of localStorage', () => {
    TokenManager.setAccessToken('access-token-1');

    expect(TokenManager.getAccessToken()).toBe('access-token-1');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });

  it('migrates and removes legacy stored tokens on first access', () => {
    localStorage.setItem('accessToken', 'legacy-access-token');
    localStorage.setItem('refreshToken', 'legacy-refresh-token');

    expect(TokenManager.getAccessToken()).toBe('legacy-access-token');
    expect(localStorage.getItem('accessToken')).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
    expect(TokenManager.getAccessToken()).toBe('legacy-access-token');
  });

  it('does not persist refresh tokens in browser storage', () => {
    TokenManager.setRefreshToken('refresh-token-1');

    expect(TokenManager.getRefreshToken()).toBeNull();
    expect(localStorage.getItem('refreshToken')).toBeNull();
  });
});

import { TokenManager } from '@/lib/api-client';

describe('TokenManager public document tokens', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('stores public task document tokens separately from the signed-in access token', () => {
    TokenManager.setAccessToken('signed-in-token');
    TokenManager.setPublicDocumentAccessToken('document-1', 'guest-document-token');

    expect(TokenManager.getAccessToken()).toBe('signed-in-token');
    expect(TokenManager.getPublicDocumentAccessToken('document-1')).toBe('guest-document-token');
    expect(TokenManager.getPublicDocumentAccessToken('document-2')).toBeNull();
  });

  it('clears isolated public document tokens on full session cleanup', () => {
    TokenManager.setAccessToken('signed-in-token');
    TokenManager.setPublicDocumentAccessToken('document-1', 'guest-document-token');

    TokenManager.clearTokens();

    expect(TokenManager.getAccessToken()).toBeNull();
    expect(TokenManager.getPublicDocumentAccessToken('document-1')).toBeNull();
  });
});

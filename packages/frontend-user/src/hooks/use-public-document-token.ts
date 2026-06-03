'use client';

import { useLayoutEffect, useRef } from 'react';

import { TokenManager } from '@/lib/api-client';

export function usePublicDocumentToken(documentId: string) {
  const previousAccessTokenRef = useRef<string | null | undefined>(undefined);

  useLayoutEffect(() => {
    const publicDocumentAccessToken = TokenManager.getPublicDocumentAccessToken(documentId);
    if (!publicDocumentAccessToken) return undefined;

    const currentAccessToken = TokenManager.getAccessToken();
    if (currentAccessToken === publicDocumentAccessToken) return undefined;

    previousAccessTokenRef.current = currentAccessToken;
    TokenManager.setAccessToken(publicDocumentAccessToken);

    return () => {
      if (TokenManager.getAccessToken() !== publicDocumentAccessToken) {
        previousAccessTokenRef.current = undefined;
        return;
      }

      const previousAccessToken = previousAccessTokenRef.current;
      if (previousAccessToken) {
        TokenManager.setAccessToken(previousAccessToken);
      } else {
        TokenManager.clearAccessToken();
      }
      previousAccessTokenRef.current = undefined;
    };
  }, [documentId]);
}

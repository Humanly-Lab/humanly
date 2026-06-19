'use client';

import { useLayoutEffect, useRef } from 'react';

import { TokenManager } from '@/lib/api-client';

export function usePublicDocumentToken(documentId: string) {
  const previousAccessTokenRef = useRef<string | null | undefined>(undefined);

  useLayoutEffect(() => {
    const publicDocumentAccessToken = TokenManager.getPublicDocumentAccessToken(documentId);
    if (!publicDocumentAccessToken) return undefined;

    const currentAccessToken = TokenManager.getAccessToken();
    const storedPreviousAccessToken = TokenManager.getPublicDocumentPreviousAccessToken(documentId);
    const previousAccessToken =
      storedPreviousAccessToken
      || (currentAccessToken && currentAccessToken !== publicDocumentAccessToken
        ? currentAccessToken
        : null);

    previousAccessTokenRef.current = previousAccessToken;

    if (currentAccessToken !== publicDocumentAccessToken) {
      TokenManager.setAccessToken(publicDocumentAccessToken);
    }

    return () => {
      if (TokenManager.getAccessToken() !== publicDocumentAccessToken) {
        TokenManager.clearPublicDocumentPreviousAccessToken(documentId);
        previousAccessTokenRef.current = undefined;
        return;
      }

      const tokenToRestore = previousAccessTokenRef.current;
      if (tokenToRestore) {
        TokenManager.setAccessToken(tokenToRestore);
      }

      TokenManager.clearPublicDocumentPreviousAccessToken(documentId);
      previousAccessTokenRef.current = undefined;
    };
  }, [documentId]);
}

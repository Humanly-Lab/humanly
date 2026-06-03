'use client';

import { useEffect, useState } from 'react';
import { Github, Loader2 } from 'lucide-react';
import { api, getApiUrl } from '@/lib/api-client';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

type OAuthProvidersResponse = {
  success: boolean;
  data: {
    providers: {
      google: boolean;
      github: boolean;
    };
  };
};

export function OAuthButtons({
  next = '/tasks',
  className,
  separatorPosition = 'before',
  separatorLabel = 'or continue with',
}: {
  next?: string;
  className?: string;
  separatorPosition?: 'before' | 'after';
  separatorLabel?: string;
}) {
  const [providers, setProviders] = useState({ google: false, github: false });
  const [loadingProvider, setLoadingProvider] = useState<'google' | 'github' | null>(null);

  useEffect(() => {
    let mounted = true;
    api
      .get<OAuthProvidersResponse>('/api/v1/auth/oauth/providers')
      .then((response) => {
        if (mounted) {
          setProviders(response.data.providers);
        }
      })
      .catch(() => {
        if (mounted) {
          setProviders({ google: false, github: false });
        }
      });

    return () => {
      mounted = false;
    };
  }, []);

  const enabledProviders = [
    providers.google && 'google',
    providers.github && 'github',
  ].filter(Boolean) as Array<'google' | 'github'>;

  if (enabledProviders.length === 0) {
    return null;
  }

  const startLogin = (provider: 'google' | 'github') => {
    setLoadingProvider(provider);
    const params = new URLSearchParams({
      role: 'admin',
      next,
    });
    window.location.href = getApiUrl(`/api/v1/auth/oauth/${provider}/start?${params.toString()}`);
  };

  const separator = (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-border/80" />
      <span className="text-xs text-muted-foreground">{separatorLabel}</span>
      <div className="h-px flex-1 bg-border/80" />
    </div>
  );

  return (
    <div className={cn('space-y-3', className)}>
      {separatorPosition === 'before' && separator}
      <div className="grid gap-2 sm:grid-cols-2">
        {providers.google && (
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full border-border/80 bg-white/80 font-bold hover:bg-muted/60"
            onClick={() => startLogin('google')}
            disabled={loadingProvider !== null}
          >
            {loadingProvider === 'google' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <span className="mr-2 font-sans text-base font-bold">G</span>
            )}
            Google
          </Button>
        )}

        {providers.github && (
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-full border-border/80 bg-white/80 font-bold hover:bg-muted/60"
            onClick={() => startLogin('github')}
            disabled={loadingProvider !== null}
          >
            {loadingProvider === 'github' ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Github className="mr-2 h-4 w-4" />
            )}
            GitHub
          </Button>
        )}
      </div>
      {separatorPosition === 'after' && separator}
    </div>
  );
}

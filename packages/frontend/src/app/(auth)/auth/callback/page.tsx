'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import { TokenManager } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

export default function OAuthCallbackPage() {
  const router = useRouter();
  const fetchUser = useAuthStore((state) => state.fetchUser);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    const oauthError = params.get('error');
    const accessToken = params.get('accessToken');
    const next = params.get('next') || '/tasks';
    const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : '/tasks';

    if (oauthError) {
      setError(oauthError);
      return;
    }

    if (!accessToken) {
      setError('OAuth login did not return an access token.');
      return;
    }

    TokenManager.setAccessToken(accessToken);
    fetchUser()
      .then(() => {
        router.replace(safeNext);
      })
      .catch(() => {
        TokenManager.clearTokens();
        setError('OAuth login succeeded, but Humanly could not load the account.');
      });
  }, [fetchUser, router]);

  return (
    <Card>
      <CardHeader className="text-center">
        <CardTitle>Signing you in</CardTitle>
        <CardDescription>
          Humanly Admin is finishing the secure provider handoff.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {error ? (
          <div className="space-y-4">
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Login failed</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
            <Button asChild className="h-11 w-full rounded-full font-bold">
              <Link href="/login">Back to sign in</Link>
            </Button>
          </div>
        ) : (
          <div className="flex items-center justify-center gap-3 py-8 text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" />
            <span>Completing login...</span>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

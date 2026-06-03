'use client';

import { useEffect, useState, Suspense } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

type VerificationState = 'idle' | 'loading' | 'success' | 'error';

export default function VerifyEmailPage() {
  return (
    <Suspense fallback={<div className="w-full flex justify-center"><Loader2 className="h-8 w-8 animate-spin" /></div>}>
      <VerifyEmailContent />
    </Suspense>
  );
}

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { verifyEmail, resendVerificationEmail, user } = useAuthStore();
  const [state, setState] = useState<VerificationState>('idle');
  const [code, setCode] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string>('');
  const [verifyLoading, setVerifyLoading] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');

  const emailParam = searchParams.get('email');

  useEffect(() => {
    // Get email from URL param, user state, or localStorage
    const email = emailParam || user?.email || (typeof window !== 'undefined' ? localStorage.getItem('pendingVerificationEmail') : null);
    if (email) {
      setUserEmail(email);
    }
  }, [emailParam, user?.email]);

  const handleVerifyCode = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!code || code.length !== 6) {
      setErrorMessage('Please enter a valid 6-digit code');
      return;
    }

    try {
      setVerifyLoading(true);
      setErrorMessage('');
      setState('loading');
      
      await verifyEmail(code);
      
      setState('success');
      // Clear pending email from localStorage on success
      if (typeof window !== 'undefined') {
        localStorage.removeItem('pendingVerificationEmail');
      }
      
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (error: any) {
      setState('error');
      const message = error?.message || 'Verification failed';
      
      if (message.toLowerCase().includes('expired')) {
        setErrorMessage('Your verification code has expired. Please request a new one.');
      } else if (message.toLowerCase().includes('invalid')) {
        setErrorMessage('Invalid verification code. Please check and try again.');
      } else {
        setErrorMessage(message);
      }
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleResend = async () => {
    if (!userEmail) {
      setErrorMessage('Email address is required. Please go back to the registration page.');
      return;
    }

    try {
      setResendLoading(true);
      setResendSuccess(false);
      await resendVerificationEmail(userEmail);
      setResendSuccess(true);
    } catch (error: any) {
      setErrorMessage(error?.message || 'Failed to resend verification email');
    } finally {
      setResendLoading(false);
    }
  };

  const handleCodeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.replace(/\D/g, '').slice(0, 6);
    setCode(value);
    if (errorMessage) setErrorMessage('');
  };

  const renderContent = () => {
    if (state === 'loading') {
      return (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900">
              <Loader2 className="h-6 w-6 animate-spin text-blue-600 dark:text-blue-400" />
            </div>
            <CardTitle>Verifying Your Email</CardTitle>
            <CardDescription>
              Please wait while we verify your email address...
            </CardDescription>
          </CardHeader>
        </Card>
      );
    }

    if (state === 'success') {
      return (
        <Card>
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-green-100 dark:bg-green-900">
              <CheckCircle2 className="h-6 w-6 text-green-600 dark:text-green-400" />
            </div>
            <CardTitle>Email Verified!</CardTitle>
            <CardDescription>
              Your email has been successfully verified.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Alert>
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Success</AlertTitle>
              <AlertDescription>
                Your account is now verified and ready to use. Redirecting to login...
              </AlertDescription>
            </Alert>
          </CardContent>
          <CardFooter className="flex flex-col gap-2">
            <Button asChild className="w-full">
              <Link href="/login">Continue to Login</Link>
            </Button>
          </CardFooter>
        </Card>
      );
    }

    // Default: show verification code input form (for idle and error states)
    return (
      <Card>
        <CardHeader>
          <CardTitle>Verify Your Email</CardTitle>
          <CardDescription>
            Enter the 6-digit code sent to {userEmail || 'your email'}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleVerifyCode} className="space-y-4">
            {errorMessage && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{errorMessage}</AlertDescription>
              </Alert>
            )}

            {resendSuccess && (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertTitle>Code Sent</AlertTitle>
                <AlertDescription>
                  A new verification code has been sent to your email.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="code">Verification Code</Label>
              <Input
                id="code"
                type="text"
                inputMode="numeric"
                placeholder="000000"
                value={code}
                onChange={handleCodeChange}
                maxLength={6}
                className="text-center text-2xl tracking-widest"
                autoComplete="one-time-code"
                autoFocus
              />
              <p className="text-sm text-muted-foreground">
                Enter the 6-digit code from your email
              </p>
            </div>

            <Button
              type="submit"
              className="w-full"
              disabled={verifyLoading || code.length !== 6}
            >
              {verifyLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Verifying...
                </>
              ) : (
                'Verify Email'
              )}
            </Button>
          </form>
        </CardContent>
        <CardFooter className="flex flex-col gap-2">
          <div className="text-sm text-muted-foreground text-center">
            Did not receive the code?
          </div>
          <Button
            onClick={handleResend}
            disabled={resendLoading || resendSuccess || !userEmail}
            variant="outline"
            className="w-full"
          >
            {resendLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : (
              'Resend Code'
            )}
          </Button>
          <Button asChild variant="ghost" className="w-full">
            <Link href="/login">Back to Login</Link>
          </Button>
        </CardFooter>
      </Card>
    );
  };

  return (
    <div className="w-full">
      {renderContent()}
    </div>
  );
}

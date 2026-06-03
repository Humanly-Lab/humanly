'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Mail, Loader2, CheckCircle2, ArrowLeft } from 'lucide-react';
import { useAuthStore } from '@/stores/auth-store';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';

export default function CheckEmailPage() {
  const searchParams = useSearchParams();
  const { resendVerificationEmail } = useAuthStore();
  const [email, setEmail] = useState<string>('');
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [resendError, setResendError] = useState<string>('');

  useEffect(() => {
    // Get email from URL params if available
    const emailParam = searchParams.get('email');
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  const handleResend = async () => {
    try {
      setResendLoading(true);
      setResendSuccess(false);
      setResendError('');
      await resendVerificationEmail();
      setResendSuccess(true);
    } catch (error: any) {
      setResendError(error?.message || 'Failed to resend verification email. Please try again.');
    } finally {
      setResendLoading(false);
    }
  };

  return (
    <div className="w-full">
      <Card>
        <CardHeader className="text-center">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-lg border border-border/70 bg-muted/40">
            <Mail className="h-7 w-7 text-accent" />
          </div>
          <CardTitle>Check Your Email</CardTitle>
          <CardDescription>
            We have sent you a verification code
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          <div className="text-center space-y-2">
            {email ? (
              <p className="text-sm text-muted-foreground">
                We sent a 6-digit verification code to:
                <br />
                <span className="font-medium text-foreground">{email}</span>
              </p>
            ) : (
              <p className="text-sm text-muted-foreground">
                We sent a 6-digit verification code to your registered email address.
              </p>
            )}
          </div>

          <Alert>
            <Mail className="h-4 w-4" />
            <AlertTitle>Next Steps</AlertTitle>
            <AlertDescription>
              <ol className="list-decimal list-inside space-y-1 mt-2">
                <li>Open the email we sent you</li>
                <li>Find the 6-digit verification code</li>
                <li>Enter the code on the verification page</li>
              </ol>
            </AlertDescription>
          </Alert>

          {resendSuccess && (
            <Alert variant="success">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Code Sent!</AlertTitle>
              <AlertDescription>
                A new verification code has been sent to your email. Please check your inbox and spam folder.
              </AlertDescription>
            </Alert>
          )}

          {resendError && (
            <Alert variant="destructive">
              <AlertTitle>Error</AlertTitle>
              <AlertDescription>{resendError}</AlertDescription>
            </Alert>
          )}

          <div className="rounded-lg border border-border/70 bg-muted/35 p-4 text-sm text-muted-foreground">
            <p className="font-medium mb-2">Did not receive the code?</p>
            <ul className="space-y-1 list-disc list-inside">
              <li>Check your spam or junk folder</li>
              <li>Make sure {email || 'your email address'} is correct</li>
              <li>Wait a few minutes for the email to arrive</li>
              <li>Request a new verification code below</li>
            </ul>
          </div>
        </CardContent>

        <CardFooter className="flex flex-col gap-2">
          <Button
            onClick={handleResend}
            disabled={resendLoading || resendSuccess}
            variant="outline"
            className="w-full"
          >
            {resendLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Sending...
              </>
            ) : resendSuccess ? (
              <>
                <CheckCircle2 className="mr-2 h-4 w-4" />
                Code Sent
              </>
            ) : (
              'Resend Verification Code'
            )}
          </Button>

          <Button asChild variant="ghost" className="w-full">
            <Link href="/login">
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Login
            </Link>
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/stores/auth-store';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Lock, ArrowLeft, CheckCircle2, AlertCircle, Loader2, Eye, EyeOff } from 'lucide-react';

// Form validation schema
const resetPasswordSchema = z.object({
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must not exceed 128 characters'),
  confirmPassword: z.string(),
}).refine((data) => data.password === data.confirmPassword, {
  message: "Passwords don't match",
  path: ['confirmPassword'],
});

type ResetPasswordForm = z.infer<typeof resetPasswordSchema>;
type ResetLinkStatus = 'checking' | 'valid' | 'invalid';

function ResetPasswordContent() {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [linkError, setLinkError] = useState<string | null>(null);
  const [linkStatus, setLinkStatus] = useState<ResetLinkStatus>('checking');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const { resetPassword, validatePasswordResetToken, isLoading } = useAuthStore();
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');
  const cardTitle = success
    ? 'Password updated'
    : linkStatus === 'checking'
      ? 'Checking reset link'
      : linkStatus === 'invalid'
        ? 'Reset link unavailable'
        : 'Set new password';
  const cardDescription = success
    ? 'You can use the new password the next time you sign in.'
    : linkStatus === 'checking'
      ? 'Humanly is confirming this reset link before showing the password form.'
      : linkStatus === 'invalid'
        ? 'This link is invalid or expired. Request a fresh reset link to continue.'
        : 'Enter your new password below. Make sure it is at least 8 characters long.';

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ResetPasswordForm>({
    resolver: zodResolver(resetPasswordSchema),
  });

  const canResetPassword = linkStatus === 'valid' && Boolean(token);

  // Verify token with the backend before showing an enabled reset form.
  useEffect(() => {
    let isCurrent = true;

    if (!token) {
      setLinkStatus('invalid');
      setLinkError('Invalid or missing reset token. Please request a new password reset.');
      return;
    }

    setLinkStatus('checking');
    setLinkError(null);
    setError(null);

    validatePasswordResetToken(token)
      .then(() => {
        if (!isCurrent) return;
        setLinkStatus('valid');
        setLinkError(null);
      })
      .catch((err: any) => {
        if (!isCurrent) return;
        setLinkStatus('invalid');
        setLinkError(
          err?.message ||
          'This reset link is invalid or has expired. Please request a new one.'
        );
      });

    return () => {
      isCurrent = false;
    };
  }, [token, validatePasswordResetToken]);

  const onSubmit = async (data: ResetPasswordForm) => {
    if (!canResetPassword || !token) {
      setError('This reset link is invalid or has expired. Please request a new one.');
      return;
    }

    try {
      setError(null);
      setSuccess(false);
      await resetPassword(token, data.password);
      setSuccess(true);
      // Redirect to login after 2 seconds
      setTimeout(() => {
        router.push('/login');
      }, 2000);
    } catch (err: any) {
      setError(
        err?.message ||
        'Failed to reset password. The reset link may have expired. Please request a new one.'
      );
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>{cardTitle}</CardTitle>
        <CardDescription>{cardDescription}</CardDescription>
      </CardHeader>

      <CardContent>
        {success ? (
          <Alert variant="success">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Password reset successful</AlertTitle>
            <AlertDescription>
              Your password has been reset successfully. Redirecting to login...
            </AlertDescription>
          </Alert>
        ) : (
          <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {linkStatus === 'checking' && (
              <Alert>
                <Loader2 className="h-4 w-4 animate-spin" />
                <AlertTitle>Checking reset link</AlertTitle>
                <AlertDescription>
                  Hang tight while Humanly confirms this password reset link is still valid.
                </AlertDescription>
              </Alert>
            )}

            {linkStatus === 'invalid' && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Reset link unavailable</AlertTitle>
                <AlertDescription>
                  {linkError || 'This reset link is invalid or has expired.'}{' '}
                  <Link href="/forgot-password" className="font-medium underline">
                    Request a new reset link
                  </Link>
                </AlertDescription>
              </Alert>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {canResetPassword && (
              <>
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="password"
                      type={showPassword ? 'text' : 'password'}
                      placeholder="Enter new password"
                      className="pl-10 pr-10"
                      disabled={isLoading}
                      {...register('password')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                      disabled={isLoading}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {errors.password && (
                    <p className="text-sm text-destructive">{errors.password.message}</p>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Must be 8-128 characters long
                  </p>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="confirmPassword">Confirm new password</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input
                      id="confirmPassword"
                      type={showConfirmPassword ? 'text' : 'password'}
                      placeholder="Confirm new password"
                      className="pl-10 pr-10"
                      disabled={isLoading}
                      {...register('confirmPassword')}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                      className="absolute right-3 top-3 text-muted-foreground hover:text-foreground"
                      disabled={isLoading}
                    >
                      {showConfirmPassword ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                  {errors.confirmPassword && (
                    <p className="text-sm text-destructive">{errors.confirmPassword.message}</p>
                  )}
                </div>

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Resetting password...
                    </>
                  ) : (
                    'Reset password'
                  )}
                </Button>
              </>
            )}
          </form>
        )}
      </CardContent>

      <CardFooter className="flex justify-center">
        <Link
          href="/login"
          className="inline-flex items-center text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to login
        </Link>
      </CardFooter>
    </Card>
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-8 w-8 animate-spin" />
        </CardContent>
      </Card>
    }>
      <ResetPasswordContent />
    </Suspense>
  );
}

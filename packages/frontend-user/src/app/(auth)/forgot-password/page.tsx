'use client';

import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Mail, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { AuthBackLink, AuthCard } from '@/components/auth/auth-card';

// Form validation schema
const forgotPasswordSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
});

type ForgotPasswordForm = z.infer<typeof forgotPasswordSchema>;

export default function ForgotPasswordPage() {
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { forgotPassword, isLoading } = useAuthStore();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<ForgotPasswordForm>({
    resolver: zodResolver(forgotPasswordSchema),
  });

  const onSubmit = async (data: ForgotPasswordForm) => {
    try {
      setError(null);
      setSuccess(false);
      await forgotPassword(data.email);
      setSuccess(true);
    } catch (err: any) {
      setError(err?.message || 'Failed to send reset email. Please try again.');
    }
  };

  return (
    <AuthCard
      title={success ? 'Check your email' : 'Reset your password'}
      description={
        success
          ? 'If this address belongs to a Humanly account, a reset link is on its way.'
          : 'Enter the email you use for Humanly. We will send a secure reset link if the account exists.'
      }
      footer={<AuthBackLink href="/login">Back to login</AuthBackLink>}
    >
        {success ? (
          <div className="space-y-4">
            <Alert variant="success">
              <CheckCircle2 className="h-4 w-4" />
              <AlertTitle>Reset link requested</AlertTitle>
              <AlertDescription>
                Look for the subject Reset Your Password - Humanly. It contains
                a reset link, not a verification code.
              </AlertDescription>
            </Alert>
            <p className="rounded-lg border border-border/80 bg-muted/40 p-4 text-sm leading-6 text-muted-foreground">
              Check your inbox and spam folder. For security, this page shows the
              same message whether or not the email is registered.
            </p>
          </div>
        ) : (
          <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="email">Email address</Label>
              <div className="relative">
                <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  className="h-11 rounded-lg bg-background/70 pl-10"
                  disabled={isLoading}
                  {...register('email')}
                />
              </div>
              {errors.email && (
                <p className="text-sm text-destructive">{errors.email.message}</p>
              )}
            </div>

            <Button
              type="submit"
              className="h-11 w-full rounded-full font-bold"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Sending...
                </>
              ) : (
                'Send reset link'
              )}
            </Button>
          </form>
        )}
    </AuthCard>
  );
}

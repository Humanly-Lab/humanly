'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import Link from 'next/link';
import { useAuthStore } from '@/stores/auth-store';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { OAuthButtons } from '@/components/auth/oauth-buttons';
import { Mail, Lock, AlertCircle, Loader2, CheckCircle2 } from 'lucide-react';

// Form validation schema
const loginSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [showResendVerification, setShowResendVerification] = useState(false);
  const [resendLoading, setResendLoading] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);
  const [userEmail, setUserEmail] = useState<string>('');
  const { login, resendVerificationEmail, isLoading } = useAuthStore();
  const verificationHref = userEmail
    ? `/verify-email?email=${encodeURIComponent(userEmail)}`
    : '/verify-email';

  const {
    register,
    handleSubmit,
    formState: { errors },
    clearErrors,
  } = useForm<LoginForm>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = async (data: LoginForm) => {
    try {
      setError(null);
      setShowResendVerification(false);
      setResendSuccess(false);
      setUserEmail(data.email);
      
      await login(data.email, data.password, 'admin');

      // Redirect to tasks on success
      router.push('/tasks');
    } catch (err: any) {
      const errorMessage = err?.message || 'Login failed. Please check your credentials and try again.';
      setError(errorMessage);
      
      // Check if error is about unverified email
      if (errorMessage.toLowerCase().includes('verify') || errorMessage.toLowerCase().includes('verification')) {
        setShowResendVerification(true);
      }
    }
  };

  const handleResendVerification = async () => {
    try {
      setResendLoading(true);
      setResendSuccess(false);
      await resendVerificationEmail(userEmail);
      if (typeof window !== 'undefined') {
        localStorage.setItem('pendingVerificationEmail', userEmail);
      }
      setResendSuccess(true);
      setError('Verification email sent! Please check your inbox.');
      setShowResendVerification(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to resend verification email');
    } finally {
      setResendLoading(false);
    }
  };

  // Clear errors when user starts typing
  const handleInputChange = () => {
    if (error) {
      setError(null);
      setShowResendVerification(false);
      setResendSuccess(false);
    }
    clearErrors();
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Welcome back</CardTitle>
        <CardDescription>
          Sign in to your account to continue
        </CardDescription>
      </CardHeader>

      <CardContent>
        <OAuthButtons
          className="mb-5"
          separatorPosition="after"
          separatorLabel="or use email"
        />
        <form method="post" onSubmit={handleSubmit(onSubmit)} className="space-y-4">
          {error && (
            <Alert variant={resendSuccess ? "default" : "destructive"}>
              {resendSuccess ? (
                <CheckCircle2 className="h-4 w-4" />
              ) : (
                <AlertCircle className="h-4 w-4" />
              )}
              <AlertTitle>{resendSuccess ? "Success" : "Error"}</AlertTitle>
              <AlertDescription>
                {error}
                {resendSuccess && (
                  <Button asChild variant="outline" size="sm" className="mt-3 w-full">
                    <Link href={verificationHref}>Enter verification code</Link>
                  </Button>
                )}
              </AlertDescription>
            </Alert>
          )}

          {showResendVerification && !resendSuccess && (
            <Alert>
              <Mail className="h-4 w-4" />
              <AlertTitle>Email Not Verified</AlertTitle>
              <AlertDescription className="space-y-3">
                <p>Please verify your email address before logging in.</p>
                <Button
                  type="button"
                  onClick={handleResendVerification}
                  disabled={resendLoading}
                  variant="outline"
                  size="sm"
                  className="w-full mt-2"
                >
                  {resendLoading ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Sending...
                    </>
                  ) : (
                    <>
                      <Mail className="mr-2 h-4 w-4" />
                      Resend Verification Email
                    </>
                  )}
                </Button>
              </AlertDescription>
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
                className="pl-10"
                disabled={isLoading}
                {...register('email')}
                onChange={(e) => {
                  register('email').onChange(e);
                  handleInputChange();
                }}
              />
            </div>
            {errors.email && (
              <p className="text-sm text-destructive">{errors.email.message}</p>
            )}
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="password">Password</Label>
              <Link
                href="/forgot-password"
                className="text-sm text-primary hover:underline"
              >
                Forgot password?
              </Link>
            </div>
            <div className="relative">
              <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
              <Input
                id="password"
                type="password"
                placeholder="Enter your password"
                className="pl-10"
                disabled={isLoading}
                {...register('password')}
                onChange={(e) => {
                  register('password').onChange(e);
                  handleInputChange();
                }}
              />
            </div>
            {errors.password && (
              <p className="text-sm text-destructive">{errors.password.message}</p>
            )}
          </div>

          <Button type="submit" className="w-full" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Signing in...
              </>
            ) : (
              'Sign in'
            )}
          </Button>
        </form>
      </CardContent>

      <CardFooter className="flex flex-col items-center gap-3">
        <p className="text-sm text-muted-foreground">
          Do not have an account?{' '}
          <Link
            href="/register"
            className="font-medium text-primary hover:underline"
          >
            Sign up
          </Link>
        </p>
        <p className="text-center text-xs text-muted-foreground">
          By signing in, you agree to our{' '}
          <Link
            href="https://app.writehumanly.net/terms"
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-foreground"
          >
            Terms of Service
          </Link>
        </p>
      </CardFooter>
    </Card>
  );
}

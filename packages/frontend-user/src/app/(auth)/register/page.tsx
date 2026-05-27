'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { Eye, EyeOff, CheckCircle2, AlertCircle, Loader2 } from 'lucide-react';
import { getBrandText } from '@humanly/shared';

import { useAuthStore } from '@/stores/auth-store';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { OAuthButtons } from '@/components/auth/oauth-buttons';

// Form validation schema
const registerSchema = z
  .object({
    name: z
      .string()
      .min(1, 'User name is required')
      .max(100, 'User name must be less than 100 characters'),
    email: z
      .string()
      .min(1, 'Email is required')
      .email('Please enter a valid email address'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be less than 128 characters')
      .regex(
        /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/,
        'Password must contain at least one uppercase letter, one lowercase letter, and one number'
      ),
    confirmPassword: z.string().min(1, 'Please confirm your password'),
    acceptTerms: z.boolean().refine((val) => val === true, {
      message: 'You must accept the terms and conditions',
    }),
  })
  .refine((data) => data.password === data.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

type RegisterFormValues = z.infer<typeof registerSchema>;

// Password strength indicator
function getPasswordStrength(password: string): {
  strength: number;
  label: string;
  color: string;
} {
  if (!password) return { strength: 0, label: '', color: '' };

  let strength = 0;

  // Length check
  if (password.length >= 8) strength += 1;
  if (password.length >= 12) strength += 1;

  // Character variety checks
  if (/[a-z]/.test(password)) strength += 1;
  if (/[A-Z]/.test(password)) strength += 1;
  if (/\d/.test(password)) strength += 1;
  if (/[^a-zA-Z\d]/.test(password)) strength += 1;

  // Normalize to 0-3 scale
  const normalizedStrength = Math.min(Math.floor(strength / 2), 3);

  const labels = ['', 'Weak', 'Medium', 'Strong'];
  const colors = ['', 'bg-destructive/70', 'bg-[#d6bba8]', 'bg-[#6f8a78]'];

  return {
    strength: normalizedStrength,
    label: labels[normalizedStrength],
    color: colors[normalizedStrength],
  };
}

export default function RegisterPage() {
  const router = useRouter();
  const register = useAuthStore((state) => state.register);
  const isLoading = useAuthStore((state) => state.isLoading);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [registrationSuccess, setRegistrationSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerSchema),
    defaultValues: {
      name: '',
      email: '',
      password: '',
      confirmPassword: '',
      acceptTerms: false,
    },
  });

  const watchPassword = form.watch('password');
  const passwordStrength = getPasswordStrength(watchPassword);

  async function onSubmit(values: RegisterFormValues) {
    try {
      setError(null);
      await register(values.email, values.password, values.name, 'user');
      setRegistrationSuccess(true);

      if (typeof window !== 'undefined') {
        localStorage.setItem('pendingVerificationEmail', values.email);
      }

      setTimeout(() => {
        router.push(`/verify-email?email=${encodeURIComponent(values.email)}`);
      }, 1200);
    } catch (err: any) {
      setError(err?.message || 'Registration failed. Please try again.');
    }
  }

  if (registrationSuccess) {
    return (
      <Card className="border-border bg-white shadow-none humanly-panel-shadow">
        <CardHeader>
          <CardTitle className="text-center text-2xl font-bold tracking-normal">
            Registration Successful!
          </CardTitle>
          <CardDescription className="text-center">
            Write with AI. Prove your process.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="success">
            <CheckCircle2 className="h-4 w-4" />
            <AlertTitle>Check your email</AlertTitle>
            <AlertDescription>
              We have sent a 6-digit verification code to your email.
              Please enter the code on the next page to verify your account.
            </AlertDescription>
          </Alert>
          <p className="text-sm text-center text-muted-foreground">
            Redirecting you to enter your verification code...
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border bg-white shadow-none humanly-panel-shadow">
      <CardHeader className="space-y-2 pb-2 text-center">
        <CardTitle className="text-2xl font-bold tracking-normal">
          Create an account
        </CardTitle>
        <CardDescription className="mx-auto max-w-sm text-sm leading-5">
          Enter your information to {getBrandText().createAccount}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <OAuthButtons
          className="mb-5"
          separatorPosition="after"
          separatorLabel="or use email"
        />
        <Form {...form}>
          <form method="post" onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Error</AlertTitle>
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>User name</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="John Doe"
                      className="h-11 rounded-lg"
                      {...field}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input
                      type="email"
                      placeholder="name@example.com"
                      className="h-11 rounded-lg"
                      {...field}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        placeholder="Enter your password"
                        className="h-11 rounded-lg pr-10"
                        {...field}
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        disabled={isLoading}
                      >
                        {showPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </FormControl>
                  {watchPassword && (
                    <div className="space-y-2">
                      <div className="flex gap-1 h-1">
                        {[1, 2, 3].map((level) => (
                          <div
                            key={level}
                            className={`flex-1 rounded-full transition-colors ${
                              level <= passwordStrength.strength
                                ? passwordStrength.color
                                : 'bg-muted'
                            }`}
                          />
                        ))}
                      </div>
                      {passwordStrength.label && (
                        <p className="text-xs text-muted-foreground">
                          Password strength: {passwordStrength.label}
                        </p>
                      )}
                    </div>
                  )}
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="confirmPassword"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Confirm Password</FormLabel>
                  <FormControl>
                    <div className="relative">
                      <Input
                        type={showConfirmPassword ? 'text' : 'password'}
                        placeholder="Confirm your password"
                        className="h-11 rounded-lg pr-10"
                        {...field}
                        disabled={isLoading}
                      />
                      <button
                        type="button"
                        onClick={() =>
                          setShowConfirmPassword(!showConfirmPassword)
                        }
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                        disabled={isLoading}
                      >
                        {showConfirmPassword ? (
                          <EyeOff className="h-4 w-4" />
                        ) : (
                          <Eye className="h-4 w-4" />
                        )}
                      </button>
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="acceptTerms"
              render={({ field }) => (
                <FormItem className="flex flex-row items-start space-x-3 space-y-0">
                  <FormControl>
                    <Checkbox
                      checked={field.value}
                      onCheckedChange={field.onChange}
                      disabled={isLoading}
                    />
                  </FormControl>
                  <div className="space-y-1 leading-none">
                    <FormLabel className="text-sm font-normal">
                      I agree to the{' '}
                      <Link
                        href="/terms"
                        className="text-primary hover:underline"
                        target="_blank"
                      >
                        Terms of Service
                      </Link>{' '}
                      and{' '}
                      <Link
                        href="/privacy"
                        className="text-primary hover:underline"
                        target="_blank"
                      >
                        Privacy Policy
                      </Link>
                    </FormLabel>
                    <FormMessage />
                  </div>
                </FormItem>
              )}
            />

            <Button
              type="submit"
              className="h-11 w-full rounded-full font-bold"
              disabled={isLoading}
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating account...
                </>
              ) : (
                'Create account'
              )}
            </Button>
          </form>
        </Form>
      </CardContent>
      <CardFooter className="flex flex-col space-y-4">
        <div className="text-sm text-center text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary hover:underline">
            Sign in
          </Link>
        </div>
      </CardFooter>
    </Card>
  );
}

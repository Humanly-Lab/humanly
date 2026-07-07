'use client';

import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';

import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { cn } from '@/lib/utils';

type AuthCardProps = {
  title: string;
  description?: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  className?: string;
};

export function AuthCard({
  title,
  description,
  children,
  footer,
  className,
}: AuthCardProps) {
  return (
    <Card
      className={cn(
        'border-border/80 bg-white/95 shadow-none humanly-panel-shadow',
        className
      )}
    >
      <CardHeader className="space-y-3 pb-5 text-center">
        <CardTitle className="text-2xl font-bold leading-tight tracking-normal">
          {title}
        </CardTitle>
        {description && (
          <CardDescription className="mx-auto max-w-[23rem] text-sm leading-6">
            {description}
          </CardDescription>
        )}
      </CardHeader>
      <CardContent>{children}</CardContent>
      {footer && (
        <CardFooter className="flex flex-col items-center gap-3 pt-5">
          {footer}
        </CardFooter>
      )}
    </Card>
  );
}

export function AuthBackLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="inline-flex items-center text-sm font-medium text-muted-foreground transition-colors hover:text-foreground"
    >
      <ArrowLeft className="mr-2 h-4 w-4" />
      {children}
    </Link>
  );
}

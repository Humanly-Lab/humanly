'use client';

import type { ReactNode } from 'react';
import { HelpCircle } from 'lucide-react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { cn } from '@/lib/utils';

export type AdminEnvironmentSummaryItem = {
  detail?: ReactNode;
  label: string;
  value: ReactNode;
};

export function AdminEnvironmentSectionHeading({
  description,
  title,
}: {
  description: string;
  title: string;
}) {
  return (
    <div className="space-y-1">
      <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export function AdminEnvironmentSummary({
  className,
  items,
}: {
  className?: string;
  items: AdminEnvironmentSummaryItem[];
}) {
  return (
    <div className={cn('grid gap-3 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {items.map((item) => (
        <div
          key={item.label}
          className="rounded-lg border border-border/70 bg-muted/25 p-3"
        >
          <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {item.label}
          </p>
          <p className="mt-1 text-sm font-medium">{item.value}</p>
          {item.detail && (
            <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
          )}
        </div>
      ))}
    </div>
  );
}

export function AdminEnvironmentDialogSection({
  children,
  className,
  description,
  title,
}: {
  children: ReactNode;
  className?: string;
  description: string;
  title: string;
}) {
  return (
    <section className={cn('space-y-4 rounded-lg border border-border/70 bg-card p-4', className)}>
      <AdminEnvironmentSectionHeading title={title} description={description} />
      {children}
    </section>
  );
}

export function AdminEnvironmentHelp({
  children,
  title,
}: {
  children: ReactNode;
  title: string;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Explain ${title}`}
          className="inline-flex h-4 w-4 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="space-y-2 text-sm">
        <p className="font-medium text-foreground">{title}</p>
        <p className="leading-relaxed text-muted-foreground">{children}</p>
      </PopoverContent>
    </Popover>
  );
}

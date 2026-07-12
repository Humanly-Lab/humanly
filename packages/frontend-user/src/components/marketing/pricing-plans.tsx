'use client';

import { useState } from 'react';
import { ArrowUpRight, Check } from 'lucide-react';
import { GITHUB_HREF } from '@/components/marketing/site-nav';
import { productAppHref } from '@/lib/app-origin';
import type { MarketingDict } from '@/lib/marketing-i18n';

type BillingCycle = 'monthly' | 'yearly';
type PlanKey = 'openSource' | 'free' | 'pro' | 'enterprise';
type PricingCopy = MarketingDict['pricing'];

const planOrder: readonly PlanKey[] = [
  'openSource',
  'free',
  'pro',
  'enterprise',
];

const planActions: Record<
  PlanKey,
  { href?: string; external?: boolean; disabled?: boolean }
> = {
  openSource: { href: GITHUB_HREF, external: true },
  free: { href: productAppHref('/register') },
  pro: { disabled: true },
  enterprise: { disabled: true },
};

export function PricingPlans({ copy }: { copy: PricingCopy }) {
  const [billingCycle, setBillingCycle] = useState<BillingCycle>('monthly');

  return (
    <div className="mt-10 sm:mt-12">
      <div
        aria-label={copy.billingCycleLabel}
        className="mx-auto grid w-full max-w-[260px] grid-cols-2 rounded-md border border-[var(--hly-hairline)] bg-[var(--hly-surface)] p-1"
        role="group"
      >
        {(['monthly', 'yearly'] as const).map((cycle) => (
          <button
            aria-pressed={billingCycle === cycle}
            className={`h-9 rounded-[5px] px-4 text-sm font-medium transition-colors ${
              billingCycle === cycle
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground'
            }`}
            key={cycle}
            onClick={() => setBillingCycle(cycle)}
            type="button"
          >
            {copy[cycle]}
          </button>
        ))}
      </div>

      <div className="mt-10 grid gap-5 md:grid-cols-2 xl:grid-cols-4">
        {planOrder.map((planKey) => (
          <PlanCard
            billingCycle={billingCycle}
            copy={copy}
            key={planKey}
            planKey={planKey}
          />
        ))}
      </div>
    </div>
  );
}

function PlanCard({
  billingCycle,
  copy,
  planKey,
}: {
  billingCycle: BillingCycle;
  copy: PricingCopy;
  planKey: PlanKey;
}) {
  const plan = copy.plans[planKey];
  const action = planActions[planKey];
  const actionClass = 'humanly-landing-btn min-w-[172px] justify-center';
  const period = planKey === 'free' ? copy.period[billingCycle] : null;
  const isComingSoon = planKey === 'pro' || planKey === 'enterprise';

  return (
    <article className="flex min-h-[510px] flex-col rounded-lg border border-[var(--hly-brand)] bg-background p-6 shadow-[0_22px_50px_-38px_rgba(35,32,25,0.4)] sm:p-7">
      <div>
        <span className="rounded-full bg-[var(--hly-surface)] px-2.5 py-1 text-[11px] font-medium text-muted-foreground">
          {plan.environment}
        </span>
      </div>

      <h2 className="mt-6 text-[24px] font-light leading-none tracking-[-0.02em]">
        {plan.name}
      </h2>
      <p className="mt-3 min-h-[72px] text-[13.5px] leading-[1.65] text-muted-foreground">
        {plan.description}
      </p>

      <div className="mt-5 flex min-h-[50px] items-end gap-2">
        <span
          className={`leading-none ${
            isComingSoon
              ? 'text-[24px] font-light text-muted-foreground'
              : 'text-[32px] font-light tracking-[-0.03em]'
          }`}
        >
          {plan.price}
        </span>
        {period ? (
          <span className="pb-0.5 text-xs text-muted-foreground">{period}</span>
        ) : null}
      </div>

      <ul className="mt-7 space-y-3.5">
        {plan.features.map((feature) => (
          <li
            className="flex gap-2.5 text-[13px] leading-[1.5] text-muted-foreground"
            key={feature}
          >
            <Check
              aria-hidden="true"
              className="mt-0.5 h-4 w-4 shrink-0 text-foreground"
              strokeWidth={1.8}
            />
            <span>{feature}</span>
          </li>
        ))}
      </ul>

      <div className="mt-auto flex justify-center pt-8">
        {action.href ? (
          <a
            className={actionClass}
            href={action.href}
            {...(action.external
              ? { target: '_blank', rel: 'noopener noreferrer' }
              : {})}
          >
            {plan.actionLabel}
            {action.external ? (
              <ArrowUpRight aria-hidden="true" className="h-4 w-4" />
            ) : null}
          </a>
        ) : (
          <button
            className={`${actionClass} cursor-not-allowed opacity-40`}
            disabled={action.disabled}
            type="button"
          >
            {plan.actionLabel}
          </button>
        )}
      </div>
    </article>
  );
}

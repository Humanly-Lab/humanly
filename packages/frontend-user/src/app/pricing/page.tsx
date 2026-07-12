import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { PricingPlans } from '@/components/marketing/pricing-plans';
import { SiteFooter } from '@/components/marketing/site-footer';
import { SiteNav } from '@/components/marketing/site-nav';
import {
  getMarketingDict,
  MARKETING_LOCALE_COOKIE,
  normalizeMarketingLocale,
} from '@/lib/marketing-i18n';

const getLocale = () =>
  normalizeMarketingLocale(cookies().get(MARKETING_LOCALE_COOKIE)?.value);

export function generateMetadata(): Metadata {
  const copy = getMarketingDict(getLocale()).pricing;

  return {
    title: copy.metaTitle,
    description: copy.metaDescription,
  };
}

export default function PricingPage() {
  const locale = getLocale();
  const copy = getMarketingDict(locale).pricing;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav locale={locale} />

      <section className="px-5 pb-16 pt-14 sm:px-8 sm:pb-20 sm:pt-20 lg:px-14">
        <div className="mx-auto max-w-[1240px]">
          <div className="text-center">
            <h1 className="text-[32px] font-light leading-[1.12] tracking-[-0.03em] sm:text-[44px]">
              {copy.title}
            </h1>
            <p className="mx-auto mt-5 max-w-[620px] text-[16px] leading-[1.7] text-muted-foreground sm:text-[18px]">
              {copy.subtitle}
            </p>
          </div>

          <PricingPlans copy={copy} />
        </div>
      </section>

      <SiteFooter locale={locale} />
    </main>
  );
}

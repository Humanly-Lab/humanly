import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { SiteNav, GITHUB_HREF } from '@/components/marketing/site-nav';
import { SiteFooter } from '@/components/marketing/site-footer';
import {
  MARKETING_LOCALE_COOKIE,
  getMarketingDict,
  normalizeMarketingLocale,
} from '@/lib/marketing-i18n';

export const metadata: Metadata = {
  title: 'Docs — Humanly',
  description: 'Humanly documentation.',
};

// Placeholder while the documentation site is being written.
export default function DocsPage() {
  const locale = normalizeMarketingLocale(
    cookies().get(MARKETING_LOCALE_COOKIE)?.value
  );
  const t = getMarketingDict(locale).docs;

  return (
    <main className="flex min-h-screen flex-col bg-background text-foreground">
      <SiteNav locale={locale} />

      <section className="flex flex-1 items-center px-5 py-24 sm:px-8 lg:px-14">
        <div className="mx-auto max-w-[720px] text-center">
          <p className="humanly-eyebrow">{t.eyebrow}</p>
          <h1 className="mt-4 text-[30px] font-light leading-[1.12] tracking-[-0.03em] sm:text-[40px]">
            {t.title}
          </h1>
          <p className="mx-auto mt-5 max-w-[480px] text-[15px] leading-[1.7] text-muted-foreground sm:text-[16px]">
            {t.body}
          </p>
          <div className="mt-8 flex justify-center">
            <a
              href={GITHUB_HREF}
              target="_blank"
              rel="noopener noreferrer"
              className="humanly-landing-btn-ghost justify-center"
            >
              {t.readme}
            </a>
          </div>
        </div>
      </section>

      <SiteFooter locale={locale} />
    </main>
  );
}

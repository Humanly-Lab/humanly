import Link from 'next/link';
import { Mail } from 'lucide-react';
import { HumanlyWordmark } from '@/components/brand/humanly-wordmark';
import { marketingHref, productAppHref } from '@/lib/app-origin';
import { GITHUB_HREF, SUPPORT_EMAIL } from '@/components/marketing/site-nav';
import { LanguageSwitcher } from '@/components/marketing/language-switcher';
import { getMarketingDict, type MarketingLocale } from '@/lib/marketing-i18n';

const fastDemoHref = productAppHref('/documents/new?demo=1');

/**
 * Marketing site footer shared by the landing, about, research, and docs pages.
 * Layout: wordmark + tagline left, three link columns right, then copyright +
 * language switcher + GitHub mark.
 */
export function SiteFooter({ locale = 'en' }: { locale?: MarketingLocale }) {
  const t = getMarketingDict(locale).footer;

  const footerColumns = [
    {
      heading: t.product,
      links: [
        { label: t.startWriting, href: productAppHref('/register') },
        { label: t.liveDemo, href: fastDemoHref },
        { label: t.pricing, href: marketingHref('/pricing') },
      ],
    },
    {
      heading: t.resources,
      links: [
        { label: t.github, href: GITHUB_HREF, external: true },
        { label: t.docs, href: marketingHref('/docs') },
        { label: t.blog, href: marketingHref('/research') },
        { label: t.help, href: `mailto:${SUPPORT_EMAIL}` },
      ],
    },
    {
      heading: t.company,
      links: [
        { label: t.about, href: marketingHref('/about') },
        { label: t.contact, href: `mailto:${SUPPORT_EMAIL}` },
        { label: t.privacy, href: '/privacy' },
        { label: t.terms, href: '/terms' },
      ],
    },
  ] as const;

  return (
    <footer className="border-t border-[var(--hly-hairline)] px-5 pb-9 pt-14 sm:px-8 lg:px-14">
      <div className="mx-auto max-w-[1168px]">
        <div className="grid gap-12 lg:grid-cols-[1.2fr_2fr] lg:gap-16">
          <div>
            <Link href={marketingHref('/')} className="inline-block">
              <HumanlyWordmark size="md" />
            </Link>
            <p className="mt-4 max-w-[300px] text-sm leading-[1.65] text-muted-foreground">
              {t.taglineLine1}
              <br />
              {t.taglineLine2}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-10 sm:grid-cols-3">
            {footerColumns.map(({ heading, links }) => (
              <div key={heading}>
                <h3 className="humanly-eyebrow">{heading}</h3>
                <ul className="mt-4 space-y-3">
                  {links.map((link) => (
                    <li key={link.label}>
                      <a
                        href={link.href}
                        {...('external' in link && link.external
                          ? { target: '_blank', rel: 'noopener noreferrer' }
                          : {})}
                        className="text-sm text-muted-foreground hover:text-foreground"
                      >
                        {link.label}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>

        <div className="mt-14 flex flex-wrap items-center justify-between gap-4">
          <p className="text-xs text-muted-foreground">{t.copyright}</p>
          <div className="flex items-center gap-4">
            <LanguageSwitcher locale={locale} />
            <a
              href={GITHUB_HREF}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="Humanly Lab on GitHub"
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <GitHubMark />
            </a>
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              aria-label={`Email Humanly at ${SUPPORT_EMAIL}`}
              className="text-muted-foreground transition-colors hover:text-foreground"
            >
              <Mail className="h-[18px] w-[18px]" strokeWidth={1.8} />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function GitHubMark() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 16 16"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82a7.5 7.5 0 0 1 2-.27c.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
    </svg>
  );
}

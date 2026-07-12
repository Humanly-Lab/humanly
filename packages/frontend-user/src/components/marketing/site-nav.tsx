import Link from 'next/link';
import { ChevronDown } from 'lucide-react';
import { HumanlyWordmark } from '@/components/brand/humanly-wordmark';
import { MobileNav } from '@/components/marketing/mobile-nav';
import { marketingHref, productAppHref } from '@/lib/app-origin';
import { getMarketingDict, type MarketingLocale } from '@/lib/marketing-i18n';

export const GITHUB_HREF = 'https://github.com/Humanly-Lab/humanly';
export const SUPPORT_EMAIL = 'support@writehumanly.net';

/**
 * Marketing site header shared by the landing, about, research, and docs pages.
 * The Resources dropdown is CSS-only (group-hover) so the whole nav stays a
 * server component.
 */
export function SiteNav({
  homeAnchors = false,
  locale = 'en',
}: {
  homeAnchors?: boolean;
  locale?: MarketingLocale;
}) {
  const t = getMarketingDict(locale).nav;
  const learnMoreHref = homeAnchors
    ? '#learn-more'
    : marketingHref('/#learn-more');

  const resourceLinks = [
    { label: t.docs, href: marketingHref('/docs'), external: false },
    { label: t.github, href: GITHUB_HREF, external: true },
    { label: t.help, href: `mailto:${SUPPORT_EMAIL}`, external: false },
    { label: t.about, href: marketingHref('/about'), external: false },
  ] as const;

  return (
    <header className="grid grid-cols-[1fr_auto] items-center bg-background px-5 py-2.5 sm:px-8 lg:grid-cols-[1fr_auto_1fr] lg:px-14 lg:py-3">
      <Link href={marketingHref('/')} className="justify-self-start">
        <HumanlyWordmark
          size="md"
          className="max-[380px]:text-xl max-[380px]:[&_img]:h-9 max-[380px]:[&_img]:w-9"
        />
      </Link>

      <nav className="hidden items-center gap-8 text-sm font-medium text-muted-foreground lg:flex">
        <a href={learnMoreHref} className="hover:text-foreground">
          {t.learnMore}
        </a>
        <Link href={marketingHref('/pricing')} className="hover:text-foreground">
          {t.pricing}
        </Link>
        <Link
          href={marketingHref('/research')}
          className="hover:text-foreground"
        >
          {t.blog}
        </Link>
        <div className="group relative">
          <button
            type="button"
            className="inline-flex items-center gap-1 hover:text-foreground"
          >
            {t.resources}
            <ChevronDown
              className="h-3.5 w-3.5 transition-transform group-hover:rotate-180"
              strokeWidth={2}
            />
          </button>
          {/* Invisible hover bridge keeps the dropdown open while the cursor
              travels from the trigger to the panel. */}
          <div className="invisible absolute left-1/2 top-full z-50 -translate-x-1/2 pt-3 opacity-0 transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100">
            <div className="w-44 rounded-lg border border-[var(--hly-hairline)] bg-background p-1.5 shadow-[0_18px_44px_-20px_rgba(35,32,25,0.35)]">
              {resourceLinks.map(({ label, href, external }) => (
                <a
                  key={label}
                  href={href}
                  {...(external
                    ? { target: '_blank', rel: 'noopener noreferrer' }
                    : {})}
                  className="flex items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
                >
                  {label}
                  {external ? (
                    <span aria-hidden="true" className="text-xs">
                      ↗
                    </span>
                  ) : null}
                </a>
              ))}
            </div>
          </div>
        </div>
      </nav>

      <div className="flex items-center gap-2 justify-self-end sm:gap-3">
        <Link
          href={productAppHref('/login')}
          className="hidden h-8 items-center text-sm font-medium text-muted-foreground hover:text-foreground sm:inline-flex"
        >
          {t.logIn}
        </Link>
        <Link
          href={productAppHref('/register')}
          className="humanly-landing-btn h-8 px-3 py-0 text-sm"
        >
          {t.signUp}
        </Link>
        <MobileNav
          menuLabel={t.resources}
          links={[
            { label: t.learnMore, href: learnMoreHref },
            { label: t.pricing, href: marketingHref('/pricing') },
            { label: t.blog, href: marketingHref('/research') },
            ...resourceLinks.map(({ label, href, external }) => ({
              label,
              href,
              external,
            })),
          ]}
          authLinks={[{ label: t.logIn, href: productAppHref('/login') }]}
        />
      </div>
    </header>
  );
}

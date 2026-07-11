'use client';

import { useRouter } from 'next/navigation';
import { Check, ChevronDown, Globe } from 'lucide-react';
import {
  MARKETING_LOCALES,
  MARKETING_LOCALE_COOKIE,
  type MarketingLocale,
} from '@/lib/marketing-i18n';

/**
 * Footer language selector. Persists the choice in a cookie and refreshes the
 * route so the server re-renders marketing pages in the selected language.
 */
export function LanguageSwitcher({ locale }: { locale: MarketingLocale }) {
  const router = useRouter();
  const currentLabel =
    MARKETING_LOCALES.find((entry) => entry.code === locale)?.label ??
    'English';

  const chooseLocale = (code: MarketingLocale) => {
    document.cookie = `${MARKETING_LOCALE_COOKIE}=${code}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };

  return (
    <div className="group relative">
      <button
        type="button"
        className="inline-flex items-center gap-1.5 rounded-md border border-[var(--hly-hairline)] px-3 py-1.5 text-xs font-medium text-muted-foreground hover:bg-secondary hover:text-foreground"
      >
        <Globe className="h-3.5 w-3.5" strokeWidth={1.8} />
        {currentLabel}
        <ChevronDown
          className="h-3 w-3 transition-transform group-hover:rotate-180"
          strokeWidth={2}
        />
      </button>
      <div className="invisible absolute bottom-full right-0 z-50 pb-2 opacity-0 transition-[opacity,visibility] duration-150 group-hover:visible group-hover:opacity-100">
        <div className="w-40 rounded-lg border border-[var(--hly-hairline)] bg-background p-1.5 shadow-[0_18px_44px_-20px_rgba(35,32,25,0.35)]">
          {MARKETING_LOCALES.map(({ code, label }) => (
            <button
              key={code}
              type="button"
              onClick={() => chooseLocale(code)}
              className="flex w-full items-center justify-between rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary hover:text-foreground"
            >
              {label}
              {code === locale ? (
                <Check className="h-3.5 w-3.5" strokeWidth={2} />
              ) : null}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

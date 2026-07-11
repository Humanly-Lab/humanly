import type { Metadata } from 'next';
import Image from 'next/image';
import { cookies } from 'next/headers';
import { ArrowUpRight } from 'lucide-react';
import { SiteNav, SUPPORT_EMAIL } from '@/components/marketing/site-nav';
import { SiteFooter } from '@/components/marketing/site-footer';
import { BlurFade } from '@/components/magicui/blur-fade';
import {
  MARKETING_LOCALE_COOKIE,
  getMarketingDict,
  normalizeMarketingLocale,
} from '@/lib/marketing-i18n';

export const metadata: Metadata = {
  title: 'Research - Humanly',
  description:
    'Humanly is research infrastructure as much as product. Read the Humanly technical report and explore the system overview.',
};

const paperAuthorLines = [
  'Shenzhe Zhu*, Haoqian Zhang*, Xu Yang*, Jingyu Tang, Yi Nian,',
  'Xiaoxue Du, Shu Yang, Alex Pentland, Joachim Baumann, Jiaxin Pei†',
] as const;

const paperHref = '/research/humanly-tech-report.pdf';

export default function ResearchPage() {
  const locale = normalizeMarketingLocale(
    cookies().get(MARKETING_LOCALE_COOKIE)?.value
  );
  const t = getMarketingDict(locale).blog;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav locale={locale} />

      <section className="px-5 pb-12 pt-14 sm:px-8 sm:pb-16 sm:pt-20 lg:px-14">
        <div className="mx-auto max-w-[1080px]">
          <h1 className="text-[32px] font-light leading-[1.12] tracking-[-0.03em] sm:text-[44px]">
            {t.heroTitle}
          </h1>
          <p className="mt-5 max-w-[640px] text-[16px] leading-[1.7] text-muted-foreground sm:text-[18px]">
            {t.heroBody}
          </p>
        </div>
      </section>

      <section className="px-5 pb-20 sm:px-8 sm:pb-24 lg:px-14">
        <div className="mx-auto max-w-[1080px]">
          <BlurFade inView>
            <article className="relative rounded-xl border border-[var(--hly-hairline)] bg-background p-7 shadow-[0_24px_60px_-40px_rgba(35,32,25,0.35)] sm:p-9">
              <div className="flex flex-col sm:block sm:pr-24">
                <h2 className="min-w-0 text-[18px] font-medium leading-[1.45] lg:whitespace-nowrap">
                  Humanly: A Configurable and Traceable Environment for Human-AI
                  Collaborative Writing
                </h2>
                <a
                  href={paperHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="humanly-landing-btn-ghost mt-4 w-fit shrink-0 px-4 py-2 text-[13px] sm:absolute sm:right-9 sm:top-7 sm:mt-0"
                >
                  {t.codeLink}
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </div>

              <div className="mt-1">
                <p className="text-[12.5px] leading-[1.7] text-muted-foreground sm:text-[13px]">
                  {paperAuthorLines.map((line) => (
                    <span className="block" key={line}>
                      {line}
                    </span>
                  ))}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  * Equal contribution. † Corresponding author.
                </p>
                <p className="mt-3 text-[13px] italic text-muted-foreground">
                  {t.paperSummary}
                </p>
              </div>

              <figure className="mx-auto mt-8 max-w-[760px] sm:mt-10">
                <a
                  href={paperHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="Open the Humanly technical report"
                  className="block overflow-hidden rounded-md border border-[var(--hly-hairline)] bg-white"
                >
                  <Image
                    src="/research/humanly-system-overview.png"
                    alt="Humanly system overview showing the owner, writer, and verifier workflows across the client, backend, and storage layers"
                    width={2978}
                    height={1430}
                    className="h-auto w-full"
                    priority
                  />
                </a>
              </figure>
            </article>
          </BlurFade>
        </div>
      </section>

      <section className="px-5 py-20 sm:px-8 lg:px-14">
        <div className="mx-auto max-w-[760px] text-center">
          <h2 className="text-[26px] font-light leading-[1.12] sm:text-[32px]">
            {t.ctaTitle}
          </h2>
          <p className="mx-auto mt-4 max-w-[620px] text-[15px] leading-[1.7] text-muted-foreground sm:text-[16px]">
            {t.ctaBody}
          </p>
          <div className="mt-8 flex justify-center">
            <a
              href={`mailto:${SUPPORT_EMAIL}`}
              className="humanly-landing-btn justify-center"
            >
              {t.ctaButton}
            </a>
          </div>
        </div>
      </section>

      <SiteFooter locale={locale} />
    </main>
  );
}

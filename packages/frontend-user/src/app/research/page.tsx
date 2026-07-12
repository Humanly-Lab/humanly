import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowRight } from 'lucide-react';
import { SiteNav, SUPPORT_EMAIL } from '@/components/marketing/site-nav';
import { SiteFooter } from '@/components/marketing/site-footer';
import { BlurFade } from '@/components/magicui/blur-fade';
import {
  MARKETING_LOCALE_COOKIE,
  getMarketingDict,
  normalizeMarketingLocale,
} from '@/lib/marketing-i18n';

export async function generateMetadata(): Promise<Metadata> {
  const locale = normalizeMarketingLocale(
    cookies().get(MARKETING_LOCALE_COOKIE)?.value
  );
  const t = getMarketingDict(locale).blog;
  return { title: t.metaTitle, description: t.metaDescription };
}

const paperAuthorLines = [
  'Shenzhe Zhu*, Haoqian Zhang*, Xu Yang*, Jingyu Tang, Yi Nian,',
  'Xiaoxue Du, Shu Yang, Alex Pentland, Joachim Baumann, Jiaxin Pei†',
] as const;

const paperHref = '/research/humanly-tech-report.pdf';

const paperBibtex = `@misc{zhu2026humanly,
  title  = {Humanly: A Configurable and Traceable Environment
            for Human-AI Collaborative Writing},
  author = {Zhu, Shenzhe and Zhang, Haoqian and Yang, Xu and
            Tang, Jingyu and Nian, Yi and Du, Xiaoxue and
            Yang, Shu and Pentland, Alex and Baumann, Joachim
            and Pei, Jiaxin},
  year   = {2026},
  url    = {https://writehumanly.net/research/humanly-tech-report.pdf}
}`;

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
        <div className="mx-auto grid max-w-[1080px] gap-5">
          <BlurFade inView>
            <article className="humanly-hover-pop grid gap-8 rounded-lg border border-[var(--hly-hairline)] bg-background p-7 shadow-[0_24px_60px_-40px_rgba(35,32,25,0.35)] sm:p-9 lg:min-h-[370px] lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
              <div className="flex h-full min-w-0 flex-col">
                <div className="flex items-center gap-3">
                  <span className="inline-flex w-fit rounded-full bg-[var(--hly-blue-bg)] px-3 py-1 text-[11px] font-medium uppercase text-[var(--hly-blue-text)]">
                    {t.blogTag}
                  </span>
                  <time
                    dateTime="2026-07-12"
                    className="text-[11px] text-muted-foreground"
                  >
                    July 12, 2026
                  </time>
                </div>
                <h2 className="mt-5 max-w-[640px] text-[23px] font-light leading-[1.25] sm:text-[26px]">
                  <Link
                    href="/research/beyond-post-hoc-detection"
                    className="transition-colors hover:text-[var(--hly-brand-hover)]"
                  >
                    {t.articleTitle}
                  </Link>
                </h2>
                <p className="mt-4 max-w-[620px] text-[15px] leading-[1.7] text-muted-foreground">
                  {t.articleExcerpt}
                </p>
                <p className="mt-5 text-[12px] text-muted-foreground">
                  {t.articleMeta}
                </p>
                <div className="mt-auto pt-6">
                  <Link
                    href="/research/beyond-post-hoc-detection"
                    className="humanly-landing-btn-ghost w-[148px] justify-center px-4 py-2 text-[13px]"
                  >
                    {t.readArticle}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </div>
              </div>

              <div
                aria-hidden="true"
                className="self-start rounded-md border border-[var(--hly-hairline)] bg-[var(--hly-surface)] p-5"
              >
                <p className="text-[11px] font-medium uppercase text-muted-foreground">
                  {t.articlePreviewTitle}
                </p>
                <div className="mt-5 grid gap-3">
                  {[
                    ['Human draft', 'AI polish'],
                    ['AI draft', 'Human polish'],
                    ['Human source', 'AI translation'],
                    ['AI source', 'AI translation'],
                  ].map(([source, transform], index) => (
                    <div
                      className="grid grid-cols-[1fr_auto_1fr] items-center gap-2 text-[11px]"
                      key={`${source}-${transform}`}
                    >
                      <span
                        className={
                          index % 2 === 0
                            ? 'rounded bg-[var(--hly-green-tint)] px-2 py-1 text-[var(--hly-green-text)]'
                            : 'rounded bg-[var(--hly-red-bg)] px-2 py-1 text-[var(--hly-red-text)]'
                        }
                      >
                        {source}
                      </span>
                      <span className="text-muted-foreground">→</span>
                      <span className="rounded bg-background px-2 py-1 text-muted-foreground">
                        {transform}
                      </span>
                    </div>
                  ))}
                </div>
                <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-background">
                  <div className="h-full w-[86.7%] rounded-full bg-[var(--hly-brand)]" />
                </div>
                <div className="mt-2 flex justify-between text-[10px] text-muted-foreground">
                  <span>{t.articlePreviewMetric}</span>
                  <span>86.7%</span>
                </div>
              </div>
            </article>
          </BlurFade>

          <BlurFade delay={0.08} inView>
            <article className="humanly-hover-pop rounded-lg border border-[var(--hly-hairline)] bg-background p-7 shadow-[0_24px_60px_-40px_rgba(35,32,25,0.35)] sm:p-9">
              <div className="max-w-[860px]">
                <div className="flex items-center gap-3">
                  <span className="inline-flex rounded-full bg-[var(--hly-green-bg)] px-3 py-1 text-[11px] font-medium uppercase text-[var(--hly-green-text)]">
                    {t.paperTag}
                  </span>
                  <time
                    dateTime="2026"
                    className="text-[11px] text-muted-foreground"
                  >
                    2026
                  </time>
                </div>
                <h2 className="mt-5 min-w-0 text-[18px] font-medium leading-[1.45]">
                  Humanly: A Configurable and Traceable Environment for Human-AI
                  Collaborative Writing
                </h2>
                <p className="mt-2 text-[12.5px] leading-[1.7] text-muted-foreground sm:text-[13px]">
                  {paperAuthorLines.map((line) => (
                    <span className="block" key={line}>
                      {line}
                    </span>
                  ))}
                </p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  {t.authorsNote}
                </p>
                <p className="mt-3 text-[13px] italic text-muted-foreground">
                  {t.paperSummary}
                </p>
                <details className="mt-3">
                  <summary className="inline-flex cursor-pointer list-none items-center gap-1 text-[12.5px] font-medium text-muted-foreground hover:text-foreground">
                    {t.cite}
                    <span aria-hidden="true" className="text-[10px]">
                      ▾
                    </span>
                  </summary>
                  <pre className="mt-2 overflow-x-auto rounded-md border border-[var(--hly-hairline)] bg-[var(--hly-surface)] p-4 text-[11px] leading-[1.6] text-[var(--hly-ink)]">
                    {paperBibtex}
                  </pre>
                </details>
                <div className="pt-6">
                  <a
                    href={paperHref}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="humanly-landing-btn-ghost w-[148px] justify-center px-4 py-2 text-[13px]"
                  >
                    {t.paperLink}
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </a>
                </div>
              </div>
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

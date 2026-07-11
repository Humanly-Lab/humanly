import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import Image from 'next/image';
import { ArrowUpRight } from 'lucide-react';
import { SiteNav } from '@/components/marketing/site-nav';
import { SiteFooter } from '@/components/marketing/site-footer';
import { BlurFade } from '@/components/magicui/blur-fade';
import {
  MARKETING_LOCALE_COOKIE,
  getMarketingDict,
  normalizeMarketingLocale,
} from '@/lib/marketing-i18n';

export const metadata: Metadata = {
  title: 'About — Humanly',
  description:
    'Humanly Lab builds provenance infrastructure for human-AI collaborative writing, led by researchers from UT Austin, University of Toronto, and Stanford.',
};

const team = [
  {
    name: 'Jiaxin Pei',
    role: 'Team Lead',
    affiliation: 'UT Austin · Stanford',
    href: 'https://jiaxin-pei.github.io/',
  },
  {
    name: 'Shenzhe Zhu',
    role: 'Team Lead',
    affiliation: 'UT Austin',
    href: 'https://shenzhezhu.github.io/',
  },
  {
    name: 'Xu Yang',
    role: 'Engineer',
    affiliation: 'UT Austin',
    href: 'https://github.com/xyimatvoid',
  },
  {
    name: 'Haoqian Zhang',
    role: 'Engineer',
    affiliation: 'University of Toronto',
    href: 'https://www.linkedin.com/in/haoqian-zhang2131/',
  },
] as const;

const institutions = [
  {
    name: 'The University of Texas at Austin',
    src: '/about/ut-austin-stacked.png',
    className: 'h-16 w-[150px] brightness-0 sm:h-[72px] sm:w-[170px]',
  },
  {
    name: 'Stanford University',
    src: '/about/stanford-university-current.png',
    className:
      'h-12 w-[166px] grayscale mix-blend-multiply sm:h-14 sm:w-[180px]',
  },
  {
    name: 'Stanford Digital Economy Lab',
    src: '/about/stanford-digital-economy-lab-transparent.png',
    className: 'h-16 w-[105px] sm:h-[72px] sm:w-[116px]',
  },
  {
    name: 'University of Toronto',
    src: '/about/university-of-toronto.png',
    className: 'h-14 w-[174px] sm:h-16 sm:w-[185px]',
  },
] as const;

export default function AboutPage() {
  const locale = normalizeMarketingLocale(
    cookies().get(MARKETING_LOCALE_COOKIE)?.value
  );
  const t = getMarketingDict(locale).about;

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav locale={locale} />

      <section className="px-5 pb-16 pt-14 sm:px-8 sm:pt-20 lg:px-14">
        <div className="mx-auto max-w-[880px]">
          <h1 className="text-[32px] font-light leading-[1.12] tracking-[-0.03em] sm:text-[44px]">
            {t.heroTitle}
          </h1>
          <p className="mt-6 max-w-[640px] text-[16px] leading-[1.75] text-muted-foreground sm:text-[18px]">
            {t.heroBody}
          </p>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8 lg:px-14">
        <div className="mx-auto max-w-[880px]">
          <BlurFade inView>
            <h2 className="text-[24px] font-light leading-[1.15] tracking-[-0.02em] sm:text-[30px]">
              {t.researchTitle}
            </h2>
            <p className="mt-5 max-w-[680px] text-[15px] leading-[1.75] text-muted-foreground sm:text-[16px]">
              {t.researchBody}
            </p>

            <div className="mt-9 grid max-w-[820px] grid-cols-2 items-center gap-x-8 gap-y-7 sm:-ml-[10px] sm:grid-cols-4 sm:gap-x-5">
              {institutions.map(({ name, src, className }) => (
                <div
                  className="flex h-20 items-center justify-center sm:h-[88px]"
                  key={name}
                >
                  <Image
                    alt={name}
                    className={`object-contain object-center ${className}`}
                    height={80}
                    src={src}
                    width={200}
                  />
                </div>
              ))}
            </div>
          </BlurFade>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {t.beliefs.map(([title, body], index) => (
              <BlurFade inView delay={0.06 * index} key={title}>
                <div className="border-t border-[var(--hly-hairline)] pt-5">
                  <h3 className="text-[15px] font-medium tracking-[-0.005em]">
                    {title}
                  </h3>
                  <p className="mt-2.5 text-[13.5px] leading-[1.7] text-muted-foreground">
                    {body}
                  </p>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      <section className="px-5 py-16 sm:px-8 lg:px-14">
        <div className="mx-auto max-w-[880px]">
          <BlurFade inView>
            <h2 className="text-[24px] font-light leading-[1.15] tracking-[-0.02em] sm:text-[30px]">
              {t.teamTitle}
            </h2>
          </BlurFade>

          <div className="mt-10 grid grid-cols-2 gap-x-8 gap-y-8 sm:grid-cols-4">
            {team.map(({ name, role, affiliation, href }, index) => (
              <BlurFade inView delay={0.04 * index} key={name}>
                <div>
                  <a
                    className="group inline-flex items-center gap-1 text-[15px] font-medium tracking-[-0.005em] hover:text-[var(--hly-rose)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--hly-rose)]"
                    href={href}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {name}
                    <ArrowUpRight
                      aria-hidden="true"
                      className="h-3.5 w-3.5 opacity-45 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5 group-hover:opacity-100"
                    />
                  </a>
                  <div className="mt-1.5 text-[12.5px] text-[var(--hly-ink-muted)]">
                    {role}
                  </div>
                  <div className="mt-1 text-[12px] leading-[1.5] text-muted-foreground">
                    {affiliation}
                  </div>
                </div>
              </BlurFade>
            ))}
          </div>
        </div>
      </section>

      <SiteFooter locale={locale} />
    </main>
  );
}

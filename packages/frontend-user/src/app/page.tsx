import Link from 'next/link';
import { BookOpen, Check, MessageSquare, Sparkles, Wand2 } from 'lucide-react';
import { AuthenticatedRedirect } from '@/components/auth/authenticated-redirect';
import { HumanlyWordmark } from '@/components/brand/humanly-wordmark';
import { BlurFade } from '@/components/magicui/blur-fade';
import { PipelineShowcase } from '@/components/marketing/pipeline-showcase';
import { StatementVisual } from '@/components/marketing/statement-visual';
import { marketingHref, productAppHref } from '@/lib/app-origin';

const fastDemoHref = productAppHref('/documents/new?demo=1');
const githubHref = 'https://github.com/Humanly-Lab/humanly';

const logRows = [
  [
    '12:41:48',
    'input',
    'var(--hly-green-tint)',
    'var(--hly-green-strong)',
    '796',
  ],
  [
    '12:41:49',
    'select',
    'var(--hly-surface-2)',
    'var(--hly-neutral-text)',
    '42',
  ],
  ['12:41:50', 'ai quick', 'var(--hly-ai-bg)', 'var(--hly-ai-text)', 'AI'],
  ['12:42:03', 'paste', 'var(--hly-paste-bg)', 'var(--hly-paste-text)', '186'],
  ['12:42:08', 'ai question', 'var(--hly-ai-bg)', 'var(--hly-ai-text)', 'AI'],
  ['12:42:13', 'ai answer', 'var(--hly-ai-bg)', 'var(--hly-ai-text)', 'AI'],
  ['12:42:16', 'ai insert', 'var(--hly-ai-bg)', 'var(--hly-ai-text)', '52'],
  [
    '12:42:19',
    'delete',
    'var(--hly-surface-2)',
    'var(--hly-neutral-text)',
    '18',
  ],
  [
    '12:42:22',
    'input',
    'var(--hly-green-tint)',
    'var(--hly-green-strong)',
    '1,204',
  ],
];

const toolRows = [
  { tool: 'ls', detail: 'paper list', ms: '8ms' },
  { tool: 'grep', detail: '"attention"', ms: '28ms' },
  { tool: 'read', detail: 'source passage', ms: '52ms' },
  { tool: 'grep', detail: '"revision"', ms: '43ms' },
  { tool: 'read', detail: 'nearby context', ms: '49ms' },
] as const;

const quickActions = [
  { label: 'Fix grammar', Icon: Check },
  { label: 'Improve writing', Icon: Wand2 },
  { label: 'Simplify', Icon: BookOpen },
  { label: 'Make formal', Icon: Sparkles },
  { label: 'Ask AI', Icon: MessageSquare },
] as const;



const faqs = [
  [
    'Why is final text not enough?',
    'A final document cannot show whether it came from human typing, AI generation, or mixed human-AI writing. Humanly records the writing process itself.',
  ],
  [
    'What does Humanly record?',
    'Humanly records in-platform writing activity, including text edits, clipboard actions, workspace status, and AI assistance, then turns them into logs and replay.',
  ],
  [
    'Who controls the writing rules?',
    'The owner configures the writing environment before drafting starts, including AI access, copy-paste rules, resources, timing, length bounds, and detectors.',
  ],
  [
    'What does a certificate show?',
    'A certificate packages authorship statistics, environment settings, activity log, replay, anomaly behavior review, and signature verification.',
  ],
  [
    'How does Humanly help prevent cheating?',
    'Humanly uses two-layer anomaly detection: statistic-based anomaly patterns and model-based human typing detection. These signals surface suspicious behavior for review, rather than making an automatic verdict.',
  ],
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <AuthenticatedRedirect />
      <NavBar />

      <section
        id="product"
        className="relative px-5 pb-14 pt-10 sm:px-8 sm:pb-16 sm:pt-14 lg:px-14 lg:pt-[48px]"
      >
        <div className="mx-auto max-w-[1160px]">
          {/* Cursor-style opening: left-aligned statement, full-width product shot below.
              Text and showcase share this container, so their left edges stay aligned. */}
          <div className="max-w-[700px] lg:-ml-2">
            <h1 className="text-[19px] font-light leading-[1.3] tracking-[-0.015em] sm:text-[23px] lg:text-[26px]">
              Humanly is your configurable and traceable
              <br />
              Human-AI collaborative writing platform
            </h1>
            <p className="mt-4 max-w-[640px] text-[18px] leading-[1.6] text-muted-foreground sm:text-[20px]">
              Every piece of writing has a{' '}
              <span className="text-[var(--hly-brand)]">story</span>. Now you
              can prove it.
            </p>
            <div className="mt-7 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Link
                href={productAppHref('/register')}
                className="humanly-landing-btn justify-center sm:justify-start"
              >
                Start writing <Arrow />
              </Link>
              <Link
                href={fastDemoHref}
                className="humanly-landing-btn-ghost justify-center sm:justify-start"
              >
                Try the live demo
                <Arrow />
              </Link>
            </div>
          </div>

          <div className="relative mx-auto mt-10 w-full overflow-visible pb-8 sm:mt-12">
            <HeroComposition />
          </div>
        </div>
      </section>

      <StatementSection />
      <TryItSection />
      <FAQSection />
      <DemoLaunchSection />
      <Footer />
    </main>
  );
}

function DemoLaunchSection() {
  return (
    <section
      id="demo"
      className="bg-background px-5 py-[104px] sm:px-8 lg:px-14"
    >
      <div className="mx-auto max-w-[720px] text-center">
        <h2 className="text-[28px] font-light leading-[1.1] tracking-[-0.03em] sm:text-[36px]">
          Humanly Demo
        </h2>
        <p className="mx-auto mt-5 max-w-[560px] text-[15px] leading-[1.7] text-muted-foreground sm:text-[17px]">
          See Humanly turn writing into verifiable evidence.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href={fastDemoHref}
            className="humanly-landing-btn bg-[var(--hly-brand)] hover:bg-[var(--hly-brand-hover)]"
          >
            Open Demo <Arrow />
          </Link>
        </div>
      </div>
    </section>
  );
}

function NavBar() {
  return (
    <header className="grid grid-cols-[1fr_auto] items-center bg-background px-5 py-2.5 sm:px-8 lg:grid-cols-[1fr_auto_1fr] lg:px-14 lg:py-3">
      <Link href={marketingHref('/')} className="justify-self-start">
        <HumanlyWordmark
          size="md"
          className="max-[380px]:text-xl max-[380px]:[&_img]:h-9 max-[380px]:[&_img]:w-9"
        />
      </Link>

      <nav className="hidden items-center gap-9 text-sm font-medium text-muted-foreground lg:flex">
        <a href="#process" className="hover:text-foreground">
          How it works
        </a>
        <a href="#faq" className="hover:text-foreground">
          FAQ
        </a>
        <Link href={fastDemoHref} className="hover:text-foreground">
          Demo
        </Link>
        <a
          href={githubHref}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground"
        >
          GitHub
        </a>
      </nav>

      <div className="flex items-center gap-2 justify-self-end sm:gap-3">
        <Link
          href={productAppHref('/login')}
          className="inline-flex h-8 items-center text-sm font-medium text-muted-foreground hover:text-foreground"
        >
          Log in
        </Link>
        <Link
          href={productAppHref('/register')}
          className="humanly-landing-btn h-8 px-3 py-0 text-sm"
        >
          Sign up
        </Link>
      </div>
    </header>
  );
}

function HeroComposition() {
  return (
    <div
      className="relative w-full overflow-visible"
      style={{ aspectRatio: '1100 / 720', containerType: 'inline-size' }}
    >
      <div
        className="absolute left-1/2 top-0 h-[720px] w-[1100px] origin-top"
        style={{
          transform: 'translateX(-50%) scale(calc(100cqw / 1100px))',
        }}
      >
        <div
          className="absolute inset-0 rotate-[-0.6deg] rounded-md bg-cover bg-center"
          style={{
            backgroundImage: "url('/brand/monet-water-lilies.png')",
            boxShadow:
              '0 36px 80px -30px rgba(40,32,18,0.40)',
          }}
        />

        <div className="absolute left-[19.1%] top-[4.2%] z-20 w-[61.8%] rotate-[0.4deg]">
          <HeroDocCalm />
        </div>

        <AIAssistCard />
        <TrackingCard />
        <CertificateCard />
      </div>
    </div>
  );
}

function HeroDocCalm() {
  return (
    <div className="humanly-hover-pop overflow-hidden rounded-[14px] border border-[var(--hly-hairline)] bg-white shadow-[0_30px_80px_-30px_rgba(10,10,10,0.18)] hover:shadow-[0_38px_96px_-32px_rgba(10,10,10,0.30)]">
      <div className="flex items-center justify-between border-b border-[rgba(20,22,26,0.05)] px-[22px] py-[14px]">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#e9e6df]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e9e6df]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e9e6df]" />
        </div>
        <span className="text-xs text-muted-foreground">
          A draft, in progress
        </span>
        <span className="inline-flex items-center gap-1.5 text-xs text-[var(--hly-brand)]">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          Tracking
        </span>
      </div>

      <div className="grid min-h-[510px] grid-cols-[1.5fr_1fr]">
        <div className="border-r border-[rgba(20,22,26,0.05)] p-9">
          <div className="mb-2 text-[11px] text-muted-foreground">
            Untitled draft
          </div>
          <h3 className="mb-4 text-[22px] font-medium leading-[1.2] tracking-[-0.015em]">
            Drafting with attention
          </h3>
          <p className="mb-3 text-[13px] leading-[1.75] text-[var(--hly-ink)]">
            The first thing to notice about a draft is the pause before it.
            Before a sentence lands on the page there is a small, deliberate{' '}
            refusal, the writer choosing not to type yet.
          </p>
          <div className="relative pt-11">
            <div className="absolute left-[-6px] top-1 z-40 flex max-w-[440px] items-center gap-1.5 rounded-[9px] border border-[var(--hly-hairline)] bg-white/95 px-2 py-1.5 shadow-[0_16px_34px_-22px_rgba(20,22,26,0.55)]">
              {quickActions.map(({ label, Icon }, index) => (
                <div key={label} className="flex min-w-0 items-center gap-1.5">
                  {index === 4 ? (
                    <span className="h-4 w-px bg-[rgba(20,22,26,0.12)]" />
                  ) : null}
                  <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap text-[8.8px] font-medium leading-none text-foreground">
                    <Icon className="h-3 w-3 shrink-0" strokeWidth={1.8} />
                    {label}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[13px] leading-[1.75] text-muted-foreground">
              <span className="box-decoration-clone bg-[rgba(196,167,178,0.45)] px-[2px] py-[1px]">
                Most drafts fail in this earlier moment, when the mind accepts
                whatever language arrives first. The discipline is to wait, then
                to choose.
              </span>
            </p>
          </div>
          <span className="humanly-cursor-blink mt-1 inline-block h-[17px] w-0.5 bg-foreground align-text-bottom" />
        </div>

        <div className="flex flex-col bg-[#fcfcfb]">
          <div className="flex items-center justify-between border-b border-[rgba(20,22,26,0.05)] px-3.5 py-3">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-medium">
              <span className="grid h-4 w-4 place-items-center rounded bg-foreground text-[9px] text-white">
                ✦
              </span>
              AI Assistant
            </span>
            <span className="text-xs text-[var(--hly-neutral)]">⚙ + ⟲ ×</span>
          </div>

          <div className="flex flex-1 flex-col gap-2.5 p-3.5 pb-0">
            <div className="self-center rounded-[14px] bg-foreground px-3 py-2 text-[11px] leading-normal text-white">
              Find source support for this paragraph
            </div>
            <div className="flex flex-col gap-1 rounded-lg bg-[var(--hly-surface)] p-2 pb-2.5">
              {toolRows.map(({ tool, detail, ms }) => (
                <div
                  key={`${tool}-${detail}`}
                  className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md border border-[rgba(20,22,26,0.05)] bg-white px-2.5 py-1.5 text-[10px] text-[var(--hly-ink)]"
                >
                  <span className="text-[9px] text-[var(--hly-brand)]">✓</span>
                  <span className="font-medium">{tool}</span>
                  <span className="truncate text-[9px] text-muted-foreground">
                    {detail}
                  </span>
                  <span className="text-muted-foreground">{ms}</span>
                </div>
              ))}
              <p className="px-1 pt-1 text-[10.5px] leading-[1.55] text-[var(--hly-ink)]">
                I found support in the attached PDF: the source frames attention
                as revision discipline, which supports your point about waiting
                before drafting…
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 p-3">
            <div className="flex items-center gap-1.5 rounded-full bg-[rgba(91,111,140,0.10)] px-2 py-1 text-[10px] font-medium text-[var(--hly-info)]">
              <span>⊙</span>
              PDF context available (13 pages)
            </div>
            <div className="flex min-w-0 justify-between gap-2 rounded-md bg-[var(--hly-surface)] px-2.5 py-1.5 text-[10px] text-muted-foreground">
              <span className="truncate">
                moonshotai/Kimi-K2.6 (image+text)
              </span>
              <span>⇅</span>
            </div>
            <div className="flex items-stretch gap-1.5">
              <div className="flex-1 rounded-md border border-foreground bg-white px-2.5 py-2 text-[10.5px] text-[var(--hly-neutral)]">
                Type your message…
              </div>
              <button className="grid w-8 place-items-center rounded-md bg-[var(--hly-neutral)] text-xs text-white">
                ↗
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AIAssistCard() {
  return (
    <div className="humanly-hover-pop absolute left-[2.5%] top-[33.3%] z-30 w-[18.2%] min-w-[176px] rotate-[-2deg] rounded-[10px] border border-[var(--hly-hairline)] bg-white px-3.5 py-3 shadow-[0_24px_60px_-18px_rgba(20,22,26,0.40)] hover:z-50 hover:shadow-[0_32px_70px_-18px_rgba(20,22,26,0.48)]">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-foreground text-[10px] font-medium text-white">
          ✦
        </span>
        <span className="text-[11px] font-medium">AI Assistant</span>
        <span className="ml-auto rounded-full bg-[var(--hly-ai-bg)] px-1.5 py-px text-[8px] font-medium text-[var(--hly-ai-text)]">
          SIMPLIFY
        </span>
      </div>
      <p className="mb-2.5 rounded-md bg-[var(--hly-surface)] px-2.5 py-2 text-[10.5px] leading-[1.55] text-[var(--hly-ink)]">
        Most drafts fail when the mind{' '}
        <span className="text-muted-foreground line-through decoration-[#a07868] decoration-[1.5px]">
          accepts whatever language arrives
        </span>{' '}
        <span className="rounded-sm bg-[var(--hly-green-tint)] px-1 font-medium text-[var(--hly-green-strong)]">
          takes what arrives
        </span>
        .
      </p>
      <div className="flex gap-1">
        <span className="rounded-[5px] bg-foreground px-2.5 py-1.5 text-[10px] font-medium text-white">
          Apply
        </span>
        <span className="rounded-[5px] border border-[var(--hly-hairline)] px-2.5 py-1.5 text-[10px] font-medium text-muted-foreground">
          Discard
        </span>
      </div>
    </div>
  );
}

function TrackingCard() {
  return (
    <div className="humanly-hover-pop absolute right-[2.5%] top-[9.7%] z-40 w-[18.2%] min-w-[176px] rotate-[2deg] rounded-[10px] border border-[var(--hly-hairline)] bg-white px-3.5 py-3 shadow-[0_24px_50px_-18px_rgba(20,22,26,0.40)] hover:z-50 hover:shadow-[0_32px_70px_-18px_rgba(20,22,26,0.48)]">
      <div className="mb-2.5 flex justify-between">
        <span className="text-[11px] font-medium">Tracking log</span>
        <span className="text-[9px] text-muted-foreground">live</span>
      </div>
      <div className="overflow-hidden rounded-md border border-border/60">
        <div className="grid grid-cols-[46px_1fr_auto] gap-1 bg-muted/50 px-1.5 py-[3px] text-[8px] font-medium text-muted-foreground">
          <span>Time</span>
          <span>Activity</span>
          <span>Count</span>
        </div>
        {logRows.map(([time, kind, rowBg, fg, count]) => (
          <div
            key={`${time}-${kind}`}
            className="grid grid-cols-[46px_1fr_auto] items-center gap-1 border-t border-border/60 px-1.5 py-[3px] text-[9.5px]"
          >
            <span className="tabular-nums text-muted-foreground">{time}</span>
            <span
              className="w-fit rounded-[3px] px-1.5 py-px text-[9px] font-medium"
              style={{ backgroundColor: rowBg, color: fg }}
            >
              {kind}
            </span>
            <span className="tabular-nums text-muted-foreground">{count}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function CertificateCard() {
  return (
    <div className="humanly-hover-pop absolute bottom-[3%] left-[8%] z-30 w-[39%] rounded-[10px] border border-[var(--hly-hairline)] bg-background p-3.5 shadow-[0_24px_50px_-18px_rgba(20,22,26,0.40)] hover:z-50 hover:shadow-[0_32px_70px_-18px_rgba(20,22,26,0.48)]">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-1.5 flex items-center gap-1.5">
            <CertBadge />
            <span className="text-[8.5px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
              Certificate
            </span>
          </div>
          <div className="truncate text-[13px] font-medium tracking-[-0.005em]">
            Drafting with attention
          </div>
          <div className="mt-1 whitespace-nowrap text-[9px] text-muted-foreground">
            Generated May 19, 2026 · certificate sealed
          </div>
        </div>
        <span className="rounded-full border border-[var(--hly-green-border)] bg-[var(--hly-green-bg)] px-2 py-0.5 text-[9px] font-medium text-[var(--hly-green-text)]">
          Sealed
        </span>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          ['Typed', '93%'],
          ['Pasted', '7%'],
          ['AI', '0%'],
        ].map(([label, value]) => (
          <div
            key={label}
            className="rounded-md border border-border/70 bg-card px-2 py-2 text-center"
          >
            <div className="text-[8.5px] uppercase tracking-[0.14em] text-muted-foreground">
              {label}
            </div>
            <div className="mt-1 text-[16px] font-medium leading-none">{value}</div>
          </div>
        ))}
      </div>

      <div className="mt-3 rounded-md border border-border/70 bg-card px-3 py-2">
        <div className="flex items-center justify-between gap-2">
          <div className="min-w-0">
            <div className="truncate text-[10.5px] font-medium">
              Humanly Typing Detector
            </div>
            <div className="mt-1 truncate text-[9px] text-muted-foreground">
              Writing trajectory is consistent with human writing.
            </div>
          </div>
          <span className="shrink-0 rounded-full bg-[var(--hly-green-bg)] px-2 py-0.5 text-[8.5px] font-medium text-[var(--hly-green-text)]">
            95% human likelihood
          </span>
        </div>
      </div>
    </div>
  );
}

function StatementSection() {
  return (
    <section className="px-5 py-[84px] sm:px-8 sm:py-[110px] lg:px-14">
      <div className="mx-auto max-w-[1160px]">
        {/* Cursor-style alternation: visual fills the left column, text sits right —
            no side ever reads as empty. The workflow section below flips this. */}
        <div className="grid items-center gap-10 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14">
          <div className="order-2 lg:order-1">
            <BlurFade inView delay={0.1} className="w-full max-w-[600px] [&>div]:mt-0">
              <StatementVisual />
            </BlurFade>
          </div>
          <div className="order-1 lg:order-2">
            <BlurFade inView>
            <h2 className="text-[30px] font-light leading-[1.15] tracking-[-0.03em] sm:text-[40px]">
              Did you write this,{' '}
              <span className="text-[var(--hly-neutral)]">or did AI?</span>
            </h2>
            <p className="mt-6 max-w-[520px] text-[15px] leading-[1.75] text-muted-foreground sm:text-[17px]">
              AI detectors estimate authenticity from the finished text.
              Humanly records the writing process directly, showing how the
              text was composed from typing, paste, and AI assistance.
            </p>
            </BlurFade>
          </div>
        </div>
      </div>
    </section>
  );
}

function TryItSection() {
  return (
    <section id="process" className="px-5 py-[84px] sm:px-8 sm:py-[110px] lg:px-14">
      <div className="mx-auto grid max-w-[1160px] items-center gap-10 lg:grid-cols-[0.72fr_1.28fr] lg:gap-12">
        {/* text left, animation right — mirrors the Problem section above */}
        <div>
          <BlurFade inView>
          <h2 className="text-[28px] font-light leading-[1.1] tracking-[-0.03em] sm:text-[36px]">
            How does Humanly work?
          </h2>
          <p className="mt-5 max-w-[420px] text-[15px] leading-[1.7] text-muted-foreground sm:text-[16px]">
            Configure a writing environment, draft under the policy, record
            the activity log, and generate a signed certificate.
          </p>
          </BlurFade>
        </div>
        <BlurFade inView delay={0.1}>
          <PipelineShowcase />
        </BlurFade>
      </div>
    </section>
  );
}

function FAQSection() {
  return (
    <section id="faq" className="px-5 py-[120px] sm:px-8 lg:px-14">
      <div className="mx-auto grid max-w-[980px] gap-12 md:grid-cols-[1fr_2fr] md:gap-20">
        <div>
          <h2 className="text-[28px] font-light leading-[1.1] tracking-[-0.03em] sm:text-[36px]">
            Common Q&amp;A
          </h2>
        </div>
        <div>
          {faqs.map(([question, answer]) => (
            <details
              key={question}
              className="group border-t border-[var(--hly-hairline)] py-[22px]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
                <span className="text-lg font-medium tracking-[-0.005em]">
                  {question}
                </span>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[var(--hly-hairline)] transition-transform group-open:rotate-45">
                  <PlusIcon />
                </span>
              </summary>
              <p className="mt-3.5 max-w-[580px] text-[15px] leading-[1.6] text-muted-foreground">
                {answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[var(--hly-hairline)] px-5 py-9 sm:px-8 lg:px-14">
      <div className="mx-auto flex max-w-[1168px] items-center justify-between gap-4">
        <Link href={marketingHref('/')}>
          <HumanlyWordmark size="sm" />
        </Link>
        <div className="flex shrink-0 flex-wrap justify-end gap-5 text-xs font-medium text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link href="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <a
            href={githubHref}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground"
          >
            GitHub
          </a>
        </div>
      </div>
    </footer>
  );
}

function Arrow() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 14 14"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M3 7h8M7 3l4 4-4 4"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function PlusIcon() {
  return (
    <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden="true">
      <path d="M5 0v10M0 5h10" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function CertBadge() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      aria-hidden="true"
    >
      <circle cx="8" cy="6" r="4.5" />
      <path d="M5 9.5 L4 14 L8 12 L12 14 L11 9.5" />
    </svg>
  );
}

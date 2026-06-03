import type { ReactNode } from 'react';
import Link from 'next/link';
import { BookOpen, Check, MessageSquare, Sparkles, Wand2 } from 'lucide-react';
import { AuthenticatedRedirect } from '@/components/auth/authenticated-redirect';
import { HumanlyWordmark } from '@/components/brand/humanly-wordmark';
import { HeroShowcase } from '@/components/marketing/hero-showcase';
import { marketingHref, productAppHref } from '@/lib/app-origin';

const ink = '#1a1c20';
const muted = '#6e7176';
const hairline = 'rgba(20,22,26,0.10)';
const bg2 = '#ebede4';
const good = '#6f8a78';
const fastDemoHref = '/demo/fast-writing';
const launchVideoSrc = '/videos/humanly-launch.mp4';

const logRows = [
  ['12:41:48', 'input', '#dde6df', '#4a655a', '796'],
  ['12:41:49', 'select', '#e5e5e2', '#65655f', '42'],
  ['12:41:50', 'ai quick', '#dee4ee', '#3a4a64', 'AI'],
  ['12:42:03', 'paste', '#f2e0d3', '#8a5a3c', '186'],
  ['12:42:08', 'ai question', '#dee4ee', '#3a4a64', 'AI'],
  ['12:42:13', 'ai answer', '#dee4ee', '#3a4a64', 'AI'],
  ['12:42:16', 'ai insert', '#dee4ee', '#3a4a64', '52'],
  ['12:42:19', 'delete', '#e5e5e2', '#65655f', '18'],
  ['12:42:22', 'input', '#dde6df', '#4a655a', '1,204'],
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

const problemCards = [
  'AI detectors guess after the fact.',
  'Readers cannot see the writing process.',
  'Writers defend the work instead of doing it.',
];

const steps = [
  [
    '01',
    'Configure',
    'Choose AI access, paste rules, character limits, and time limits before writing begins.',
  ],
  [
    '02',
    'Write',
    'Type, paste, revise, and use AI inside one tracked workspace.',
  ],
  [
    '03',
    'Record',
    'Humanly captures the writing timeline without interrupting the drafting surface.',
  ],
  [
    '04',
    'Certify',
    'Create a verifiable PDF and JSON record that shows how the draft came together.',
  ],
] as const;

const faqs = [
  [
    'Does Humanly slow down writing?',
    'No. The editor feels like a normal writing surface while Humanly records provenance in the background.',
  ],
  [
    'Can writers still use AI?',
    'Yes. Humanly is built for transparent AI collaboration. AI use can be allowed, limited, or disabled depending on the writing environment.',
  ],
  [
    'What does a certificate show?',
    'It links the final draft to a recorded writing process: typing, paste activity, timing, and AI assistance.',
  ],
  [
    'Who controls the writing rules?',
    'For assigned tasks, the task owner sets the AI, paste, time, and character rules before writing begins.',
  ],
  [
    'Can I use Humanly for personal writing?',
    'Yes. You can create private writing documents, work with or without AI, and generate a certificate when you want proof of process.',
  ],
] as const;

export default function HomePage() {
  return (
    <main className="min-h-screen overflow-hidden bg-background text-foreground">
      <AuthenticatedRedirect />
      <NavBar />

      <section id="product" className="relative px-5 pb-14 pt-12 sm:px-8 sm:pb-16 sm:pt-16 lg:px-14 lg:pt-[58px]">
        <div className="mx-auto max-w-[940px] text-center">
          <h1 className="text-[28px] font-semibold leading-[1.08] tracking-[-0.025em] sm:text-[36px] lg:text-[42px]">
            <span>Write with AI.</span>
            <br />
            <span className="text-[#a0a2a7]">Prove your process.</span>
          </h1>
          <p className="mx-auto mt-6 max-w-[520px] text-[14px] leading-[1.7] text-muted-foreground sm:text-[16px] sm:leading-[1.6]">
            A writing workspace that quietly records how a draft came together,
            then signs it with a certificate any reader can verify.
          </p>
          <div className="mt-7 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              href={fastDemoHref}
              target="_blank"
              rel="noopener noreferrer"
              className="humanly-landing-btn bg-[#6f8a78] hover:bg-[#607869]"
            >
              Try the demo <Arrow />
            </Link>
            <Link href={productAppHref('/register')} className="humanly-landing-btn">
              Start writing <Arrow />
            </Link>
          </div>
        </div>

        <HeroShowcase video={<HeroVideoComposition />} workspace={<HeroComposition />} />
      </section>

      <ProblemSection />
      <TrustModelSection />
      <AudienceSection />
      <HowItWorksSection />
      <FAQSection />
      <DemoLaunchSection />
      <Footer />
    </main>
  );
}

function DemoLaunchSection() {
  return (
    <section id="demo" className="bg-background px-5 py-[104px] sm:px-8 lg:px-14">
      <div className="mx-auto max-w-[720px] text-center">
        <Eyebrow className="mb-[22px]">Interactive demo</Eyebrow>
        <h2 className="text-[28px] font-semibold leading-[1.08] tracking-normal sm:text-[36px]">
          Humanly Demo
        </h2>
        <p className="mx-auto mt-5 max-w-[560px] text-[15px] leading-[1.7] text-muted-foreground sm:text-[17px]">
          Try the real flow in a separate demo workspace. Configure a task,
          write in a Humanly-style editor, inspect the activity log, and
          generate a local certificate preview.
        </p>
        <div className="mt-8 flex justify-center">
          <Link
            href={fastDemoHref}
            target="_blank"
            rel="noopener noreferrer"
            className="humanly-landing-btn bg-[#6f8a78] hover:bg-[#607869]"
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
    <header className="grid grid-cols-[1fr_auto] items-center px-5 py-5 sm:px-8 lg:grid-cols-[1fr_auto_1fr] lg:px-14 lg:py-[26px]">
      <Link href={marketingHref('/')} className="justify-self-start">
        <HumanlyWordmark size="md" className="max-[380px]:text-xl max-[380px]:[&_img]:h-9 max-[380px]:[&_img]:w-9" />
      </Link>

      <nav className="hidden items-center gap-9 text-sm font-medium text-muted-foreground lg:flex">
        <a href="#product" className="hover:text-foreground">Product</a>
        <a href="#demo" className="hover:text-foreground">Demo</a>
        <a href="#process" className="hover:text-foreground">How it works</a>
        <a href="#faq" className="hover:text-foreground">FAQ</a>
      </nav>

      <div className="flex items-center gap-2 justify-self-end sm:gap-3">
        <Link href={productAppHref('/login')} className="text-[13px] font-medium text-muted-foreground hover:text-foreground sm:text-sm">
          Log in
        </Link>
        <Link href={productAppHref('/register')} className="humanly-landing-btn px-[14px] py-[9px] text-[13px] sm:px-[18px]">
          Start
        </Link>
      </div>
    </header>
  );
}

function HeroComposition() {
  return (
    <div
      className="relative mx-auto w-full max-w-[1100px] overflow-visible"
      style={{ aspectRatio: '1100 / 720', containerType: 'inline-size' }}
    >
      <div
        className="absolute left-1/2 top-0 h-[720px] w-[1100px] origin-top"
        style={{ transform: 'translateX(-50%) scale(min(1, calc(100cqw / 1100px)))' }}
      >
        <div
          className="absolute inset-0 rotate-[-0.6deg] rounded-md bg-cover bg-center"
          style={{
            backgroundImage: "url('/brand/monet-windmills.jpg')",
            boxShadow:
              '0 36px 80px -30px rgba(40,32,18,0.40), 0 0 0 8px #fbf9f1, 0 0 0 9px rgba(40,32,18,0.10)',
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

function HeroVideoComposition() {
  return (
    <div
      className="relative mx-auto w-full max-w-[1100px] overflow-visible"
      style={{ aspectRatio: '1100 / 720', containerType: 'inline-size' }}
    >
      <div
        className="absolute left-1/2 top-0 h-[720px] w-[1100px] origin-top"
        style={{ transform: 'translateX(-50%) scale(min(1, calc(100cqw / 1100px)))' }}
      >
        <div
          className="absolute inset-0 rotate-[-0.6deg] rounded-md bg-cover bg-center"
          style={{
            backgroundImage: "url('/brand/monet-windmills.jpg')",
            boxShadow:
              '0 36px 80px -30px rgba(40,32,18,0.40), 0 0 0 8px #fbf9f1, 0 0 0 9px rgba(40,32,18,0.10)',
          }}
        />
        <div className="absolute left-1/2 top-1/2 z-20 w-[88%] -translate-x-1/2 -translate-y-1/2 overflow-hidden rounded-[16px] border border-[rgba(20,22,26,0.10)] bg-white p-2 shadow-[0_30px_80px_-34px_rgba(20,22,26,0.55)]">
          <video
            aria-label="Humanly product video"
            className="aspect-video w-full rounded-[12px] bg-foreground object-cover"
            controls
            muted
            poster="/videos/humanly-launch-poster.png"
            playsInline
            preload="metadata"
          >
            <source src={launchVideoSrc} type="video/mp4" />
          </video>
        </div>
      </div>
    </div>
  );
}

function HeroDocCalm() {
  return (
    <div className="humanly-hover-pop overflow-hidden rounded-[14px] border border-[rgba(20,22,26,0.10)] bg-white shadow-[0_30px_80px_-30px_rgba(10,10,10,0.18)] hover:shadow-[0_38px_96px_-32px_rgba(10,10,10,0.30)]">
      <div className="flex items-center justify-between border-b border-[rgba(20,22,26,0.05)] px-[22px] py-[14px]">
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#e9e6df]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e9e6df]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#e9e6df]" />
        </div>
        <span className="text-xs text-muted-foreground">A draft, in progress</span>
        <span className="inline-flex items-center gap-1.5 text-xs text-[#6f8a78]">
          <span className="h-1.5 w-1.5 rounded-full bg-current" />
          Tracking
        </span>
      </div>

      <div className="grid min-h-[510px] grid-cols-[1.5fr_1fr]">
        <div className="border-r border-[rgba(20,22,26,0.05)] p-9">
          <div className="mb-2 text-[11px] text-muted-foreground">Untitled draft</div>
          <h3 className="mb-4 text-[22px] font-bold leading-[1.2] tracking-[-0.015em]">
            Drafting with attention
          </h3>
          <p className="mb-3 text-[13px] leading-[1.75] text-[#2a2d33]">
            The first thing to notice about a draft is the pause before it.
            Before a sentence lands on the page there is a small, deliberate{' '}
            refusal{' '}
            — the writer choosing not to type yet.
          </p>
          <div className="relative pt-11">
            <div className="absolute left-[-6px] top-1 z-40 flex max-w-[440px] items-center gap-1.5 rounded-[9px] border border-[rgba(20,22,26,0.10)] bg-white/95 px-2 py-1.5 shadow-[0_16px_34px_-22px_rgba(20,22,26,0.55)]">
              {quickActions.map(({ label, Icon }, index) => (
                <div key={label} className="flex min-w-0 items-center gap-1.5">
                  {index === 4 ? <span className="h-4 w-px bg-[rgba(20,22,26,0.12)]" /> : null}
                  <span className="inline-flex min-w-0 items-center gap-1 whitespace-nowrap text-[8.8px] font-medium leading-none text-foreground">
                    <Icon className="h-3 w-3 shrink-0" strokeWidth={1.8} />
                    {label}
                  </span>
                </div>
              ))}
            </div>
            <p className="text-[13px] leading-[1.75] text-muted-foreground">
              <span className="box-decoration-clone bg-[rgba(142,190,238,0.62)] px-[2px] py-[1px]">
                Most drafts fail in this earlier moment, when the mind accepts whatever
                language arrives first. The discipline is to wait, then to choose.
              </span>
            </p>
          </div>
          <span className="humanly-cursor-blink mt-1 inline-block h-[17px] w-0.5 bg-foreground align-text-bottom" />
        </div>

        <div className="flex flex-col bg-[#fcfcfb]">
          <div className="flex items-center justify-between border-b border-[rgba(20,22,26,0.05)] px-3.5 py-3">
            <span className="inline-flex items-center gap-1.5 text-[11.5px] font-bold">
              <span className="grid h-4 w-4 place-items-center rounded bg-foreground text-[9px] text-white">✦</span>
              AI Assistant
            </span>
            <span className="text-xs text-[#a0a2a7]">⚙ + ⟲ ×</span>
          </div>

          <div className="flex flex-1 flex-col gap-2.5 p-3.5 pb-0">
            <div className="self-center rounded-[14px] bg-foreground px-3 py-2 text-[11px] leading-normal text-white">
              Find source support for this paragraph
            </div>
            <div className="flex flex-col gap-1 rounded-lg bg-[#ebede4] p-2 pb-2.5">
              {toolRows.map(({ tool, detail, ms }) => (
                <div
                  key={`${tool}-${detail}`}
                  className="grid grid-cols-[auto_auto_minmax(0,1fr)_auto] items-center gap-1.5 rounded-md border border-[rgba(20,22,26,0.05)] bg-white px-2.5 py-1.5 text-[10px] text-[#2a2d33]"
                >
                  <span className="text-[9px] text-[#6f8a78]">✓</span>
                  <span className="font-bold">{tool}</span>
                  <span className="truncate text-[9px] text-muted-foreground">{detail}</span>
                  <span className="text-muted-foreground">{ms}</span>
                </div>
              ))}
              <p className="px-1 pt-1 text-[10.5px] leading-[1.55] text-[#2a2d33]">
                I found support in the attached PDF: the source frames attention
                as revision discipline, which supports your point about waiting
                before drafting…
              </p>
            </div>
          </div>

          <div className="flex flex-col gap-1.5 p-3">
            <div className="flex items-center gap-1.5 rounded-full bg-[rgba(91,111,140,0.10)] px-2 py-1 text-[10px] font-bold text-[#5b6f8c]">
              <span>⊙</span>
              PDF context available (13 pages)
            </div>
            <div className="flex min-w-0 justify-between gap-2 rounded-md bg-[#ebede4] px-2.5 py-1.5 text-[10px] text-muted-foreground">
              <span className="truncate">moonshotai/Kimi-K2.6 (image+text)</span>
              <span>⇅</span>
            </div>
            <div className="flex items-stretch gap-1.5">
              <div className="flex-1 rounded-md border border-foreground bg-white px-2.5 py-2 text-[10.5px] text-[#a0a2a7]">
                Type your message…
              </div>
              <button className="grid w-8 place-items-center rounded-md bg-[#a0a2a7] text-xs text-white">↗</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AIAssistCard() {
  return (
    <div className="humanly-hover-pop absolute left-[2.5%] top-[33.3%] z-30 w-[18.2%] min-w-[176px] rotate-[-2deg] rounded-[10px] border border-[rgba(20,22,26,0.10)] bg-white px-3.5 py-3 shadow-[0_24px_60px_-18px_rgba(20,22,26,0.40)] hover:z-50 hover:shadow-[0_32px_70px_-18px_rgba(20,22,26,0.48)]">
      <div className="mb-2 flex items-center gap-1.5">
        <span className="grid h-[18px] w-[18px] place-items-center rounded-[5px] bg-foreground text-[10px] font-bold text-white">✦</span>
        <span className="text-[11px] font-bold">AI Assistant</span>
        <span className="ml-auto rounded-full bg-[#dee4ee] px-1.5 py-px text-[8px] font-bold text-[#3a4a64]">SIMPLIFY</span>
      </div>
      <p className="mb-2.5 rounded-md bg-[#ebede4] px-2.5 py-2 text-[10.5px] leading-[1.55] text-[#2a2d33]">
        Most drafts fail when the mind{' '}
        <span className="text-muted-foreground line-through decoration-[#a07868] decoration-[1.5px]">
          accepts whatever language arrives
        </span>{' '}
        <span className="rounded-sm bg-[#dde6df] px-1 font-bold text-[#3a5040]">
          takes what arrives
        </span>
        .
      </p>
      <div className="flex gap-1">
        <span className="rounded-[5px] bg-foreground px-2.5 py-1.5 text-[10px] font-bold text-white">Apply</span>
        <span className="rounded-[5px] border border-[rgba(20,22,26,0.10)] px-2.5 py-1.5 text-[10px] font-bold text-muted-foreground">Discard</span>
      </div>
    </div>
  );
}

function TrackingCard() {
  return (
    <div className="humanly-hover-pop absolute right-[2.5%] top-[9.7%] z-40 w-[18.2%] min-w-[176px] rotate-[2deg] rounded-[10px] border border-[rgba(20,22,26,0.10)] bg-white px-3.5 py-3 shadow-[0_24px_50px_-18px_rgba(20,22,26,0.40)] hover:z-50 hover:shadow-[0_32px_70px_-18px_rgba(20,22,26,0.48)]">
      <div className="mb-2.5 flex justify-between">
        <span className="text-[11px] font-bold">Tracking log</span>
        <span className="text-[9px] text-muted-foreground">live</span>
      </div>
      {logRows.map(([time, kind, rowBg, fg, count]) => (
        <div
          key={`${time}-${kind}`}
          className="grid grid-cols-[50px_1fr_auto] items-center gap-1 border-t border-dashed border-[rgba(20,22,26,0.05)] py-[3px] text-[9.5px] first:border-t-0"
        >
          <span className="text-muted-foreground">{time}</span>
          <span
            className="w-fit rounded-[3px] px-1.5 py-px text-[9px] font-bold"
            style={{ backgroundColor: rowBg, color: fg }}
          >
            {kind}
          </span>
          <span className="text-muted-foreground">{count}</span>
        </div>
      ))}
    </div>
  );
}

function CertificateCard() {
  return (
    <div className="humanly-hover-pop absolute bottom-[5%] right-[3%] z-30 grid min-h-[84px] w-[40%] rotate-[-0.8deg] grid-cols-[1fr_auto] items-center gap-3.5 rounded-[10px] border border-[rgba(20,22,26,0.10)] bg-[#fdfcf7] px-4 py-3 shadow-[0_24px_50px_-18px_rgba(20,22,26,0.40)] hover:z-50 hover:shadow-[0_32px_70px_-18px_rgba(20,22,26,0.48)]">
      <div>
        <div className="mb-1.5 flex items-center gap-1.5">
          <CertBadge />
          <span className="text-[8.5px] font-bold tracking-[0.2em] text-muted-foreground">CERTIFICATE · GENERATED</span>
          <span className="ml-1.5 h-1.5 w-1.5 rounded-full bg-[#6f8a78]" />
        </div>
        <div className="text-sm font-bold tracking-[-0.005em]">Drafting with attention</div>
        <div className="mt-1 whitespace-nowrap text-[9.5px] text-muted-foreground">
          Generated May 19, 2026 · token · 9F3A 7B2C
        </div>
      </div>
      <div className="flex gap-3">
        {[
          ['TYPED', '93%'],
          ['CHARS', '1,204'],
          ['TIME', '18 min'],
        ].map(([label, value]) => (
          <div key={label} className="text-right">
            <div className="text-[8.5px] tracking-[0.12em] text-muted-foreground">{label}</div>
            <div className="mt-0.5 text-sm font-bold tracking-[-0.01em]">{value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ProblemSection() {
  return (
    <section className="px-5 py-[120px] sm:px-8 lg:px-14">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-16 text-center">
          <Eyebrow className="mb-[22px]">Problem</Eyebrow>
          <h2 className="text-[28px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[36px]">
            <span>Did you write this,</span>
            <br />
            <span className="text-[#a0a2a7]">or did AI?</span>
          </h2>
          <p className="mx-auto mt-[22px] max-w-[560px] text-[15px] leading-[1.7] text-muted-foreground sm:text-[17px]">
            The answer should not be a defense. It should be a receipt.
          </p>
        </div>

        <div className="grid gap-6 md:grid-cols-3">
          {problemCards.map((caption, index) => (
            <ProblemCard
              key={caption}
              n={`0${index + 1}`}
              illo={[<ProblemIllo1 key="1" />, <ProblemIllo2 key="2" />, <ProblemIllo3 key="3" />][index]}
              caption={caption}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function ProblemCard({ n, illo, caption }: { n: string; illo: ReactNode; caption: string }) {
  return (
    <div className="humanly-hover-pop flex min-h-[300px] flex-col gap-6 rounded-[14px] border border-[rgba(20,22,26,0.10)] bg-white p-7 hover:shadow-[0_28px_70px_-42px_rgba(20,22,26,0.60)]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">· {n}</span>
        <span className="h-1 w-1 rounded-full bg-foreground" />
      </div>
      <div className="flex flex-1 items-center justify-center">{illo}</div>
      <p className="text-base font-medium leading-[1.4] tracking-[-0.01em]">{caption}</p>
    </div>
  );
}

function TrustModelSection() {
  return (
    <section className="bg-[#f4f5f0] px-5 py-[110px] sm:px-8 lg:px-14">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-14 text-center">
          <Eyebrow className="mb-[22px]">Trust model</Eyebrow>
          <h2 className="text-[28px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[36px]">
            <span>Process beats</span>{' '}
            <span className="text-[#a0a2a7]">prediction.</span>
          </h2>
          <p className="mx-auto mt-[22px] max-w-[640px] text-[15px] leading-[1.7] text-muted-foreground sm:text-[17px]">
            Detectors judge the finished text. Humanly records the work as it happens,
            then lets a reader verify the process later.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <ConceptCard
            n="01"
            illo={<TrustIllo1 />}
            title="Record while writing"
            body="Humanly captures typing, paste, focus, and AI-assist events as the draft is created."
          />
          <ConceptCard
            n="02"
            illo={<TrustIllo2 />}
            title="Verify after writing"
            body="The certificate connects the final text to the process record behind it."
          />
          <ConceptCard
            n="03"
            illo={<TrustIllo3 />}
            title="Avoid guessing"
            body="The goal is not to infer authorship from style, but to show how the work happened."
          />
        </div>
      </div>
    </section>
  );
}

function AudienceSection() {
  return (
    <section className="px-5 py-[110px] sm:px-8 lg:px-14">
      <div className="mx-auto max-w-[1080px]">
        <div className="mb-14 text-center">
          <Eyebrow className="mb-[22px]">Use cases</Eyebrow>
          <h2 className="text-[28px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[36px]">
            <span>One workspace,</span>{' '}
            <span className="text-[#a0a2a7]">two modes.</span>
          </h2>
          <p className="mx-auto mt-[22px] max-w-[640px] text-[15px] leading-[1.7] text-muted-foreground sm:text-[17px]">
            Writers can start personal documents. Instructors and reviewers can use
            assigned tasks when the writing environment needs rules.
          </p>
        </div>

        <div className="grid gap-5 md:grid-cols-3">
          <ConceptCard
            n="01"
            illo={<UseIllo1 />}
            title="For writers"
            body="Draft with AI in a tracked workspace, then share a clean certificate when your process matters."
          />
          <ConceptCard
            n="02"
            illo={<UseIllo2 />}
            title="For instructors"
            body="Create assigned tasks with AI, paste, character, and time rules before students begin."
          />
          <ConceptCard
            n="03"
            illo={<UseIllo3 />}
            title="For reviewers"
            body="Review the writing process and AI assistance trail instead of relying on detector scores alone."
          />
        </div>
      </div>
    </section>
  );
}

function ConceptCard({ n, illo, title, body }: { n: string; illo: ReactNode; title: string; body: string }) {
  return (
    <div className="humanly-hover-pop flex min-h-[360px] flex-col gap-5 rounded-[14px] border border-[rgba(20,22,26,0.10)] bg-white p-7 hover:shadow-[0_28px_70px_-42px_rgba(20,22,26,0.60)]">
      <div className="flex items-center justify-between">
        <span className="text-[11px] text-muted-foreground">· {n}</span>
        <span className="h-1 w-1 rounded-full bg-foreground" />
      </div>
      <div className="flex flex-1 items-center justify-center">{illo}</div>
      <div>
        <h3 className="text-xl font-semibold leading-snug tracking-[-0.015em]">{title}</h3>
        <p className="mt-3 text-[14.5px] leading-[1.65] text-muted-foreground">{body}</p>
      </div>
    </div>
  );
}

function HowItWorksSection() {
  return (
    <section id="process" className="px-5 py-[140px] sm:px-8 lg:px-14">
      <div className="mx-auto max-w-[1240px]">
        <div className="mb-20 text-center">
          <Eyebrow className="mb-[22px]">How it works</Eyebrow>
          <h2 className="text-[28px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[36px]">
            <span>Four steps</span>{' '}
            <span className="text-[#a0a2a7]">to a signed draft.</span>
          </h2>
        </div>

        <div className="grid gap-10 md:grid-cols-4 md:gap-0">
          {steps.map(([number, title, description], index) => (
            <Step
              key={number}
              n={number}
              t={title}
              d={description}
              illo={[
                <StepIllo0 key="0" />,
                <StepIllo1 key="1" />,
                <StepIllo2 key="2" />,
                <StepIllo3 key="3" />,
              ][index]}
              divider={index > 0}
            />
          ))}
        </div>
      </div>
    </section>
  );
}

function Step({ n, t, d, illo, divider }: { n: string; t: string; d: string; illo: ReactNode; divider?: boolean }) {
  return (
    <div className={`flex flex-col gap-[22px] px-0 md:px-7 ${divider ? 'md:border-l md:border-[rgba(20,22,26,0.10)]' : ''}`}>
      <div className="flex h-[180px] items-center justify-center">{illo}</div>
      <div className="flex items-baseline gap-3">
        <span className="text-[11px] text-muted-foreground">{n}</span>
        <h3 className="text-[22px] font-semibold leading-snug tracking-[-0.015em]">{t}</h3>
      </div>
      <p className="text-[14.5px] leading-[1.6] text-muted-foreground">{d}</p>
    </div>
  );
}

function FAQSection() {
  return (
    <section id="faq" className="px-5 py-[120px] sm:px-8 lg:px-14">
      <div className="mx-auto grid max-w-[980px] gap-12 md:grid-cols-[1fr_2fr] md:gap-20">
        <div>
          <Eyebrow className="mb-[22px]">FAQ</Eyebrow>
          <h2 className="text-[28px] font-semibold leading-[1.1] tracking-[-0.015em] sm:text-[36px]">
            <span>Common questions,</span>
            <br />
            <span className="text-[#a0a2a7]">plain answers.</span>
          </h2>
        </div>
        <div>
          {faqs.map(([question, answer], index) => (
            <details
              key={question}
              open={index === 0}
              className="group border-t border-[rgba(20,22,26,0.10)] py-[22px]"
            >
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-left">
                <span className="text-lg font-medium tracking-[-0.005em]">{question}</span>
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-[rgba(20,22,26,0.10)] transition-transform group-open:rotate-45">
                  <PlusIcon />
                </span>
              </summary>
              <p className="mt-3.5 max-w-[580px] text-[15px] leading-[1.6] text-muted-foreground">{answer}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-[rgba(20,22,26,0.10)] px-5 py-9 sm:px-8 lg:px-14">
      <div className="mx-auto flex max-w-[1168px] items-center justify-between gap-4">
        <Link href={marketingHref('/')}>
          <HumanlyWordmark size="sm" />
        </Link>
        <div className="flex shrink-0 flex-wrap justify-end gap-5 text-xs font-medium text-muted-foreground">
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
        </div>
      </div>
    </footer>
  );
}

function Eyebrow({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div className={`text-[11px] font-medium uppercase tracking-[0.18em] text-muted-foreground ${className}`}>
      {children}
    </div>
  );
}

function Arrow() {
  return (
    <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true">
      <path d="M3 7h8M7 3l4 4-4 4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
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
    <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden="true">
      <circle cx="8" cy="6" r="4.5" />
      <path d="M5 9.5 L4 14 L8 12 L12 14 L11 9.5" />
    </svg>
  );
}

function ProblemIllo1() {
  return (
    <svg width="200" height="120" viewBox="0 0 200 120" aria-hidden="true">
      <rect x="20" y="22" width="100" height="76" rx="4" fill="none" stroke={ink} strokeWidth="1.5" />
      <rect x="32" y="36" width="60" height="4" fill={ink} />
      <rect x="32" y="46" width="76" height="4" fill={ink} opacity="0.5" />
      <rect x="32" y="56" width="50" height="4" fill={ink} opacity="0.5" />
      <rect x="32" y="66" width="68" height="4" fill={ink} opacity="0.5" />
      <rect x="32" y="76" width="40" height="4" fill={ink} opacity="0.5" />
      <g transform="translate(130, 30)">
        <path d="M0 30 L60 30 M30 0 L30 60" stroke="#a07868" strokeWidth="3" strokeLinecap="round" transform="rotate(45 30 30)" />
        <path d="M0 30 L60 30 M30 0 L30 60" stroke="#a07868" strokeWidth="3" strokeLinecap="round" transform="rotate(-45 30 30)" />
      </g>
    </svg>
  );
}

function ProblemIllo2() {
  return (
    <svg width="200" height="120" viewBox="0 0 200 120" aria-hidden="true">
      <g stroke={ink} strokeWidth="1.2" fill="none">
        <circle cx="40" cy="40" r="6" />
        <circle cx="100" cy="35" r="6" />
        <circle cx="160" cy="50" r="6" />
        <circle cx="70" cy="80" r="6" />
        <circle cx="140" cy="90" r="6" />
        <path strokeDasharray="2 3" d="M46 40 L94 35 M106 35 L154 50 M40 46 L70 74 M76 80 L134 90 M160 56 L140 84" />
      </g>
      {[
        [40, 44],
        [100, 39],
        [160, 54],
        [70, 84],
        [140, 94],
      ].map(([x, y]) => (
        <text key={`${x}-${y}`} x={x} y={y} fontFamily="var(--font-humanly-sans)" fontSize="6" textAnchor="middle" fill={ink}>?</text>
      ))}
    </svg>
  );
}

function ProblemIllo3() {
  return (
    <svg width="200" height="120" viewBox="0 0 200 120" aria-hidden="true">
      <g fill="none" stroke={ink} strokeWidth="1.4" strokeLinecap="round">
        <path d="M20 60 C40 30, 60 90, 80 60 S 120 30, 140 60 S 180 90, 195 60" />
        <path d="M20 60 C40 90, 60 30, 80 60 S 120 90, 140 60 S 180 30, 195 60" opacity="0.4" />
      </g>
    </svg>
  );
}

function TrustIllo1() {
  return (
    <svg width="200" height="120" viewBox="0 0 200 120" aria-hidden="true">
      <g fill="none" stroke={ink} strokeWidth="1.4" strokeLinecap="round">
        <path d="M28 46 C48 36, 68 56, 88 44 S128 34, 150 50" />
        <path d="M146 46 L162 30 L170 38 L154 54 Z" fill="#fff" />
      </g>
      <g stroke={ink} strokeWidth="0.8" strokeDasharray="1.5 2" opacity="0.45">
        {[40, 60, 80, 100, 120, 140].map((x) => (
          <line key={x} x1={x} y1={x === 60 || x === 100 || x === 120 ? 42 : x === 80 ? 50 : 48} x2={x} y2="80" />
        ))}
      </g>
      <line x1="24" y1="84" x2="172" y2="84" stroke={ink} strokeWidth="1" />
      <g fill={ink}>
        {[40, 60, 80, 100, 120, 140].map((x) => (
          <circle key={x} cx={x} cy="84" r="2" />
        ))}
      </g>
      <text x="172" y="86" fontFamily="var(--font-humanly-sans)" fontSize="6" fill={muted}>→t</text>
    </svg>
  );
}

function TrustIllo2() {
  return (
    <svg width="200" height="120" viewBox="0 0 200 120" aria-hidden="true">
      <rect x="20" y="22" width="62" height="76" rx="3" fill="none" stroke={ink} strokeWidth="1.4" />
      <rect x="30" y="36" width="42" height="3" fill={ink} />
      <g fill={ink} opacity="0.5">
        <rect x="30" y="46" width="46" height="3" />
        <rect x="30" y="56" width="38" height="3" />
        <rect x="30" y="66" width="44" height="3" />
        <rect x="30" y="76" width="32" height="3" />
      </g>
      <line x1="86" y1="60" x2="118" y2="60" stroke={ink} strokeWidth="1.2" strokeDasharray="2.5 3" />
      <g fill="none" stroke={ink} strokeWidth="1.4">
        <circle cx="146" cy="60" r="26" />
        <circle cx="146" cy="60" r="20" strokeWidth="1" strokeDasharray="1.6 2.2" />
      </g>
      <path d="M134 60 L143 70 L160 50" fill="none" stroke={ink} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function TrustIllo3() {
  return (
    <svg width="200" height="140" viewBox="0 0 200 140" aria-hidden="true">
      <g fill="none" stroke={ink} strokeWidth="1.6" strokeLinejoin="round" strokeLinecap="round">
        <path d="M52 44 L120 56 L120 128 L52 120 Z" />
        <path d="M52 44 L82 22 L150 32 L120 56 Z" />
        <path d="M120 56 L150 32 L150 104 L120 128 Z" />
      </g>
      <text x="86" y="100" fontFamily="var(--font-humanly-sans)" fontSize="36" fontWeight="700" textAnchor="middle" fill={ink}>?</text>
    </svg>
  );
}

function UseIllo1() {
  return (
    <svg width="200" height="120" viewBox="0 0 200 120" aria-hidden="true">
      <rect x="44" y="14" width="104" height="84" rx="3" fill="none" stroke={ink} strokeWidth="1.4" />
      <rect x="56" y="28" width="60" height="3" fill={ink} />
      <g fill={ink} opacity="0.5">
        <rect x="56" y="40" width="78" height="3" />
        <rect x="56" y="50" width="64" height="3" />
        <rect x="56" y="60" width="74" height="3" />
      </g>
      <path d="M56 80 C66 72, 76 88, 86 78 S104 70, 112 80" fill="none" stroke={ink} strokeWidth="1.4" strokeLinecap="round" />
      <g fill="#fafaf6" stroke={ink} strokeWidth="1.4">
        <circle cx="160" cy="92" r="18" />
        <circle cx="160" cy="92" r="13" strokeWidth="1" strokeDasharray="1.5 2" fill="none" />
      </g>
      <path d="M152 92 L158 98 L168 86" fill="none" stroke={ink} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function UseIllo2() {
  return (
    <svg width="200" height="120" viewBox="0 0 200 120" aria-hidden="true">
      <rect x="38" y="12" width="124" height="96" rx="4" fill="none" stroke={ink} strokeWidth="1.4" />
      <line x1="38" y1="28" x2="162" y2="28" stroke={hairline} strokeWidth="1" />
      <text x="46" y="24" fontFamily="var(--font-humanly-sans)" fontSize="6" fill={muted}>RULES</text>
      <circle cx="156" cy="22" r="1.6" fill={ink} />

      <text x="46" y="48" fontFamily="var(--font-humanly-sans)" fontSize="7" fill={muted}>AI</text>
      <rect x="118" y="42" width="34" height="11" rx="5.5" fill={ink} />
      <circle cx="146" cy="47.5" r="3.6" fill="#fff" />

      <text x="46" y="70" fontFamily="var(--font-humanly-sans)" fontSize="7" fill={muted}>PASTE</text>
      <rect x="118" y="64" width="34" height="11" rx="5.5" fill="none" stroke={ink} strokeWidth="1.2" />
      <circle cx="124" cy="69.5" r="3.6" fill={ink} />

      <text x="46" y="92" fontFamily="var(--font-humanly-sans)" fontSize="7" fill={muted}>TIME</text>
      <rect x="118" y="86" width="34" height="11" rx="5.5" fill={ink} />
      <circle cx="146" cy="91.5" r="3.6" fill="#fff" />
    </svg>
  );
}

function UseIllo3() {
  return (
    <svg width="200" height="120" viewBox="0 0 200 120" aria-hidden="true">
      <line x1="18" y1="84" x2="182" y2="84" stroke={ink} strokeWidth="1" />
      <g stroke={ink} strokeWidth="1">
        {[30, 50, 70, 90, 110, 130, 150, 170].map((x) => (
          <line key={x} x1={x} y1="78" x2={x} y2="90" />
        ))}
      </g>
      <g fill={ink}>
        {[30, 50, 70, 90, 110, 130, 150, 170].map((x) => (
          <circle key={x} cx={x} cy="84" r="1.6" />
        ))}
      </g>
      <circle cx="100" cy="46" r="28" fill="#fafaf6" stroke={ink} strokeWidth="1.8" />
      <line x1="120" y1="64" x2="138" y2="84" stroke={ink} strokeWidth="2.4" strokeLinecap="round" />
      <line x1="82" y1="46" x2="118" y2="46" stroke={ink} strokeWidth="1" />
      <g fill={ink}>
        <circle cx="88" cy="46" r="2.4" />
        <circle cx="100" cy="46" r="2.4" />
        <circle cx="112" cy="46" r="2.4" />
      </g>
      <text x="100" y="36" fontFamily="var(--font-humanly-sans)" fontSize="5" textAnchor="middle" fill={muted}>
        paste · ai · type
      </text>
    </svg>
  );
}

function StepIllo0() {
  return (
    <svg width="200" height="160" viewBox="0 0 200 160" aria-hidden="true">
      <rect x="14" y="14" width="172" height="132" rx="8" fill="#fff" stroke={ink} strokeWidth="1.2" />
      <text x="26" y="32" fontFamily="var(--font-humanly-sans)" fontSize="8" fontWeight="700" fill={ink}>Document Configuration</text>
      <line x1="14" y1="40" x2="186" y2="40" stroke={hairline} strokeWidth="0.8" />
      <text x="26" y="56" fontFamily="var(--font-humanly-sans)" fontSize="6" fill={muted}>AI</text>
      <rect x="70" y="50" width="48" height="10" rx="2" fill={ink} />
      <text x="94" y="57" textAnchor="middle" fontFamily="var(--font-humanly-sans)" fontSize="6" fontWeight="700" fill="#fff">Assist only</text>
      <rect x="121" y="50" width="20" height="10" rx="2" fill={bg2} />
      <text x="131" y="57" textAnchor="middle" fontFamily="var(--font-humanly-sans)" fontSize="6" fontWeight="700" fill={muted}>Off</text>
      <rect x="144" y="50" width="34" height="10" rx="2" fill={bg2} />
      <text x="161" y="57" textAnchor="middle" fontFamily="var(--font-humanly-sans)" fontSize="6" fontWeight="700" fill={muted}>Full chat</text>
      <text x="26" y="76" fontFamily="var(--font-humanly-sans)" fontSize="6" fill={muted}>Paste</text>
      <rect x="80" y="70" width="34" height="10" rx="2" fill={bg2} />
      <text x="97" y="77" textAnchor="middle" fontFamily="var(--font-humanly-sans)" fontSize="6" fontWeight="700" fill={muted}>Allowed</text>
      <rect x="116" y="70" width="32" height="10" rx="2" fill={ink} />
      <text x="132" y="77" textAnchor="middle" fontFamily="var(--font-humanly-sans)" fontSize="6" fontWeight="700" fill="#fff">Blocked</text>
      <text x="26" y="96" fontFamily="var(--font-humanly-sans)" fontSize="6" fill={muted}>Cap</text>
      <rect x="80" y="90" width="92" height="10" rx="2" fill="none" stroke={hairline} />
      <text x="86" y="97" fontFamily="var(--font-humanly-sans)" fontSize="6" fontWeight="700" fill={ink}>10,000 chars</text>
      <text x="26" y="116" fontFamily="var(--font-humanly-sans)" fontSize="6" fill={muted}>Time</text>
      <rect x="80" y="110" width="60" height="10" rx="2" fill="none" stroke={hairline} />
      <text x="86" y="117" fontFamily="var(--font-humanly-sans)" fontSize="6" fontWeight="700" fill={ink}>45 min</text>
      <rect x="120" y="128" width="52" height="12" rx="3" fill={ink} />
      <text x="146" y="136" textAnchor="middle" fontFamily="var(--font-humanly-sans)" fontSize="7" fontWeight="700" fill="#fff">Start →</text>
    </svg>
  );
}

function StepIllo1() {
  return (
    <svg width="200" height="160" viewBox="0 0 200 160" aria-hidden="true">
      <rect x="14" y="14" width="172" height="132" rx="8" fill="#fff" stroke={ink} strokeWidth="1.2" />
      <line x1="14" y1="38" x2="186" y2="38" stroke={hairline} strokeWidth="1" />
      <circle cx="26" cy="26" r="2.5" fill={muted} /><circle cx="34" cy="26" r="2.5" fill={muted} /><circle cx="42" cy="26" r="2.5" fill={muted} />
      <rect x="26" y="54" width="100" height="6" rx="1" fill={ink} />
      <rect x="26" y="72" width="148" height="3" rx="1" fill={muted} opacity="0.5" />
      <rect x="26" y="82" width="118" height="3" rx="1" fill={muted} opacity="0.5" />
      <rect x="26" y="92" width="136" height="3" rx="1" fill={muted} opacity="0.5" />
      <rect x="26" y="102" width="76" height="3" rx="1" fill={muted} opacity="0.5" />
      <circle cx="166" cy="127" r="4" fill={good} />
    </svg>
  );
}

function StepIllo2() {
  const rows: Array<[string, string, string, string, string, number]> = [
    ['12:41:48', 'input', '#dde6df', '#4a655a', '796', 50],
    ['12:41:48', 'focus', '#dadfd9', '#56655a', '796', 70],
    ['12:41:31', '✦ Simplify', '#dee4ee', '#3a4a64', 'AI', 90],
    ['12:41:16', 'delete', '#e5e5e2', '#65655f', '44', 110],
    ['12:41:21', 'select', '#e5e5e2', '#65655f', '0', 130],
  ];

  return (
    <svg width="200" height="160" viewBox="0 0 200 160" aria-hidden="true">
      <rect x="14" y="14" width="172" height="132" rx="8" fill="#fff" stroke={ink} strokeWidth="1.2" />
      <line x1="14" y1="34" x2="186" y2="34" stroke={hairline} strokeWidth="1" />
      <text x="24" y="28" fontFamily="var(--font-humanly-sans)" fontSize="6" fill={muted}>TIME</text>
      <text x="60" y="28" fontFamily="var(--font-humanly-sans)" fontSize="6" fill={muted}>KIND</text>
      <text x="172" y="28" textAnchor="end" fontFamily="var(--font-humanly-sans)" fontSize="6" fill={muted}>CHARS</text>
      {rows.map(([time, kind, rowBg, fg, chars, y]) => (
        <g key={`${time}-${kind}`}>
          <text x="24" y={Number(y)} fontFamily="var(--font-humanly-sans)" fontSize="6" fill={muted}>{time}</text>
          <rect x="58" y={Number(y) - 6} width={kind === '✦ Simplify' ? 44 : 34} height="9" rx="2" fill={rowBg} />
          <text x={kind === '✦ Simplify' ? 80 : 75} y={Number(y) + 0.5} textAnchor="middle" fontFamily="var(--font-humanly-sans)" fontSize="6" fontWeight="700" fill={fg}>{kind}</text>
          <text x="172" y={Number(y)} textAnchor="end" fontFamily="var(--font-humanly-sans)" fontSize="6" fill={kind === '✦ Simplify' ? muted : ink}>{chars}</text>
          {Number(y) < 130 && <line x1="20" y1={Number(y) + 8} x2="180" y2={Number(y) + 8} stroke={hairline} strokeWidth="0.5" strokeDasharray="2 2" />}
        </g>
      ))}
    </svg>
  );
}

function StepIllo3() {
  return (
    <svg width="200" height="160" viewBox="0 0 200 160" aria-hidden="true">
      <rect x="14" y="14" width="172" height="132" rx="8" fill="#fff" stroke={ink} strokeWidth="1.2" />
      <text x="100" y="38" textAnchor="middle" fontFamily="var(--font-humanly-sans)" fontSize="7" fill={ink} letterSpacing="2">CERTIFICATE</text>
      <line x1="42" y1="54" x2="158" y2="54" stroke={ink} strokeWidth="1.6" strokeLinecap="round" />
      <line x1="50" y1="70" x2="150" y2="70" stroke={muted} strokeWidth="1.2" strokeLinecap="round" opacity="0.65" />
      <line x1="42" y1="88" x2="158" y2="88" stroke={hairline} strokeWidth="1" />
      <g transform="translate(54 112)">
        <text fontFamily="var(--font-humanly-sans)" fontSize="6" fill={muted}>SIGNED</text>
        <path d="M2 13 L6 17 L15 6" fill="none" stroke={ink} strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </g>
      <g transform="translate(142 120)" stroke={ink} fill="none" strokeWidth="1">
        <circle r="13" />
        <circle r="9.5" strokeDasharray="1 2" />
        <path d="M-4.5 -4 V4 M4.5 -4 V4 M-4.5 0 H4.5" strokeWidth="1.2" strokeLinecap="round" />
      </g>
    </svg>
  );
}

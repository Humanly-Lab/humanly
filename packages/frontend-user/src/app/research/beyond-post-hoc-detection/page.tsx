import type { Metadata } from 'next';
import Link from 'next/link';
import { cookies } from 'next/headers';
import { ArrowLeft, ArrowUpRight } from 'lucide-react';
import { SiteNav } from '@/components/marketing/site-nav';
import { SiteFooter } from '@/components/marketing/site-footer';
import {
  MARKETING_LOCALE_COOKIE,
  normalizeMarketingLocale,
} from '@/lib/marketing-i18n';

export const metadata: Metadata = {
  title: 'Beyond Post-hoc Detection — Humanly',
  description:
    'Why finished text cannot explain how a document was made, and why writing provenance requires process evidence.',
};

const historyPairs = [
  {
    label: 'Original',
    compliant: ['Human writes the text'],
    nonCompliant: ['AI generates the text'],
  },
  {
    label: 'Polish',
    compliant: ['Human draft', 'AI polish'],
    nonCompliant: ['AI draft', 'Human polish'],
  },
  {
    label: 'Translation',
    compliant: ['Human-authored source', 'AI translation'],
    nonCompliant: ['AI-generated source', 'AI translation'],
  },
  {
    label: 'Style',
    compliant: ['Human writes in an AI-like style'],
    nonCompliant: ['AI writes in a human-like style'],
  },
] as const;

const detectorResults = [
  {
    name: 'Claude Opus 4.8',
    policy: 52.9,
    documentClass: 34.2,
  },
  {
    name: 'GPTZero',
    policy: 85.4,
    documentClass: 47.5,
  },
  {
    name: 'Pangram',
    policy: 86.7,
    documentClass: 45.4,
  },
] as const;

const contents = [
  ['wrong-question', 'The wrong question'],
  ['many-histories', 'One output, many histories'],
  ['stress-test', 'A policy stress test'],
  ['results', 'What the detectors found'],
  ['useful-for', 'What detection is useful for'],
  ['process-evidence', 'From prediction to evidence'],
  ['human-authenticity', 'Human authenticity'],
] as const;

function ProcessSteps({ steps }: { steps: readonly string[] }) {
  return (
    <div className="flex min-w-0 flex-wrap items-center gap-2 text-[12px] leading-[1.5]">
      {steps.map((step, index) => (
        <span className="contents" key={step}>
          {index > 0 ? (
            <span className="text-muted-foreground" aria-hidden="true">
              →
            </span>
          ) : null}
          <span className="text-foreground">{step}</span>
        </span>
      ))}
    </div>
  );
}

function ProductionHistoryFigure() {
  return (
    <figure className="mt-12 overflow-hidden rounded-lg border border-[var(--hly-hairline)] bg-[var(--hly-surface)]">
      <h2 className="px-5 py-5 text-[17px] font-light leading-[1.45] sm:px-7 sm:text-[19px]">
        Same output. Different histories.
      </h2>
      <div className="grid grid-cols-[92px_1fr_1fr] border-t border-[var(--hly-hairline)] text-[10px] font-medium uppercase">
        <span className="px-4 py-3 text-muted-foreground sm:px-5">Context</span>
        <span className="bg-[var(--hly-green-bg-soft)] px-4 py-3 text-[var(--hly-green-text)] sm:px-5">
          Policy-compliant
        </span>
        <span className="bg-[var(--hly-red-bg)] px-4 py-3 text-[var(--hly-red-text)] sm:px-5">
          Non-compliant
        </span>
      </div>
      {historyPairs.map((pair) => (
        <div
          className="grid grid-cols-[92px_1fr_1fr] border-t border-[var(--hly-hairline)]"
          key={pair.label}
        >
          <div className="px-4 py-4 text-[10px] font-medium uppercase text-muted-foreground sm:px-5">
            {pair.label}
          </div>
          <div className="px-4 py-4 sm:px-5">
            <ProcessSteps steps={pair.compliant} />
          </div>
          <div className="px-4 py-4 sm:px-5">
            <ProcessSteps steps={pair.nonCompliant} />
          </div>
        </div>
      ))}
    </figure>
  );
}

function DetectorResultsFigure() {
  const series = [
    {
      key: 'policy',
      label: 'Policy accuracy',
      color: 'var(--hly-green-text)',
    },
    {
      key: 'documentClass',
      label: 'History agreement',
      color: 'var(--hly-info)',
    },
  ] as const;

  return (
    <figure className="my-12 rounded-lg border border-[var(--hly-hairline)] bg-[var(--hly-surface)] px-5 py-5 sm:px-7 sm:py-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 className="text-[15px] font-medium">
          Policy accuracy vs. history agreement
        </h3>
        <div className="flex gap-4" aria-label="Chart legend">
          {series.map((metric) => (
            <div
              className="flex items-center gap-2 text-[10px] text-muted-foreground"
              key={metric.key}
            >
              <span
                className="h-2 w-2 rounded-sm"
                style={{ backgroundColor: metric.color }}
              />
              <span>{metric.label}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-7 grid grid-cols-[34px_minmax(0,1fr)] gap-3">
        <div className="relative h-[220px] text-[9px] tabular-nums text-muted-foreground">
          <span className="absolute -top-1 right-0">100</span>
          <span className="absolute right-0 top-1/2 -translate-y-1/2">50</span>
          <span className="absolute -bottom-1 right-0">0</span>
        </div>

        <div>
          <div className="relative h-[220px] border-b border-l border-[var(--hly-hairline)]">
            <span className="absolute inset-x-0 top-1/2 border-t border-[var(--hly-hairline)]" />
            <div className="absolute inset-0 grid grid-cols-3 items-end gap-5 px-5 sm:gap-8 sm:px-8">
              {detectorResults.map((result) => (
                <div
                  className="flex h-full items-end justify-center gap-2"
                  key={result.name}
                >
                  {series.map((metric) => (
                    <div
                      className="relative w-7 rounded-t-sm"
                      key={metric.key}
                      style={{
                        backgroundColor: metric.color,
                        height: `${result[metric.key]}%`,
                      }}
                    >
                      <span className="absolute -top-5 left-1/2 -translate-x-1/2 text-[9px] tabular-nums text-foreground">
                        {result[metric.key].toFixed(1)}
                      </span>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>

          <div className="mt-3 grid grid-cols-3 gap-5 px-5 text-center text-[10px] leading-[1.35] text-muted-foreground sm:gap-8 sm:px-8">
            {detectorResults.map((result) => (
              <span key={result.name}>{result.name}</span>
            ))}
          </div>
          <p className="mt-3 text-center text-[9px] font-medium uppercase text-muted-foreground">
            Detector
          </p>
        </div>
      </div>
    </figure>
  );
}

function EvidenceComparison() {
  const approaches = [
    {
      title: 'Final-text inference',
      items: [
        ['Reads', 'Finished text'],
        ['Produces', 'A score'],
        ['Best for', 'Triage'],
      ],
    },
    {
      title: 'Process evidence',
      items: [
        ['Reads', 'Writing events'],
        ['Produces', 'A chronology'],
        ['Best for', 'Verification'],
      ],
    },
  ] as const;

  return (
    <figure className="my-12 overflow-hidden rounded-lg border border-[var(--hly-hairline)]">
      <div className="grid sm:grid-cols-2">
        {approaches.map((approach, index) => (
          <section
            className={
              index === 0
                ? 'bg-[var(--hly-surface)] px-5 py-5 sm:px-6'
                : 'border-t border-[var(--hly-hairline)] bg-[var(--hly-green-bg-soft)] px-5 py-5 sm:border-l sm:border-t-0 sm:px-6'
            }
            key={approach.title}
          >
            <h3 className="text-[15px] font-medium">{approach.title}</h3>
            <dl className="mt-4 divide-y divide-[var(--hly-hairline)]">
              {approach.items.map(([label, value]) => (
                <div className="py-3 first:pt-0 last:pb-0" key={label}>
                  <dt className="text-[10px] font-medium uppercase text-muted-foreground">
                    {label}
                  </dt>
                  <dd className="mt-1 text-[13px] leading-[1.5]">{value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ))}
      </div>
    </figure>
  );
}

const sectionHeading =
  'scroll-mt-24 pt-14 text-[20px] font-light leading-[1.35] sm:text-[23px]';
const paragraph = 'mt-5 text-[16px] leading-[1.85] text-foreground/90 sm:text-[17px]';

export default function BeyondPostHocDetectionPage() {
  const locale = normalizeMarketingLocale(
    cookies().get(MARKETING_LOCALE_COOKIE)?.value
  );

  return (
    <main className="min-h-screen bg-background text-foreground">
      <SiteNav locale={locale} />

      <article>
        <header className="px-5 pb-10 pt-14 sm:px-8 sm:pb-14 sm:pt-20 lg:px-14">
          <div className="mx-auto max-w-[840px]">
            <div className="min-w-0">
              <Link
                href="/research"
                className="humanly-landing-btn-ghost mb-8 w-fit px-4 py-2 text-[13px]"
              >
                <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                Back to Research
              </Link>
              <time
                dateTime="2026-07-12"
                className="block text-[13px] text-muted-foreground"
              >
                July 12, 2026
              </time>
              <h1 className="mt-3 text-[26px] font-light leading-[1.3]">
                Beyond Post-hoc Detection
              </h1>
              <p className="mt-4 text-[15px] leading-[1.7] text-muted-foreground">
                Why finished text cannot explain how a document was made.
              </p>
              <p className="mt-6 text-[13px] text-muted-foreground">
                Shenzhe Zhu · Humanly Lab · 8 min read
              </p>

              <ProductionHistoryFigure />
            </div>
          </div>
        </header>

        <div className="px-5 pb-24 sm:px-8 lg:px-14">
          <div className="mx-auto grid max-w-[840px] gap-12 lg:grid-cols-[150px_minmax(0,640px)] lg:gap-12">
            <aside className="hidden lg:block" aria-label="Article contents">
              <nav className="sticky top-24">
                <p className="text-[11px] font-medium uppercase text-muted-foreground">
                  In this article
                </p>
                <ol className="mt-4 grid gap-2">
                  {contents.map(([id, label], index) => (
                    <li key={id}>
                      <a
                        href={`#${id}`}
                        className="grid grid-cols-[20px_1fr] gap-2 text-[12px] leading-[1.45] text-muted-foreground transition-colors hover:text-foreground"
                      >
                        <span className="tabular-nums text-foreground/40">
                          {String(index + 1).padStart(2, '0')}
                        </span>
                        <span>{label}</span>
                      </a>
                    </li>
                  ))}
                </ol>
              </nav>
            </aside>

            <div className="min-w-0 max-w-[640px]">
              <p className="text-[17px] leading-[1.85] text-foreground sm:text-[18px]">
                The most common question about AI-written text is also the
                least answerable one: <em>Did a human write this?</em> A
                finished document can carry stylistic clues, but it does not
                carry its own production history.
              </p>

              <section id="wrong-question">
                <h2 className={sectionHeading}>The wrong question</h2>
                <p className={paragraph}>
                  Post-hoc detectors inspect text after writing ends. They look
                  for patterns associated with model output and return a score
                  or label. That can be useful when the operational question
                  is simply, &ldquo;Which documents deserve another look?&rdquo;
                </p>
                <p className={paragraph}>
                  But many real policies ask something else. Was AI allowed to
                  polish a human draft? Was translation permitted? Did the
                  writer begin with their own ideas, or did a model generate
                  the substance? Those are questions about process and policy,
                  not style.
                </p>
                <blockquote className="my-10 border-l-2 border-[var(--hly-brand)] pl-6 text-[18px] font-light leading-[1.6] text-foreground sm:text-[21px]">
                  Final text is an outcome. Authorship is a history.
                </blockquote>
              </section>

              <section id="many-histories">
                <h2 className={sectionHeading}>One output, many histories</h2>
                <p className={paragraph}>
                  Consider two fluent paragraphs. One began as a human draft
                  and received an AI grammar pass. The other began as an AI
                  draft and was polished by a human. Their surfaces may
                  converge even though their production histories run in
                  opposite directions.
                </p>
                <p className={paragraph}>
                  The same collapse happens with translation and style. Human
                  prose can be formal, repetitive, non-native, or deliberately
                  model-like. AI prose can be prompted to sound personal and
                  uneven. Once the sequence of actions is discarded, a
                  detector has to infer the missing history from the outcome.
                </p>
              </section>

              <section id="stress-test">
                <h2 className={sectionHeading}>A policy stress test</h2>
                <p className={paragraph}>
                  We built an exploratory stress test around this ambiguity.
                  It contains 240 samples: eight construction cases, three
                  length buckets, and ten matched task sets. The buckets cover
                  short social posts, student responses, and longer
                  review-style writing.
                </p>
                <p className={paragraph}>
                  Four cases are compliant under the benchmark policy: human
                  originals, human drafts polished by AI, human non-English
                  sources translated by AI, and human-written text that
                  deliberately resembles AI. Four matched cases are
                  non-compliant because substantive generation originates with
                  AI. The policy is intentionally specific. It tests whether a
                  detector can distinguish allowed assistance from prohibited
                  generation, not whether AI use is inherently acceptable.
                </p>
                <p className={paragraph}>
                  Claude Opus 4.8, GPTZero, and Pangram received final text
                  only. Each prediction was mapped both to a three-class label
                  (human-only, mixed, or AI-only) and to binary policy
                  compliance.
                </p>
              </section>

              <section id="results">
                <h2 className={sectionHeading}>What the detectors found</h2>
                <p className={paragraph}>
                  GPTZero and Pangram performed well as suspicion filters. Their
                  policy accuracy reached 85.4% and 86.7%, with false-negative
                  rates of 2.5% and 1.7%. Claude Opus 4.8 reached 52.9% policy
                  accuracy in the same setup.
                </p>
                <DetectorResultsFigure />
                <p className={paragraph}>
                  The tradeoff appears in compliant writing. GPTZero flagged
                  26.7% of compliant samples as suspicious, Pangram flagged
                  25.0%, and Opus flagged 33.3%. Both commercial detectors
                  marked every human-written AI-style sample in C4 as
                  suspicious.
                </p>
                <p className={paragraph}>
                  Their exact three-class agreement was also much lower than
                  their binary policy score: 47.5% for GPTZero and 45.4% for
                  Pangram. Even that three-class task is coarser than recovering
                  the true sequence of human and AI actions. The gap is not a
                  contradiction. It shows that detecting likely AI origin and
                  reconstructing production history are different tasks.
                </p>
              </section>

              <section id="useful-for">
                <h2 className={sectionHeading}>
                  What final-text detection is still useful for
                </h2>
                <p className={paragraph}>
                  These results do not make final-text detectors useless. A
                  high-recall detector can help triage large collections,
                  prioritize manual review, or add one signal to a broader
                  integrity workflow. In settings without process data, it may
                  be the only available signal.
                </p>
                <p className={paragraph}>
                  The problem begins when a probability inferred from style is
                  treated as provenance. A suspicion score does not identify
                  which tool was used, when it was used, what it changed, or
                  whether that use followed the policy in force. It should not
                  be presented as a receipt for authorship.
                </p>
                <p className={paragraph}>
                  This distinction also matters for human writers whose prose
                  resembles detector training patterns. Prior work has shown
                  that AI detectors can disproportionately misclassify
                  non-native English writing. The cost of a false positive is
                  not abstract when the score is used to make claims about a
                  person&apos;s conduct.
                </p>
              </section>

              <section id="process-evidence">
                <h2 className={sectionHeading}>
                  From prediction to process evidence
                </h2>
                <p className={paragraph}>
                  A provenance-first system changes the unit of analysis. It
                  records the policy before writing starts and captures the
                  in-platform actions that produce the document: typing,
                  revision, paste, and AI assistance. Review can then ask what
                  happened instead of asking a model to guess what probably
                  happened.
                </p>
                <EvidenceComparison />
                <p className={paragraph}>
                  Humanly operationalizes this approach by packaging the
                  writing environment, authorship statistics, activity log,
                  replay, anomaly signals, and signature into a certificate.
                  The certificate does not claim visibility into behavior
                  outside the workspace. It makes the recorded process and its
                  boundaries explicit.
                </p>
              </section>

              <section id="human-authenticity">
                <h2 className={sectionHeading}>
                  Human authenticity in the age of AI agents
                </h2>
                <p className={paragraph}>
                  Human authenticity is not the absence of AI. It is the
                  ability to understand how work was produced, what a person
                  contributed, where judgment entered, and how AI participated.
                  That makes transparency more useful than prohibition and
                  evidence more useful than inference.
                </p>
                <p className={paragraph}>
                  Moving beyond post-hoc detection does not mean abandoning
                  detectors. It means putting them in the right place. Use
                  predictions to decide where to look. Use process evidence to
                  understand what happened.
                </p>
              </section>

              <section className="mt-16 rounded-lg bg-[var(--hly-surface)] p-6 sm:p-8">
                <h2 className="text-[18px] font-medium">Methodology note</h2>
                <p className="mt-3 text-[13px] leading-[1.75] text-muted-foreground">
                  This article reports an archived exploratory evaluation from
                  the Humanly research project. It is not presented as a
                  peer-reviewed benchmark. The 240 samples comprise eight cases
                  × three length buckets × ten matched task sets. Reported
                  values come from the June 2026 archived detector run.
                </p>
                <a
                  href="https://anonymous.4open.science/r/humanly-detector-stress-test-artifacts-3D10/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-5 inline-flex items-center gap-2 text-[13px] font-medium text-foreground hover:text-[var(--hly-brand-hover)]"
                >
                  View the stress-test artifact
                  <ArrowUpRight className="h-4 w-4" aria-hidden="true" />
                </a>
              </section>

              <section className="pt-14">
                <h2 className="text-[20px] font-light">References</h2>
                <ol className="mt-5 grid gap-3 text-[12px] leading-[1.7] text-muted-foreground">
                  <li>
                    1. Liang et al. (2023).{' '}
                    <a
                      className="underline decoration-border underline-offset-4 hover:text-foreground"
                      href="https://doi.org/10.1016/j.patter.2023.100779"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      GPT Detectors Are Biased Against Non-Native English
                      Writers
                    </a>
                    .
                  </li>
                  <li>
                    2. Zhu et al. (2026).{' '}
                    <a
                      className="underline decoration-border underline-offset-4 hover:text-foreground"
                      href="/research/humanly-tech-report.pdf"
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Humanly: A Configurable and Traceable Environment for
                      Human-AI Collaborative Writing
                    </a>
                    .
                  </li>
                </ol>
              </section>

              <div className="mt-16">
                <Link
                  href="/research"
                  className="humanly-landing-btn-ghost w-fit px-4 py-2 text-[13px]"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back to Research
                </Link>
              </div>
            </div>
          </div>
        </div>
      </article>

      <SiteFooter locale={locale} />
    </main>
  );
}

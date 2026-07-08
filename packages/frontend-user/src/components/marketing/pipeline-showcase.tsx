'use client';

// Continuous walkthrough of the real product flow: the four scenes play in
// sequence (configure -> write -> record -> certify) and loop. The step
// buttons let the user jump to and replay any scene, then the flow continues.
// Scenes replicate the real screens (/documents/new, the 3-pane workspace,
// /logs/[id], and the certificate evidence view). The fake cursor is anchored
// to real DOM nodes measured at runtime.
import {
  ArrowLeft,
  Award,
  ChevronDown,
  Clock,
  Eye,
  FileText,
  HelpCircle,
  Upload,
} from 'lucide-react';
import { useEffect, useRef, useState, type ReactNode } from 'react';

type Kind = 'input' | 'paste' | 'blocked' | 'ai chat';
const KIND_STYLE: Record<Kind, { bg: string; fg: string }> = {
  input: { bg: 'var(--hly-green-tint)', fg: 'var(--hly-green-strong)' },
  paste: { bg: 'var(--hly-paste-bg)', fg: 'var(--hly-paste-text)' },
  blocked: { bg: 'var(--hly-red-bg)', fg: 'var(--hly-red-text)' },
  'ai chat': { bg: 'var(--hly-ai-bg)', fg: 'var(--hly-ai-text)' },
};

const STEPS = ['01 Configure', '02 Write', '03 Record', '04 Certify'] as const;
const DOC_NAME = 'On Attention';
const LINE_1 = 'The first thing to notice about a draft is the pause before it. ';
const ERR_SENTENCE = 'The discipline are to wait, then to choose.';
const LOG_ROWS: Array<[string, Kind, string, string]> = [
  ['12:41:48', 'input', '"The first thing to notice about a draft…"', '+64'],
  ['12:41:52', 'input', '"…is the pause before it. Before a sentence…"', '+118'],
  ['12:42:03', 'paste', '"Attention reshaped how models handle…"', '+186'],
  ['12:42:08', 'ai chat', 'Fix grammar (shortcut)', '1'],
  ['12:42:11', 'blocked', 'Clipboard blocked by writing policy', '✕'],
  ['12:42:14', 'input', '"The discipline is to wait, then to choose."', '+42'],
];

type WritePhase = 'typing' | 'selected' | 'diff' | 'applied';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const CURSOR_MS = 700; // must match the cursor's transition duration below

function Chrome({ path }: { path: string }) {
  return (
    <div className="flex items-center gap-1.5 border-b border-[var(--hly-hairline)] bg-[#FCFCFB] px-3.5 py-2">
      {[0, 1, 2].map((i) => (
        <span key={i} className="h-2 w-2 rounded-full bg-[#e9e6df]" />
      ))}
      <span className="mx-auto rounded border border-[var(--hly-hairline)] bg-white px-4 py-0.5 text-[9.5px] text-muted-foreground">
        humanly.ai{path}
      </span>
    </div>
  );
}

function Scene({ active, children }: { active: boolean; children: ReactNode }) {
  return (
    <div
      className={`absolute inset-0 flex flex-col transition-all duration-500 ease-out ${
        active ? 'z-10 opacity-100' : 'z-0 scale-[0.99] opacity-0'
      }`}
    >
      {children}
    </div>
  );
}

export function PipelineShowcase() {
  const [scene, setScene] = useState(0);
  const [docName, setDocName] = useState('');
  const [text, setText] = useState('');
  const [writePhase, setWritePhase] = useState<WritePhase>('typing');
  const [logCount, setLogCount] = useState(0);
  const [sealed, setSealed] = useState(false);
  const [pressed, setPressed] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0, click: false, shown: false });
  const stageRef = useRef<HTMLDivElement>(null);
  const certScrollRef = useRef<HTMLDivElement>(null);
  const runIdRef = useRef(0);

  useEffect(() => {
    const id = ++runIdRef.current;
    const alive = () => runIdRef.current === id;
    const reduced =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    const locate = (name: string, dx = 0, dy = 0) => {
      const stage = stageRef.current;
      const el = stage?.querySelector<HTMLElement>(`[data-t="${name}"]`);
      if (!stage || !el) return null;
      const s = stage.getBoundingClientRect();
      const r = el.getBoundingClientRect();
      return { x: r.left - s.left + r.width / 2 + dx, y: r.top - s.top + r.height / 2 + dy };
    };

    const moveToEl = async (name: string, dx = 0, dy = 0) => {
      const p = locate(name, dx, dy);
      if (!p) return;
      setCursor((c) => ({ ...c, x: p.x, y: p.y, shown: true }));
      await sleep(CURSOR_MS + 90);
    };

    const click = async (name: string) => {
      setPressed(name);
      setCursor((c) => ({ ...c, click: true }));
      await sleep(280);
      setPressed(null);
      setCursor((c) => ({ ...c, click: false }));
      await sleep(160);
    };

    const typeInto = async (
      line: string,
      set: (fn: (t: string) => string) => void,
      pace = 46
    ) => {
      for (let i = 0; i < line.length && alive(); i += 2) {
        const piece = line.slice(i, i + 2);
        set((t) => t + piece);
        await sleep(pace);
      }
    };

    setDocName('');
    setText('');
    setWritePhase('typing');
    setLogCount(0);
    setSealed(false);
    setPressed(null);
    if (certScrollRef.current) certScrollRef.current.scrollTop = 0;

    if (reduced) {
      setDocName(DOC_NAME);
      setText(LINE_1);
      setWritePhase('applied');
      setLogCount(LOG_ROWS.length);
      setSealed(true);
      setCursor((c) => ({ ...c, shown: false }));
      return;
    }

    const scripts: Record<number, () => Promise<void>> = {
      // 01 · fill the form, create the document
      0: async () => {
        await moveToEl('s0-name');
        if (!alive()) return;
        await click('s0-name');
        await typeInto(DOC_NAME, setDocName, 72);
        await sleep(400);
        await moveToEl('s0-create');
        if (!alive()) return;
        await click('s0-create');
        await sleep(1200);
      },
      // 02 · type, select, Fix grammar shortcut, apply the AI diff, open logs
      1: async () => {
        await moveToEl('s1-editor', -40, -10);
        if (!alive()) return;
        await click('s1-editor');
        await typeInto(LINE_1, setText);
        await sleep(250);
        await typeInto(ERR_SENTENCE, setText);
        await sleep(500);
        // select the faulty sentence: drag from its start to its end
        await moveToEl('s1-sentence', -150, 0);
        setCursor((c) => ({ ...c, click: true }));
        await moveToEl('s1-sentence', 150, 0);
        setCursor((c) => ({ ...c, click: false }));
        setWritePhase('selected');
        await sleep(700);
        if (!alive()) return;
        // shortcut: Fix grammar
        await moveToEl('s1-fix');
        await click('s1-fix');
        setWritePhase('diff');
        await sleep(1400);
        if (!alive()) return;
        // confirm the AI edit
        await moveToEl('s1-apply');
        await click('s1-apply');
        setWritePhase('applied');
        await sleep(900);
        if (!alive()) return;
        await moveToEl('s1-log');
        await click('s1-log');
        await sleep(1000);
      },
      // 03 · watch the record build
      2: async () => {
        setCursor((c) => ({ ...c, shown: true }));
        await moveToEl('s2-list', 0, 10);
        for (let i = 1; i <= LOG_ROWS.length && alive(); i++) {
          setLogCount(i);
          await sleep(320);
        }
        await moveToEl('s2-summary');
        await sleep(1800);
      },
      // 04 · certificate: seal, then scroll through the evidence sections
      3: async () => {
        setCursor((c) => ({ ...c, shown: true }));
        await sleep(300);
        setSealed(true);
        await moveToEl('s3-stats');
        for (const top of [150, 330, 520]) {
          if (!alive()) return;
          certScrollRef.current?.scrollTo({ top, behavior: 'smooth' });
          setCursor((c) => ({ ...c, y: Math.min(c.y + 26, 360) }));
          await sleep(1400);
        }
        await sleep(1400);
      },
    };

    const run = async () => {
      await sleep(550);
      if (!alive()) return;
      await scripts[scene]();
      if (alive()) setScene((scene + 1) % STEPS.length);
    };
    void run();

    return () => {
      if (runIdRef.current === id) {
        runIdRef.current = id + 1;
      }
    };
  }, [scene]);

  const press = (name: string) => (pressed === name ? 'scale-95' : '');

  return (
    <div className="mx-auto w-full max-w-[880px]">
      <div className="mb-5 flex flex-wrap justify-center gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => setScene(i)}
            className={`rounded-md border px-3.5 py-1.5 text-[12px] font-medium transition-all duration-200 ${
              scene === i
                ? 'border-primary bg-primary text-primary-foreground shadow-sm'
                : 'border-input bg-transparent text-muted-foreground hover:-translate-y-px hover:border-foreground/30 hover:text-foreground'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      <div
        ref={stageRef}
        aria-hidden
        className="pointer-events-none relative h-[440px] select-none overflow-hidden rounded-[14px] border border-[var(--hly-hairline)] bg-white shadow-[0_28px_70px_-32px_rgba(35,32,25,0.35)]"
      >
        {/* 01 · Create Writing (/documents/new) */}
        <Scene active={scene === 0}>
          <Chrome path="/documents/new" />
          <div className="flex flex-1 flex-col bg-background p-4">
            <p className="text-[10px] text-muted-foreground">← Back to Workspace</p>
            <div className="mt-1 flex items-end justify-between">
              <h3 className="text-[18px] font-semibold tracking-[-0.02em]">Create Writing</h3>
              <span className="flex items-center gap-1 rounded-md border border-input bg-transparent px-3 py-1.5 text-[10.5px] font-medium">
                <Eye className="h-3 w-3" /> Preview
              </span>
            </div>
            <div className="mt-2.5 grid flex-1 grid-cols-[1fr_0.9fr] overflow-hidden rounded-lg border border-border/80 bg-card">
              <div className="border-r border-border/60 p-3.5">
                <p className="humanly-eyebrow">Basic Information</p>
                <p className="mt-2.5 text-[11px] font-semibold">Document Name</p>
                <div
                  data-t="s0-name"
                  className={`mt-1 flex h-7 items-center rounded-md border bg-card px-2 text-[11.5px] transition-shadow ${
                    docName && docName.length < DOC_NAME.length
                      ? 'border-[var(--hly-brand)] shadow-[0_0_0_2.5px_rgba(176,141,132,0.18)]'
                      : 'border-input'
                  }`}
                >
                  {docName || <span className="text-[var(--hly-neutral)]">My Writing Document</span>}
                  {docName.length > 0 && docName.length < DOC_NAME.length && (
                    <span className="humanly-cursor-blink ml-px inline-block h-3 w-0.5 bg-foreground" />
                  )}
                </div>
                <p className="mt-2.5 text-[11px] font-semibold">Description</p>
                <div className="mt-1 h-9 rounded-md border border-input bg-card px-2 pt-1 text-[10px] text-[var(--hly-neutral)]">
                  Optional context for this document...
                </div>
                <div className="mt-2.5 rounded-md border border-dashed border-border p-2 text-[10px]">
                  <span className="inline-flex items-center gap-1 font-medium">
                    <Upload className="h-3 w-3 text-accent" /> PDF
                  </span>
                  <span className="ml-1.5 text-muted-foreground">attach a source file</span>
                </div>
              </div>
              <div className="bg-background/60 p-3.5">
                <p className="humanly-eyebrow">Environment</p>
                <div className="mt-1.5 flex h-7 items-center justify-between rounded-md border border-input bg-card px-2 text-[11.5px]">
                  Default Environment <ChevronDown className="h-3 w-3 text-[var(--hly-neutral)]" />
                </div>
                <div className="mt-2.5 flex items-center gap-1.5 text-[11px] font-medium">
                  <span className="text-[var(--hly-green-text)]">✓</span> Default Environment
                </div>
                <dl className="mt-1.5 border-t border-border/70">
                  {[
                    ['AI assistant', 'Shortcuts on'],
                    ['Copy & paste', 'Allowed'],
                    ['Time limit', 'None'],
                    ['Detectors', 'Both on'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-border/70 py-[5px] text-[10.5px]">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
            <div className="mt-2.5 flex justify-end gap-2">
              <span className="rounded-md border border-input px-3 py-1.5 text-[11px] font-medium">Cancel</span>
              <span
                data-t="s0-create"
                className={`rounded-md bg-primary px-3 py-1.5 text-[11px] font-medium text-primary-foreground transition-transform duration-150 ${press('s0-create')}`}
              >
                Create Writing
              </span>
            </div>
          </div>
        </Scene>

        {/* 02 · Workspace: PDF | editor | AI chat (mirrors /documents/[id]) */}
        <Scene active={scene === 1}>
          <Chrome path="/documents/on-attention" />
          <div className="border-b border-border/70 bg-card px-4 py-2">
            <div className="flex items-center justify-between gap-3">
              <div className="flex min-w-0 items-center gap-2">
                <ArrowLeft className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate text-[12.5px] font-semibold">{DOC_NAME}</span>
                <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-[var(--hly-green-text)]" />
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[9.5px] text-muted-foreground">{text.length.toLocaleString()} characters</span>
                <span className="flex items-center gap-1 px-1 text-[9.5px] text-muted-foreground">
                  <HelpCircle className="h-3 w-3" /> Instructions
                </span>
                <span
                  data-t="s1-log"
                  className={`flex items-center gap-1 rounded-md border border-[#9E756B] bg-[#9E756B] px-2 py-1 text-[9.5px] font-medium text-white transition-transform duration-150 ${press('s1-log')}`}
                >
                  <FileText className="h-3 w-3" /> View Logs
                </span>
                <span className="flex items-center gap-1 rounded-md bg-primary px-2 py-1 text-[9.5px] font-medium text-primary-foreground">
                  <Award className="h-3 w-3" /> Generate Certificate
                </span>
              </div>
            </div>
          </div>
          <div className="grid flex-1 grid-cols-[0.72fr_1.45fr_0.85fr] overflow-hidden bg-background p-2.5">
            <div className="mr-2 flex flex-col overflow-hidden rounded-lg border border-border/80 bg-card">
              <div className="border-b border-border/70 bg-muted/30 px-2.5 py-1.5 text-[9.5px] font-medium text-muted-foreground">
                attention-sources.pdf
              </div>
              <div className="flex-1 space-y-1.5 bg-[var(--hly-surface)]/50 p-2.5">
                <div className="h-full rounded-sm border border-border/60 bg-white p-2.5">
                  {[92, 100, 96, 88, 100, 74, 0, 97, 90, 100, 62].map((w, i) => (
                    <div
                      key={i}
                      className="mb-1.5 h-1 rounded-full bg-[rgba(35,32,25,0.12)]"
                      style={{ width: `${w}%` }}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="flex flex-col overflow-hidden rounded-lg border border-border/80 bg-card">
              <div className="relative flex-1 p-4">
                <p data-t="s1-editor" className="text-[12px] leading-[1.85] text-[var(--hly-ink)]">
                  {writePhase === 'typing' && (
                    <>
                      {text}
                      <span className="humanly-cursor-blink -mb-0.5 ml-px inline-block h-[1.1em] w-0.5 bg-foreground align-middle" />
                    </>
                  )}
                  {writePhase === 'selected' && (
                    <>
                      {LINE_1}
                      <span data-t="s1-sentence" className="bg-[var(--hly-purple-bg)] box-decoration-clone">
                        {ERR_SENTENCE}
                      </span>
                    </>
                  )}
                  {writePhase === 'diff' && (
                    <>
                      {LINE_1}The discipline{' '}
                      <span className="rounded-sm bg-[var(--hly-red-bg)] px-0.5 text-[var(--hly-red-text)] line-through decoration-[1.5px]">
                        are
                      </span>{' '}
                      <span className="rounded-sm bg-[var(--hly-green-tint)] px-0.5 font-semibold text-[var(--hly-green-strong)]">
                        is
                      </span>{' '}
                      to wait, then to choose.
                    </>
                  )}
                  {writePhase === 'applied' && (
                    <>
                      {LINE_1}The discipline is to wait, then to choose.
                      <span className="humanly-cursor-blink -mb-0.5 ml-px inline-block h-[1.1em] w-0.5 bg-foreground align-middle" />
                    </>
                  )}
                </p>

                {/* floating shortcut bar (appears on selection, like the real editor) */}
                {writePhase === 'selected' && (
                  <div className="absolute left-6 top-[104px] z-20 flex items-center gap-1.5 rounded-[9px] border border-[var(--hly-hairline)] bg-white/95 px-2 py-1.5 shadow-[0_16px_34px_-22px_rgba(35,32,25,0.55)]">
                    <span
                      data-t="s1-fix"
                      className={`flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[9.5px] font-medium transition-transform duration-150 ${press('s1-fix')} bg-[var(--hly-green-bg)] text-[var(--hly-green-text)]`}
                    >
                      ✓ Fix grammar
                    </span>
                    {['✦ Improve writing', 'Aa Simplify', '💬 Ask AI'].map((l) => (
                      <span key={l} className="whitespace-nowrap px-1 text-[9.5px] font-medium text-foreground">
                        {l}
                      </span>
                    ))}
                  </div>
                )}

                {/* AI suggestion card with Apply / Discard (mirrors the real assist card) */}
                {writePhase === 'diff' && (
                  <div className="absolute left-6 top-[110px] z-20 w-[240px] rounded-[10px] border border-[var(--hly-hairline)] bg-white px-3 py-2.5 shadow-[0_24px_60px_-18px_rgba(35,32,25,0.4)]">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className="grid h-4 w-4 place-items-center rounded bg-foreground text-[8px] font-bold text-white">✦</span>
                      <span className="text-[9.5px] font-bold">AI Assistant</span>
                      <span className="ml-auto rounded-full bg-[var(--hly-ai-bg)] px-1.5 py-px text-[7.5px] font-bold text-[var(--hly-ai-text)]">
                        FIX GRAMMAR
                      </span>
                    </div>
                    <p className="mb-2 rounded-md bg-[var(--hly-surface)] px-2 py-1.5 text-[9.5px] leading-[1.55] text-[var(--hly-ink)]">
                      The discipline{' '}
                      <span className="text-muted-foreground line-through">are</span>{' '}
                      <span className="rounded-sm bg-[var(--hly-green-tint)] px-0.5 font-bold text-[var(--hly-green-strong)]">is</span>{' '}
                      to wait…
                    </p>
                    <div className="flex gap-1">
                      <span
                        data-t="s1-apply"
                        className={`rounded-[5px] bg-foreground px-2 py-1 text-[9px] font-bold text-white transition-transform duration-150 ${press('s1-apply')}`}
                      >
                        Apply
                      </span>
                      <span className="rounded-[5px] border border-[var(--hly-hairline)] px-2 py-1 text-[9px] font-bold text-muted-foreground">
                        Discard
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="ml-2 flex flex-col overflow-hidden rounded-lg border border-border/80 bg-[#FCFCFB]">
              <div className="flex items-center gap-1.5 border-b border-border/70 px-2.5 py-1.5 text-[10px] font-bold">
                <span className="grid h-4 w-4 place-items-center rounded bg-foreground text-[8px] text-white">✦</span>
                AI Assistant
              </div>
              <div className="flex-1 space-y-1.5 p-2.5">
                {writePhase !== 'typing' && (
                  <div className="ml-auto w-fit rounded-[10px] bg-foreground px-2 py-1 text-[9px] text-white">
                    Fix grammar
                  </div>
                )}
                {(writePhase === 'diff' || writePhase === 'applied') && (
                  <div className="rounded-md bg-[var(--hly-surface)] px-2 py-1.5 text-[9px] leading-relaxed text-[var(--hly-ink)]">
                    Corrected subject-verb agreement from are to is.
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 border-t border-border/70 p-2">
                <div className="flex-1 rounded-md border border-[var(--hly-hairline)] bg-white px-2 py-1 text-[9px] text-[var(--hly-neutral)]">
                  Type your message…
                </div>
                <span className="grid h-5 w-5 place-items-center rounded-md bg-[var(--hly-neutral)] text-[9px] text-white">↗</span>
              </div>
            </div>
          </div>
        </Scene>

        {/* 03 · Activity log (mirrors /logs/[id]) */}
        <Scene active={scene === 2}>
          <Chrome path="/logs/on-attention" />
          <div className="flex items-center gap-2.5 border-b border-border/70 bg-card px-4 py-2">
            <ArrowLeft className="h-3.5 w-3.5 text-muted-foreground" />
            <div>
              <h4 className="text-[12px] font-semibold leading-tight">{DOC_NAME}</h4>
              <p className="text-[9.5px] text-muted-foreground">Document and AI Activity Timeline</p>
            </div>
          </div>
          <div className="flex-1 space-y-2.5 overflow-hidden bg-background p-3">
            <div data-t="s2-summary" className="rounded-lg border border-border/80 bg-card px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-semibold">
                <Clock className="h-3 w-3" /> Event Summary
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Total recorded events: <span className="font-medium text-foreground">{logCount}</span> · AI actions
                logged: <span className="font-medium text-foreground">{logCount >= 4 ? 1 : 0}</span>
              </p>
            </div>
            <div data-t="s2-list" className="overflow-hidden rounded-md border bg-background">
              <table className="w-full text-[10.5px]">
                <thead className="bg-muted/50 text-[9px] text-muted-foreground">
                  <tr>
                    <th className="w-[72px] px-3 py-1.5 text-left font-medium">Time</th>
                    <th className="w-[76px] px-3 py-1.5 text-left font-medium">Activity</th>
                    <th className="px-3 py-1.5 text-left font-medium">Text / Detail</th>
                    <th className="w-[52px] px-3 py-1.5 text-left font-medium">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {LOG_ROWS.slice(0, logCount).map(([t, kind, detail, n]) => (
                    <tr key={`${t}-${kind}`}>
                      <td className="px-3 py-[7px] tabular-nums text-muted-foreground">{t}</td>
                      <td className="px-3 py-[7px]">
                        <span
                          className="rounded-[4px] px-1.5 py-px text-[9.5px] font-semibold"
                          style={{ backgroundColor: KIND_STYLE[kind].bg, color: KIND_STYLE[kind].fg }}
                        >
                          {kind}
                        </span>
                      </td>
                      <td className="truncate px-3 py-[7px] italic text-muted-foreground">{detail}</td>
                      <td className="px-3 py-[7px] tabular-nums text-muted-foreground">{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Scene>

        {/* 04 · Certificate evidence view (mirrors /verify/[token]) */}
        <Scene active={scene === 3}>
          <Chrome path="/verify/9f3a…7b2c" />
          <div
            ref={certScrollRef}
            className={`flex-1 overflow-hidden bg-background transition-opacity duration-500 ${
              sealed ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="mx-auto max-w-[620px] space-y-3 p-4">
              {/* header */}
              <div>
                <div className="flex items-center gap-1.5">
                  <span className="rounded-full border border-[var(--hly-green-border)] bg-[var(--hly-green-bg)] px-2 py-px text-[8.5px] font-bold tracking-[0.14em] text-[var(--hly-green-text)]">
                    SEALED
                  </span>
                  <span className="text-[9px] text-muted-foreground">Server signature verified</span>
                </div>
                <h4 className="mt-1.5 break-words text-[19px] font-semibold tracking-[-0.02em]">{DOC_NAME}</h4>
                <p className="mt-0.5 text-[9.5px] tabular-nums text-muted-foreground">
                  Certificate 9f3a…7b2c · issued just now · humanly.ai/verify
                </p>
              </div>

              {/* Authorship Statistics */}
              <div data-t="s3-stats" className="rounded-lg border border-border/80 bg-card p-3.5">
                <p className="text-[11px] font-semibold">Authorship Statistics</p>
                <p className="mt-0.5 text-[9.5px] text-muted-foreground">
                  Final text composition, writing length, and active writing time.
                </p>
                <div className="mt-2.5 flex items-baseline gap-2">
                  <span className="text-[24px] font-semibold leading-none tracking-[-0.02em] tabular-nums">93.2%</span>
                  <span className="text-[9.5px] text-muted-foreground">typed by hand</span>
                </div>
                <div className="mt-2 flex h-1.5 overflow-hidden rounded-full bg-[rgba(35,32,25,0.07)]">
                  <span className="h-full w-[93%] bg-[var(--hly-stat-typed)]" />
                  <span className="h-full w-[3%] bg-[var(--hly-stat-ai)]" />
                  <span className="h-full w-[4%] bg-[var(--hly-stat-pasted)]" />
                </div>
                <div className="mt-2.5 grid grid-cols-3 gap-2">
                  {(
                    [
                      ['Typed', '453 chars'],
                      ['AI assisted', '15 chars'],
                      ['Pasted', '18 chars'],
                    ] as const
                  ).map(([k, v]) => (
                    <div key={k} className="rounded-md border border-border/60 px-2 py-1.5">
                      <p className="text-[8.5px] text-muted-foreground">{k}</p>
                      <p className="text-[11px] font-semibold tabular-nums">{v}</p>
                    </div>
                  ))}
                </div>
              </div>

              {/* Activity Log */}
              <div className="rounded-lg border border-border/80 bg-card p-3.5">
                <p className="text-[11px] font-semibold">Activity Log</p>
                <div className="mt-2 overflow-hidden rounded-md border">
                  <table className="w-full text-[9.5px]">
                    <tbody className="divide-y divide-border/60">
                      {LOG_ROWS.slice(0, 4).map(([t, kind, , n]) => (
                        <tr key={`${t}-cert`}>
                          <td className="w-[64px] px-2.5 py-1.5 tabular-nums text-muted-foreground">{t}</td>
                          <td className="px-2.5 py-1.5">
                            <span
                              className="rounded-[4px] px-1.5 py-px text-[8.5px] font-semibold"
                              style={{ backgroundColor: KIND_STYLE[kind].bg, color: KIND_STYLE[kind].fg }}
                            >
                              {kind}
                            </span>
                          </td>
                          <td className="px-2.5 py-1.5 text-right tabular-nums text-muted-foreground">{n}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Anomaly Behavior Review */}
              <div className="rounded-lg border border-border/80 bg-card p-3.5">
                <p className="text-[11px] font-semibold">Anomaly Behavior Review</p>
                <div className="mt-2 flex items-center gap-1.5 text-[10px]">
                  <span className="text-[var(--hly-green-text)]">✓</span>
                  <span className="font-medium">1 signal flagged</span>
                  <span className="text-muted-foreground">blocked copy-paste attempt at 12:42:11</span>
                </div>
                <p className="mt-2 border-t border-dashed border-border pt-2 text-[9px] text-muted-foreground">
                  Advisory only, not a verdict. Based on 486 writing events.
                </p>
              </div>

              {/* Environment */}
              <div className="rounded-lg border border-border/80 bg-card p-3.5">
                <p className="text-[11px] font-semibold">Environment</p>
                <dl className="mt-1.5 border-t border-border/70">
                  {[
                    ['AI assistant', 'Shortcuts on'],
                    ['Copy & paste', 'Allowed'],
                    ['Detectors', 'Both on'],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between border-b border-border/70 py-[5px] text-[10px]">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        </Scene>

        {/* fake cursor */}
        {cursor.shown && (
          <div
            className="absolute z-30 transition-all duration-700 ease-in-out"
            style={{ left: cursor.x, top: cursor.y }}
          >
            {cursor.click && (
              <span className="absolute -left-3 -top-3 h-6 w-6 animate-ping rounded-full bg-[var(--hly-brand)]/30" />
            )}
            <svg
              width="17"
              height="17"
              viewBox="0 0 24 24"
              className={`-ml-[3px] -mt-[3px] drop-shadow-md transition-transform duration-150 ${
                cursor.click ? 'scale-90' : ''
              }`}
            >
              <path d="M5 3l14 8.5-6.2 1.6L9.5 19 5 3z" fill="#232019" stroke="#FAF9F6" strokeWidth="1.4" />
            </svg>
          </div>
        )}
      </div>
    </div>
  );
}

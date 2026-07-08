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

type Kind =
  | 'Typed'
  | 'paste'
  | 'blocked copy-paste'
  | 'Selected'
  | 'Chat'
  | 'Fix grammar'
  | 'AI inserted'
  | 'Focused'
  | 'Delete';
const KIND_STYLE: Record<Kind, { bg: string; border: string; fg: string }> = {
  Typed: {
    bg: 'var(--hly-blue-bg)',
    border: 'var(--hly-blue-border)',
    fg: 'var(--hly-blue-text)',
  },
  paste: {
    bg: '#F2EFE8',
    border: 'var(--hly-amber-border)',
    fg: 'var(--hly-neutral-text)',
  },
  'blocked copy-paste': {
    bg: 'var(--hly-red-bg)',
    border: 'var(--hly-red-border)',
    fg: 'var(--hly-red-text)',
  },
  Selected: {
    bg: '#F1EEE8',
    border: 'var(--hly-amber-border)',
    fg: 'var(--hly-neutral-text)',
  },
  Chat: {
    bg: 'var(--hly-purple-bg)',
    border: 'var(--hly-purple-border)',
    fg: 'var(--hly-purple-text)',
  },
  'Fix grammar': {
    bg: 'var(--hly-purple-bg)',
    border: 'var(--hly-purple-border)',
    fg: 'var(--hly-purple-text)',
  },
  'AI inserted': {
    bg: 'var(--hly-purple-bg)',
    border: 'var(--hly-purple-border)',
    fg: 'var(--hly-purple-text)',
  },
  Focused: {
    bg: 'var(--hly-green-bg)',
    border: 'var(--hly-green-border)',
    fg: 'var(--hly-green-text)',
  },
  Delete: {
    bg: 'var(--hly-red-bg)',
    border: 'var(--hly-red-border)',
    fg: 'var(--hly-red-text)',
  },
};

const STEPS = ['01 Configure', '02 Write', '03 Log', '04 Certify'] as const;
const DOC_NAME = 'On Attention';
const LINE_1 = 'The first thing to notice about a draft is the pause before it. ';
const ERR_SENTENCE = 'The discipline are to wait, then to choose.';
const CHAT_PROMPT = 'Summarize the source document';
const CHAT_RESPONSE =
  'The source argues that attention changes how writers weigh evidence, especially when revision slows the draft and makes the reasoning visible.';
const LOG_ROWS: Array<[string, Kind, string, string]> = [
  ['12:41:42', 'Focused', 'Editor focused', 'Cursor 0'],
  ['12:41:46', 'Typed', '"The first thing to notice…"', 'Cursor 38'],
  ['12:41:48', 'Typed', '"The first thing to notice about a draft…"', 'Cursor 64'],
  ['12:41:50', 'Typed', '"…is the pause before it."', 'Cursor 92'],
  ['12:41:52', 'Typed', '"…is the pause before it. Before a sentence…"', 'Cursor 118'],
  ['12:41:54', 'Typed', '"Before a sentence lands on the page…"', 'Cursor 154'],
  ['12:41:56', 'Typed', '"The discipline are to wait…"', 'Cursor 176'],
  ['12:41:59', 'Typed', '"…then to choose."', 'Cursor 197'],
  ['12:42:01', 'Selected', '"The discipline are to wait…"', '39 chars'],
  ['12:42:03', 'Chat', 'Asked "Summarize the source document"', '—'],
  ['12:42:06', 'Fix grammar', 'Fix grammar applied', '—'],
  ['12:42:08', 'AI inserted', 'Replaced with "is"', 'Cursor 197'],
  ['12:42:10', 'Delete', '"are" removed from selected sentence', 'Cursor 193'],
  ['12:42:11', 'blocked copy-paste', 'Blocked paste by copy-paste policy', '1 attempt'],
  ['12:42:14', 'Typed', '"then to choose."', 'Cursor 211'],
  ['12:42:18', 'paste', '"Attention reshaped how models handle…"', 'Cursor 397'],
  ['12:42:22', 'Focused', 'Editor focused', 'Cursor 397'],
  ['12:42:26', 'Typed', '"Source evidence supports the point…"', 'Cursor 449'],
];
type WritePhase = 'typing' | 'selecting' | 'selected' | 'diff' | 'applied';

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
  const [hasStarted, setHasStarted] = useState(false);
  const [docName, setDocName] = useState('');
  const [text, setText] = useState('');
  const [writePhase, setWritePhase] = useState<WritePhase>('typing');
  const [selectionProgress, setSelectionProgress] = useState(0);
  const [aiChatVisible, setAiChatVisible] = useState(false);
  const [chatInputText, setChatInputText] = useState('');
  const [aiResponseText, setAiResponseText] = useState('');
  const [aiResponseStreaming, setAiResponseStreaming] = useState(false);
  const [logCount, setLogCount] = useState(0);
  const [sealed, setSealed] = useState(false);
  const [pressed, setPressed] = useState<string | null>(null);
  const [cursor, setCursor] = useState({ x: 0, y: 0, click: false, shown: false });
  const showcaseRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const logScrollRef = useRef<HTMLDivElement>(null);
  const certScrollRef = useRef<HTMLDivElement>(null);
  const runIdRef = useRef(0);

  useEffect(() => {
    if (hasStarted) return;

    const showcase = showcaseRef.current;
    if (!showcase) return;

    if (typeof IntersectionObserver === 'undefined') {
      setHasStarted(true);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        setScene(0);
        setCursor({ x: 0, y: 0, click: false, shown: false });
        setHasStarted(true);
        observer.disconnect();
      },
      { threshold: 0.25 }
    );

    observer.observe(showcase);

    return () => observer.disconnect();
  }, [hasStarted]);

  useEffect(() => {
    if (!hasStarted) return;

    const id = ++runIdRef.current;
    const alive = () => runIdRef.current === id;

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
      pace = 58
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
    setSelectionProgress(0);
    setAiChatVisible(false);
    setChatInputText('');
    setAiResponseText('');
    setAiResponseStreaming(false);
    setLogCount(scene === 2 ? LOG_ROWS.length : 0);
    setSealed(false);
    setPressed(null);
    if (logScrollRef.current) logScrollRef.current.scrollTop = 0;
    if (certScrollRef.current) certScrollRef.current.scrollTop = 0;

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
        setWritePhase('selecting');
        setSelectionProgress(0);
        await sleep(250);
        // Select the faulty sentence progressively; the highlight follows the cursor drag.
        await moveToEl('s1-sentence', -105, 0);
        setCursor((c) => ({ ...c, click: true }));
        setSelectionProgress(100);
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
        await sleep(500);
        if (!alive()) return;
        await moveToEl('s1-chat-input');
        await click('s1-chat-input');
        await typeInto(CHAT_PROMPT, setChatInputText, 42);
        if (!alive()) return;
        await moveToEl('s1-chat-send');
        await click('s1-chat-send');
        setAiChatVisible(true);
        setChatInputText('');
        setAiResponseText('');
        setAiResponseStreaming(true);
        await sleep(220);
        await typeInto(CHAT_RESPONSE, setAiResponseText, 34);
        setAiResponseStreaming(false);
        await sleep(650);
        if (!alive()) return;
        await moveToEl('s1-log');
        await click('s1-log');
        await sleep(1000);
      },
      // 03 · review the complete record
      2: async () => {
        setLogCount(LOG_ROWS.length);
        setCursor((c) => ({ ...c, shown: true }));
        await moveToEl('s2-list', 0, -45);
        await sleep(350);
        const maxLogScroll = Math.max(
          0,
          (logScrollRef.current?.scrollHeight || 0) - (logScrollRef.current?.clientHeight || 0)
        );
        for (const ratio of [0, 0.35, 0.7, 1]) {
          if (!alive()) return;
          logScrollRef.current?.scrollTo({ top: maxLogScroll * ratio, behavior: 'smooth' });
          setCursor((c) => ({ ...c, y: Math.min(c.y + 24, 374) }));
          await sleep(950);
        }
        await moveToEl('s2-summary');
        await sleep(1800);
      },
      // 04 · certificate: seal, then scroll through the evidence sections
      3: async () => {
        setCursor((c) => ({ ...c, shown: true }));
        await sleep(300);
        setSealed(true);
        await moveToEl('s3-seal');
        const maxCertificateScroll = Math.max(
          0,
          (certScrollRef.current?.scrollHeight ?? 0) - (certScrollRef.current?.clientHeight ?? 0)
        );
        for (const top of [0, maxCertificateScroll * 0.34, maxCertificateScroll * 0.68, maxCertificateScroll]) {
          if (!alive()) return;
          certScrollRef.current?.scrollTo({ top, behavior: 'smooth' });
          setCursor((c) => ({ ...c, y: Math.min(c.y + 34, 370) }));
          await sleep(1450);
        }
        await sleep(2400);
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
  }, [hasStarted, scene]);

  const press = (name: string) => (pressed === name ? 'scale-95' : '');
  const renderSelectedSentence = (progress: number) => {
    const selectedWidth = Math.max(0, Math.min(progress, 100));
    return (
      <span data-t="s1-sentence" className="relative inline-block">
        <span
          className="absolute bottom-[0.12em] left-0 top-[0.18em] rounded-[2px] bg-[rgba(160,138,150,0.28)] transition-[width] duration-700 ease-in-out"
          style={{ width: `${selectedWidth}%` }}
        />
        <span className="relative">{ERR_SENTENCE}</span>
      </span>
    );
  };

  const visibleLogRows = LOG_ROWS.slice(0, logCount);
  const visibleAiLogCount = visibleLogRows.filter(([, kind]) =>
    kind === 'Chat' || kind === 'Fix grammar' || kind === 'AI inserted'
  ).length;

  return (
    <div ref={showcaseRef} className="w-full max-w-[880px]">
      <div className="mb-5 flex flex-wrap gap-2">
        {STEPS.map((label, i) => (
          <button
            key={label}
            type="button"
            onClick={() => {
              if (!hasStarted) setHasStarted(true);
              setScene(i);
            }}
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
        className="pointer-events-none relative h-[520px] select-none overflow-hidden rounded-[14px] border border-[var(--hly-hairline)] bg-white shadow-[0_28px_70px_-32px_rgba(35,32,25,0.35)]"
      >
        {/* 01 · Create Writing (/documents/new) */}
        <Scene active={scene === 0}>
          <Chrome path="/documents/new" />
          <div className="flex flex-1 flex-col bg-background p-4">
            <p className="text-[10px] text-muted-foreground">← Back to Workspace</p>
            <div className="mt-1 flex items-end justify-between">
              <h3 className="text-[18px] font-medium tracking-[-0.02em]">Create Writing</h3>
              <span className="flex items-center gap-1 rounded-md border border-[#9E756B] bg-[#9E756B] px-3 py-1.5 text-[10.5px] font-medium text-white">
                <Eye className="h-3 w-3 text-white" /> Preview
              </span>
            </div>
            <div className="mt-2.5 grid flex-1 grid-cols-[1fr_0.9fr] overflow-hidden rounded-lg border border-border/80 bg-card">
              <div className="border-r border-border/60 p-3.5">
                <p className="humanly-eyebrow">Basic Information</p>
                <p className="mt-2.5 text-[11px] font-medium">Document Name</p>
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
                <p className="mt-2.5 text-[11px] font-medium">Notes</p>
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
                <dl className="mt-2.5 border-t border-border/70">
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
                <span className="truncate text-[12.5px] font-medium">{DOC_NAME}</span>
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
                  {writePhase === 'selecting' && (
                    <>
                      {LINE_1}
                      {renderSelectedSentence(selectionProgress)}
                    </>
                  )}
                  {writePhase === 'selected' && (
                    <>
                      {LINE_1}
                      {renderSelectedSentence(100)}
                    </>
                  )}
                  {writePhase === 'diff' && (
                    <>
                      {LINE_1}The discipline{' '}
                      <span className="rounded-sm bg-[var(--hly-red-bg)] px-0.5 text-[var(--hly-red-text)] line-through decoration-[1.5px]">
                        are
                      </span>{' '}
                      <span className="rounded-sm bg-[var(--hly-green-tint)] px-0.5 font-medium text-[var(--hly-green-strong)]">
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
                  <div className="absolute left-6 top-[56px] z-20 flex items-center gap-1.5 rounded-[9px] border border-[var(--hly-hairline)] bg-white/95 px-2 py-1.5 shadow-[0_16px_34px_-22px_rgba(35,32,25,0.55)]">
                    <span
                      data-t="s1-fix"
                      className={`flex items-center gap-1 whitespace-nowrap rounded-md px-1.5 py-0.5 text-[9.5px] font-medium transition-transform duration-150 ${press('s1-fix')} bg-[var(--hly-green-bg)] text-[var(--hly-green-text)]`}
                    >
                      ✓ Fix grammar
                    </span>
                    {['Improve writing', 'Simplify', 'Ask AI'].map((l) => (
                      <span key={l} className="whitespace-nowrap px-1 text-[9.5px] font-medium text-foreground">
                        {l}
                      </span>
                    ))}
                  </div>
                )}

                {/* AI suggestion card with Apply / Discard (mirrors the real assist card) */}
                {writePhase === 'diff' && (
                  <div className="absolute left-6 top-[68px] z-20 w-[240px] rounded-[10px] border border-[var(--hly-hairline)] bg-white px-3 py-2.5 shadow-[0_24px_60px_-18px_rgba(35,32,25,0.4)]">
                    <div className="mb-1.5 flex items-center gap-1.5">
                      <span className="grid h-4 w-4 place-items-center rounded bg-foreground text-[8px] font-medium text-white">✦</span>
                      <span className="text-[9.5px] font-medium">AI Assistant</span>
                      <span className="ml-auto rounded-full bg-[var(--hly-ai-bg)] px-1.5 py-px text-[7.5px] font-medium text-[var(--hly-ai-text)]">
                        FIX GRAMMAR
                      </span>
                    </div>
                    <p className="mb-2 rounded-md bg-[var(--hly-surface)] px-2 py-1.5 text-[9.5px] leading-[1.55] text-[var(--hly-ink)]">
                      The discipline{' '}
                      <span className="text-muted-foreground line-through">are</span>{' '}
                      <span className="rounded-sm bg-[var(--hly-green-tint)] px-0.5 font-medium text-[var(--hly-green-strong)]">is</span>{' '}
                      to wait…
                    </p>
                    <div className="flex gap-1">
                      <span
                        data-t="s1-apply"
                        className={`rounded-[5px] bg-foreground px-2 py-1 text-[9px] font-medium text-white transition-transform duration-150 ${press('s1-apply')}`}
                      >
                        Apply
                      </span>
                      <span className="rounded-[5px] border border-[var(--hly-hairline)] px-2 py-1 text-[9px] font-medium text-muted-foreground">
                        Discard
                      </span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            <div className="ml-2 flex flex-col overflow-hidden rounded-lg border border-border/80 bg-[#FCFCFB]">
              <div className="flex items-center gap-1.5 border-b border-border/70 px-2.5 py-1.5 text-[10px] font-medium">
                <span className="grid h-4 w-4 place-items-center rounded bg-foreground text-[8px] text-white">✦</span>
                AI Assistant
              </div>
              <div className="flex-1 space-y-1.5 p-2.5">
                {aiChatVisible && (
                  <div className="ml-auto max-w-[82%] rounded-[10px] bg-foreground px-2 py-1 text-[9px] leading-snug text-white">
                    {CHAT_PROMPT}
                  </div>
                )}
                {(aiResponseText || aiResponseStreaming) && (
                  <div className="rounded-md bg-[var(--hly-surface)] px-2 py-1.5 text-[9px] leading-relaxed text-[var(--hly-ink)]">
                    {aiResponseText}
                    {aiResponseStreaming && (
                      <span className="humanly-cursor-blink ml-px inline-block h-[1em] w-0.5 bg-foreground align-[-0.12em]" />
                    )}
                  </div>
                )}
              </div>
              <div className="flex items-center gap-1.5 border-t border-border/70 p-2">
                <div
                  data-t="s1-chat-input"
                  className={`flex-1 rounded-md border border-[var(--hly-hairline)] bg-white px-2 py-1 text-[9px] ${
                    chatInputText ? 'text-foreground' : 'text-[var(--hly-neutral)]'
                  }`}
                >
                  {chatInputText || 'Type your message…'}
                </div>
                <span
                  data-t="s1-chat-send"
                  className={`grid h-5 w-5 place-items-center rounded-md text-[9px] text-white transition-transform duration-150 ${
                    chatInputText ? 'bg-foreground' : 'bg-[var(--hly-neutral)]'
                  } ${press('s1-chat-send')}`}
                >
                  ↗
                </span>
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
              <h4 className="text-[12px] font-medium leading-tight">{DOC_NAME}</h4>
              <p className="text-[9.5px] text-muted-foreground">Review activity timeline</p>
            </div>
          </div>
          <div className="flex-1 space-y-2.5 overflow-hidden bg-background p-3">
            <div data-t="s2-summary" className="rounded-lg border border-border/80 bg-card px-3.5 py-2.5">
              <div className="flex items-center gap-1.5 text-[11px] font-medium">
                <Clock className="h-3 w-3" /> Event Summary
              </div>
              <p className="mt-1 text-[10px] text-muted-foreground">
                Total recorded events: <span className="font-medium text-foreground">{logCount}</span> · AI actions
                logged: <span className="font-medium text-foreground">{visibleAiLogCount}</span>
              </p>
            </div>
            <div
              ref={logScrollRef}
              data-t="s2-list"
              className="h-[338px] overflow-hidden rounded-md border bg-background"
            >
              <table className="w-full text-[10px]">
                <thead className="bg-muted/50 text-[9px] text-muted-foreground">
                  <tr>
                    <th className="w-[70px] px-3 py-1.5 text-left font-medium">Time</th>
                    <th className="w-[118px] px-3 py-1.5 text-left font-medium">Activity</th>
                    <th className="px-3 py-1.5 text-left font-medium">Text / Detail</th>
                    <th className="w-[50px] px-3 py-1.5 text-left font-medium">Count</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/60">
                  {visibleLogRows.map(([t, kind, detail, n], index) => (
                    <tr key={`${t}-${kind}-${index}`}>
                      <td className="px-3 py-[5px] tabular-nums text-muted-foreground">{t}</td>
                      <td className="px-3 py-[5px]">
                        <span
                          className="inline-flex whitespace-nowrap rounded border px-1.5 py-px text-[9px] font-medium"
                          style={{
                            backgroundColor: KIND_STYLE[kind].bg,
                            borderColor: KIND_STYLE[kind].border,
                            color: KIND_STYLE[kind].fg,
                          }}
                        >
                          {kind}
                        </span>
                      </td>
                      <td className="truncate px-3 py-[5px] italic text-muted-foreground">{detail}</td>
                      <td className="px-3 py-[5px] tabular-nums text-muted-foreground">{n}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </Scene>

        {/* 04 · Certificate evidence view (mirrors the real certificate page) */}
        <Scene active={scene === 3}>
          <Chrome path="/verify/9f3a…7b2c" />
          <div
            ref={certScrollRef}
            className={`flex-1 overflow-hidden bg-background transition-opacity duration-500 ${
              sealed ? 'opacity-100' : 'opacity-0'
            }`}
          >
            <div className="mx-auto max-w-[760px] space-y-4 px-5 py-4">
              <section className="rounded-lg border border-border/80 bg-card p-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full border border-[var(--hly-green-border)] bg-[var(--hly-green-bg)] px-2.5 py-0.5 text-[9px] font-medium tracking-[0.14em] text-[var(--hly-green-text)]">
                        SEALED
                      </span>
                      <span className="text-[10px] text-muted-foreground">Generated just now</span>
                    </div>
                    <h4 className="mt-2 break-words text-[22px] font-medium tracking-[-0.02em]">{DOC_NAME}</h4>
                    <p className="mt-1 text-[10.5px] tabular-nums text-muted-foreground">
                      Certificate 9f3a…7b2c · humanly.ai/verify/9f3a…7b2c
                    </p>
                  </div>
                  <div className="hidden min-w-[244px] sm:block" aria-hidden />
                </div>
              </section>

              <section
                data-t="s3-seal"
                className="rounded-lg border border-[var(--hly-green-border)] bg-[var(--hly-green-bg)]/45 p-4"
              >
                <div className="flex items-start gap-3">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--hly-green-bg)] text-[var(--hly-green-text)]">
                    <Award className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="text-[13px] font-medium">Certificate seal</p>
                      <span className="rounded-full border border-[var(--hly-green-border)] bg-card px-2 py-0.5 text-[10px] font-medium text-[var(--hly-green-text)]">
                        Sealed
                      </span>
                    </div>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Publicly verifiable signature matches this certificate record.
                    </p>
                    <p className="mt-3 text-[10px] font-medium text-muted-foreground">Less seal details ↑</p>
                    <div className="mt-2 grid gap-2 sm:grid-cols-4">
                      {[
                        ['PAYLOAD HASH', 'cd7e3e93d047...21915de2b05d'],
                        ['ALGORITHM', 'Ed25519'],
                        ['KEY ID', 'humanly-ed25519-derived-v1'],
                        ['PUBLIC KEY FINGERPRINT', 'd0dacc75503f...917e692c225d'],
                      ].map(([label, value]) => (
                        <div key={label} className="rounded-md bg-background/70 px-2.5 py-2">
                          <p className="text-[8.5px] uppercase tracking-wide text-muted-foreground">{label}</p>
                          <p className="mt-1 break-words font-mono text-[9.5px] text-foreground">{value}</p>
                        </div>
                      ))}
                    </div>
                    <div className="mt-3 border-t border-[var(--hly-green-border)]/50 pt-3">
                      <p className="text-[12px] font-medium">Certificate integrity</p>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        The seal verifies the certificate record shown here, including the signed writing metrics,
                        document identity, generated timestamp, and display options.
                      </p>
                    </div>
                  </div>
                </div>
              </section>

              <section data-t="s3-stats" className="rounded-lg border border-border/80 bg-card p-4">
                <div>
                  <p className="text-[14px] font-medium">Authorship Statistics</p>
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Final text composition, writing length, and active writing time.
                  </p>
                </div>
                <div className="mt-3 rounded-lg border border-border/70 bg-muted/20 p-3">
                  <div className="flex items-center justify-between gap-4">
                    <p className="text-[12px] font-medium">Final text composition</p>
                    <p className="text-[10px] text-muted-foreground">486 final-text characters</p>
                  </div>
                  <p className="mt-2 text-[10.5px] leading-relaxed text-muted-foreground">
                    Typed is final text kept from keyboard input. Pasted is final text kept from clipboard insertion.
                    AI-assisted is final text kept from Humanly AI edits or inserted AI output.
                  </p>
                  <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-secondary">
                    <span className="h-full w-[93%] bg-[var(--hly-stat-typed)]" />
                    <span className="h-full w-[3%] bg-[var(--hly-stat-ai)]" />
                    <span className="h-full w-[4%] bg-[var(--hly-stat-pasted)]" />
                  </div>
                  <div className="mt-3 grid gap-2 text-[11px] sm:grid-cols-3">
                    {[
                      ['Typed', '93% · 453 chars', 'var(--hly-stat-typed)'],
                      ['Pasted', '4% · 18 chars', 'var(--hly-stat-pasted)'],
                      ['AI-assisted', '3% · 15 chars', 'var(--hly-stat-ai)'],
                    ].map(([label, value, color]) => (
                      <div key={label} className="flex items-center gap-2">
                        <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: color }} />
                        <span className="text-muted-foreground">{label}</span>
                        <span className="font-medium tabular-nums">{value}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3 rounded-md border border-border/70 bg-background px-3 py-2">
                    <p className="text-[11px] font-medium">Final text visualization</p>
                    <p className="mt-1 truncate text-[10.5px] leading-relaxed">
                      <span className="rounded bg-[rgba(140,145,120,0.25)] px-0.5">
                        The first thing to notice about a draft is the pause before it.
                      </span>{' '}
                      <span className="rounded bg-[rgba(160,138,150,0.22)] px-0.5">
                        The discipline is to wait
                      </span>{' '}
                      <span className="rounded bg-[rgba(179,154,107,0.24)] px-0.5">then to choose.</span>
                    </p>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-border/80 bg-card p-4">
                <p className="text-[14px] font-medium">Replay</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Watch how this certificate was created from recorded edit history.
                </p>
                <div className="mt-3 rounded-md border border-border/70 bg-background p-3">
                  <div className="mb-2 flex items-center justify-between text-[10px] text-muted-foreground">
                    <span>12:41:48 → 12:42:18</span>
                    <span>486 events</span>
                  </div>
                  <div className="space-y-1.5">
                    {[72, 96, 84, 58].map((w, i) => (
                      <div key={i} className="h-1.5 rounded-full bg-[rgba(35,32,25,0.10)]" style={{ width: `${w}%` }} />
                    ))}
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-border/80 bg-card p-4">
                <div className="flex items-center gap-2">
                  <p className="text-[14px] font-medium">Anomaly Behavior Review</p>
                  <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" />
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Review write-time signals that may need attention. These are evidence for review, not automatic verdicts.
                </p>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <div className="space-y-3 rounded-md border border-border/70 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-medium">Anomaly Pattern</p>
                        <p className="mt-1 text-[10.5px] text-muted-foreground">
                          Deterministic review signals from write-time event patterns.
                        </p>
                      </div>
                      <span className="rounded-full border border-[var(--hly-red-border)] bg-[var(--hly-red-bg)] px-2 py-0.5 text-[9px] font-medium text-[var(--hly-red-text)]">
                        Review
                      </span>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/70 p-2.5">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full border border-[var(--hly-red-border)] bg-[var(--hly-red-bg)] px-2 py-0.5 text-[8.5px] font-medium text-[var(--hly-red-text)]">
                          policy
                        </span>
                        <p className="text-[10.5px] font-medium">Blocked copy-paste attempt</p>
                      </div>
                      <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                        A clipboard insertion was blocked by the active writing policy and marked for review.
                      </p>
                    </div>
                  </div>
                  <div className="space-y-3 rounded-md border border-border/70 p-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="text-[12px] font-medium">Humanly Typing Detector</p>
                        <p className="mt-1 text-[10.5px] text-muted-foreground">
                          Model-based analysis of typing and writing behavior.
                        </p>
                      </div>
                      <span className="rounded-full border border-[var(--hly-green-border)] bg-[var(--hly-green-bg)] px-2 py-0.5 text-[9px] font-medium text-[var(--hly-green-text)]">
                        Likely human
                      </span>
                    </div>
                    <div className="rounded-md border border-border/60 bg-background/70 p-2.5">
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="text-[20px] font-medium leading-none tabular-nums text-[var(--hly-green-text)]">
                          93%
                        </span>
                        <span className="text-[10.5px] text-muted-foreground">typed final text kept from keyboard input</span>
                      </div>
                      <p className="mt-1.5 text-[10px] leading-relaxed text-muted-foreground">
                        Enough usable typing behavior was recorded, and the trajectory looks consistent with human drafting.
                      </p>
                      <div className="mt-2 grid gap-1.5 text-[9.5px] sm:grid-cols-2">
                        {[
                          ['Typed ratio', '93%'],
                          ['AI-assisted', '3%'],
                        ].map(([label, value]) => (
                          <div key={label} className="rounded bg-muted/45 px-2 py-1.5">
                            <p className="uppercase tracking-wide text-muted-foreground">{label}</p>
                            <p className="mt-0.5 font-medium tabular-nums">{value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="rounded-lg border border-border/80 bg-card p-4">
                <p className="text-[14px] font-medium">Environment</p>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  The writing policy active when this certificate was created.
                </p>
                <dl className="mt-3 grid gap-2 sm:grid-cols-2">
                  {[
                    ['Environment', 'Personal writing'],
                    ['AI assistant', 'Shortcuts on'],
                    ['Copy & paste', 'Allowed'],
                    ['Resource access', 'Downloadable'],
                    ['Time limit', 'No limit'],
                    ['Detectors', 'Anomaly Pattern, Humanly Typing Detector'],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-md border border-border/70 px-3 py-2">
                      <dt className="text-[9px] uppercase tracking-wide text-muted-foreground">{k}</dt>
                      <dd className="mt-1 text-[11px] font-medium">{v}</dd>
                    </div>
                  ))}
                </dl>
              </section>
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

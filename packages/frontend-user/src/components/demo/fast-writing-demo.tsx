'use client';

import { ChangeEvent, ClipboardEvent, useMemo, useState } from 'react';
import {
  Check,
  ClipboardList,
  FileCheck2,
  Keyboard,
  ListChecks,
  PenLine,
  RotateCcw,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';

type DemoStep = 'settings' | 'writing' | 'log' | 'certificate' | 'done';
type AiAccess = 'off' | 'readonly' | 'full';
type PastePolicy = 'allowed' | 'blocked';
type LogKind = 'setting' | 'input' | 'paste' | 'blocked-paste' | 'certificate';

interface DemoSettings {
  title: string;
  aiAccess: AiAccess;
  pastePolicy: PastePolicy;
  targetCharacters: number;
}

interface DemoLogEntry {
  id: string;
  time: string;
  kind: LogKind;
  detail: string;
  characters: number;
}

interface DemoStats {
  totalCharacters: number;
  words: number;
  typedCharacters: number;
  pastedCharacters: number;
  logCount: number;
  completion: number;
}

const initialSettings: DemoSettings = {
  title: 'Fast provenance draft',
  aiAccess: 'readonly',
  pastePolicy: 'allowed',
  targetCharacters: 600,
};

const aiAccessLabels: Record<AiAccess, string> = {
  off: 'AI off',
  readonly: 'Read-only AI',
  full: 'Full AI',
};

const pastePolicyLabels: Record<PastePolicy, string> = {
  allowed: 'Paste allowed',
  blocked: 'Paste blocked',
};

function formatTime(date = new Date()) {
  return date.toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
}

function makeEntry(kind: LogKind, detail: string, characters = 0): DemoLogEntry {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    time: formatTime(),
    kind,
    detail,
    characters,
  };
}

function countWords(text: string) {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function FastWritingDemo() {
  const [step, setStep] = useState<DemoStep>('settings');
  const [settings, setSettings] = useState<DemoSettings>(initialSettings);
  const [draft, setDraft] = useState('');
  const [logs, setLogs] = useState<DemoLogEntry[]>([]);

  const stats = useMemo(() => {
    const pastedCharacters = logs
      .filter((entry) => entry.kind === 'paste')
      .reduce((total, entry) => total + entry.characters, 0);
    const typedCharacters = logs
      .filter((entry) => entry.kind === 'input')
      .reduce((total, entry) => total + entry.characters, 0);

    return {
      totalCharacters: draft.length,
      words: countWords(draft),
      typedCharacters,
      pastedCharacters,
      logCount: logs.length,
      completion: Math.min(100, Math.round((draft.length / settings.targetCharacters) * 100)),
    };
  }, [draft, logs, settings.targetCharacters]);

  const appendLog = (entry: DemoLogEntry) => {
    setLogs((current) => [entry, ...current].slice(0, 80));
  };

  const handleStart = () => {
    setStep('writing');
    appendLog(
      makeEntry(
        'setting',
        `${aiAccessLabels[settings.aiAccess]}, ${pastePolicyLabels[settings.pastePolicy]}, ${settings.targetCharacters} character target`
      )
    );
  };

  const handleDraftChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextDraft = event.target.value;
    const delta = nextDraft.length - draft.length;

    setDraft(nextDraft);

    if (delta > 0) {
      appendLog(makeEntry('input', 'Typed in the demo editor', delta));
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = event.clipboardData.getData('text');

    if (settings.pastePolicy === 'blocked') {
      event.preventDefault();
      appendLog(makeEntry('blocked-paste', 'Paste was blocked by the demo setting', pastedText.length));
      return;
    }

    appendLog(makeEntry('paste', 'Pasted text into the demo editor', pastedText.length));
  };

  const handleGenerateCertificate = () => {
    appendLog(makeEntry('certificate', 'Generated a local demo certificate', draft.length));
    setStep('certificate');
  };

  const handleRestart = () => {
    setStep('settings');
    setSettings(initialSettings);
    setDraft('');
    setLogs([]);
  };

  return (
    <section id="demo" className="bg-[#f7f2e8] px-5 py-[110px] sm:px-8 lg:px-14">
      <div className="mx-auto max-w-[1168px]">
        <div className="mb-9 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
          <div className="max-w-[680px]">
            <p className="mb-4 text-[11px] font-bold uppercase tracking-[0.22em] text-muted-foreground">
              Fast writing demo
            </p>
            <h2 className="text-[28px] font-semibold leading-[1.08] tracking-[-0.02em] sm:text-[36px]">
              Try the provenance loop without signing in.
            </h2>
            <p className="mt-5 text-[15px] leading-[1.7] text-muted-foreground sm:text-[17px]">
              Configure a short writing session, type in the demo editor, inspect the local event log,
              then generate a certificate preview. The demo resets when you are done.
            </p>
          </div>
          <div className="grid grid-cols-4 gap-2 text-[11px] text-muted-foreground sm:min-w-[420px]">
            <StepBadge active={step === 'settings'} complete={step !== 'settings'} Icon={Settings2} label="Setting" />
            <StepBadge active={step === 'writing'} complete={['log', 'certificate', 'done'].includes(step)} Icon={PenLine} label="Writing" />
            <StepBadge active={step === 'log'} complete={['certificate', 'done'].includes(step)} Icon={ClipboardList} label="Log" />
            <StepBadge active={step === 'certificate' || step === 'done'} complete={step === 'done'} Icon={FileCheck2} label="Certificate" />
          </div>
        </div>

        <div className="grid overflow-hidden rounded-[8px] border border-[rgba(20,22,26,0.12)] bg-white shadow-[0_34px_80px_-56px_rgba(20,22,26,0.75)] lg:grid-cols-[0.92fr_1.08fr]">
          <div className="border-b border-[rgba(20,22,26,0.08)] bg-[#fbfaf6] p-5 sm:p-7 lg:border-b-0 lg:border-r">
            {step === 'settings' ? (
              <SettingsPanel settings={settings} onSettingsChange={setSettings} onStart={handleStart} />
            ) : step === 'done' ? (
              <DonePanel onRestart={handleRestart} />
            ) : (
              <SessionSummary settings={settings} stats={stats} onRestart={handleRestart} />
            )}
          </div>

          <div className="min-h-[520px] p-5 sm:p-7">
            {step === 'settings' ? (
              <PreviewPanel />
            ) : step === 'writing' ? (
              <WritingPanel
                draft={draft}
                onDraftChange={handleDraftChange}
                onPaste={handlePaste}
                onViewLog={() => setStep('log')}
                onGenerateCertificate={handleGenerateCertificate}
              />
            ) : step === 'log' ? (
              <LogPanel
                logs={logs}
                onBackToWriting={() => setStep('writing')}
                onGenerateCertificate={handleGenerateCertificate}
              />
            ) : step === 'certificate' ? (
              <CertificatePanel
                title={settings.title}
                stats={stats}
                latestLogs={logs.slice(0, 4)}
                onEnd={() => setStep('done')}
                onRestart={handleRestart}
              />
            ) : (
              <CompletionPreview />
            )}
          </div>
        </div>
      </div>
    </section>
  );
}

function StepBadge({
  active,
  complete,
  Icon,
  label,
}: {
  active: boolean;
  complete: boolean;
  Icon: typeof Settings2;
  label: string;
}) {
  return (
    <div
      className={`flex min-h-[54px] flex-col items-center justify-center gap-1 rounded-[8px] border px-2 text-center ${
        active
          ? 'border-foreground bg-white text-foreground'
          : complete
            ? 'border-[#6f8a78]/40 bg-[#dde6df] text-[#4a655a]'
            : 'border-[rgba(20,22,26,0.10)] bg-white/60'
      }`}
    >
      {complete ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
      <span className="font-medium">{label}</span>
    </div>
  );
}

function SettingsPanel({
  settings,
  onSettingsChange,
  onStart,
}: {
  settings: DemoSettings;
  onSettingsChange: (settings: DemoSettings) => void;
  onStart: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold tracking-[-0.01em]">Set the writing rules</h3>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The real product stores these settings with a document. This demo keeps them only in memory.
        </p>
      </div>

      <div className="space-y-2">
        <Label htmlFor="demo-title">Draft title</Label>
        <Input
          id="demo-title"
          value={settings.title}
          onChange={(event) => onSettingsChange({ ...settings, title: event.target.value })}
          className="h-11 rounded-[8px]"
        />
      </div>

      <SegmentedControl
        label="AI access"
        value={settings.aiAccess}
        options={[
          ['off', 'Off'],
          ['readonly', 'Read-only'],
          ['full', 'Full'],
        ]}
        onChange={(aiAccess) => onSettingsChange({ ...settings, aiAccess })}
      />

      <SegmentedControl
        label="Paste policy"
        value={settings.pastePolicy}
        options={[
          ['allowed', 'Allowed'],
          ['blocked', 'Blocked'],
        ]}
        onChange={(pastePolicy) => onSettingsChange({ ...settings, pastePolicy })}
      />

      <div className="space-y-2">
        <Label htmlFor="demo-target">Target characters</Label>
        <Input
          id="demo-target"
          type="number"
          min={120}
          max={4000}
          value={settings.targetCharacters}
          onChange={(event) => {
            const nextValue = Number(event.target.value);
            onSettingsChange({
              ...settings,
              targetCharacters: Number.isFinite(nextValue) ? Math.max(120, nextValue) : 120,
            });
          }}
          className="h-11 rounded-[8px]"
        />
      </div>

      <Button type="button" className="h-11 rounded-full px-6 font-bold" onClick={onStart}>
        <Keyboard className="mr-2 h-4 w-4" />
        Start demo
      </Button>
    </div>
  );
}

function SegmentedControl<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: Array<[T, string]>;
  onChange: (value: T) => void;
}) {
  return (
    <div className="space-y-2">
      <Label>{label}</Label>
      <div className="grid gap-2 sm:grid-cols-3">
        {options.map(([optionValue, optionLabel]) => (
          <button
            key={optionValue}
            type="button"
            onClick={() => onChange(optionValue)}
            className={`min-h-[42px] rounded-[8px] border px-3 text-sm font-medium transition-colors ${
              value === optionValue
                ? 'border-foreground bg-foreground text-white'
                : 'border-[rgba(20,22,26,0.12)] bg-white text-foreground hover:border-foreground/50'
            }`}
          >
            {optionLabel}
          </button>
        ))}
      </div>
    </div>
  );
}

function PreviewPanel() {
  return (
    <div className="flex h-full min-h-[460px] flex-col justify-between">
      <div>
        <p className="mb-3 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
          What happens next
        </p>
        <div className="grid gap-3 sm:grid-cols-3">
          {[
            ['Write', 'Type, revise, or paste into the demo editor.'],
            ['Inspect', 'Open the local log to see what was recorded.'],
            ['Certify', 'Generate a certificate preview from this session.'],
          ].map(([title, body]) => (
            <div key={title} className="rounded-[8px] border border-[rgba(20,22,26,0.10)] bg-[#fbfaf6] p-4">
              <h4 className="font-semibold">{title}</h4>
              <p className="mt-2 text-sm leading-6 text-muted-foreground">{body}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-8 rounded-[8px] border border-dashed border-[rgba(20,22,26,0.20)] bg-white p-5">
        <div className="flex items-center gap-2 text-sm font-semibold">
          <ShieldCheck className="h-4 w-4 text-[#6f8a78]" />
          Demo sessions are local
        </div>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          The text and log below are not saved to your account. Refreshing or restarting the demo clears them.
        </p>
      </div>
    </div>
  );
}

function SessionSummary({
  settings,
  stats,
  onRestart,
}: {
  settings: DemoSettings;
  stats: DemoStats;
  onRestart: () => void;
}) {
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Demo session</p>
        <h3 className="mt-2 text-xl font-semibold tracking-[-0.01em]">{settings.title || 'Untitled demo'}</h3>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <StatTile label="Characters" value={stats.totalCharacters.toLocaleString()} />
        <StatTile label="Words" value={stats.words.toLocaleString()} />
        <StatTile label="Typed" value={stats.typedCharacters.toLocaleString()} />
        <StatTile label="Pasted" value={stats.pastedCharacters.toLocaleString()} />
      </div>
      <div className="rounded-[8px] border border-[rgba(20,22,26,0.10)] bg-white p-4">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className="font-medium">Target progress</span>
          <span className="text-muted-foreground">{stats.completion}%</span>
        </div>
        <div className="h-2 rounded-full bg-[#e7e2d8]">
          <div
            className="h-2 rounded-full bg-[#6f8a78]"
            style={{ width: `${Math.max(4, stats.completion)}%` }}
          />
        </div>
      </div>
      <Button type="button" variant="outline" className="rounded-full" onClick={onRestart}>
        <RotateCcw className="mr-2 h-4 w-4" />
        Restart demo
      </Button>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[8px] border border-[rgba(20,22,26,0.10)] bg-white p-4">
      <div className="text-[11px] uppercase tracking-[0.14em] text-muted-foreground">{label}</div>
      <div className="mt-1 text-2xl font-semibold tracking-[-0.02em]">{value}</div>
    </div>
  );
}

function WritingPanel({
  draft,
  onDraftChange,
  onPaste,
  onViewLog,
  onGenerateCertificate,
}: {
  draft: string;
  onDraftChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onViewLog: () => void;
  onGenerateCertificate: () => void;
}) {
  return (
    <div className="flex h-full min-h-[460px] flex-col">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold tracking-[-0.01em]">Write in the demo editor</h3>
          <p className="mt-1 text-sm text-muted-foreground">Typing and paste activity are recorded locally.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={onViewLog}>
            <ListChecks className="mr-2 h-4 w-4" />
            View log
          </Button>
          <Button type="button" className="rounded-full font-bold" onClick={onGenerateCertificate}>
            <FileCheck2 className="mr-2 h-4 w-4" />
            Generate certificate
          </Button>
        </div>
      </div>
      <Textarea
        aria-label="Demo writing editor"
        value={draft}
        onChange={onDraftChange}
        onPaste={onPaste}
        placeholder="Start typing a short draft here..."
        className="min-h-[340px] flex-1 resize-none rounded-[8px] border-[rgba(20,22,26,0.14)] bg-[#fbfaf6] p-5 text-base leading-7"
      />
    </div>
  );
}

function LogPanel({
  logs,
  onBackToWriting,
  onGenerateCertificate,
}: {
  logs: DemoLogEntry[];
  onBackToWriting: () => void;
  onGenerateCertificate: () => void;
}) {
  return (
    <div className="flex h-full min-h-[460px] flex-col">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-xl font-semibold tracking-[-0.01em]">Demo event log</h3>
          <p className="mt-1 text-sm text-muted-foreground">Newest events appear first.</p>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" className="rounded-full" onClick={onBackToWriting}>
            Keep writing
          </Button>
          <Button type="button" className="rounded-full font-bold" onClick={onGenerateCertificate}>
            Generate certificate
          </Button>
        </div>
      </div>
      <div className="overflow-hidden rounded-[8px] border border-[rgba(20,22,26,0.10)]">
        <div className="grid grid-cols-[92px_1fr_88px] bg-[#fbfaf6] px-4 py-3 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          <span>Time</span>
          <span>Event</span>
          <span className="text-right">Chars</span>
        </div>
        <div className="max-h-[360px] overflow-auto">
          {logs.length ? (
            logs.map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-[92px_1fr_88px] border-t border-[rgba(20,22,26,0.08)] px-4 py-3 text-sm"
              >
                <span className="text-muted-foreground">{entry.time}</span>
                <span>
                  <span className="font-medium">{entry.kind}</span>
                  <span className="ml-2 text-muted-foreground">{entry.detail}</span>
                </span>
                <span className="text-right text-muted-foreground">{entry.characters}</span>
              </div>
            ))
          ) : (
            <div className="px-4 py-10 text-center text-sm text-muted-foreground">
              No events yet. Go back and type a few words.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function CertificatePanel({
  title,
  stats,
  latestLogs,
  onEnd,
  onRestart,
}: {
  title: string;
  stats: DemoStats;
  latestLogs: DemoLogEntry[];
  onEnd: () => void;
  onRestart: () => void;
}) {
  return (
    <div className="flex min-h-[460px] flex-col justify-between">
      <div className="rounded-[8px] border border-[rgba(20,22,26,0.12)] bg-[#fdfcf7] p-6">
        <div className="mb-5 flex items-center justify-between gap-4">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Demo certificate
            </p>
            <h3 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">{title || 'Untitled demo'}</h3>
          </div>
          <div className="grid h-12 w-12 place-items-center rounded-full bg-[#dde6df] text-[#4a655a]">
            <ShieldCheck className="h-6 w-6" />
          </div>
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          <StatTile label="Chars" value={stats.totalCharacters.toLocaleString()} />
          <StatTile label="Words" value={stats.words.toLocaleString()} />
          <StatTile label="Typed" value={stats.typedCharacters.toLocaleString()} />
          <StatTile label="Pasted" value={stats.pastedCharacters.toLocaleString()} />
        </div>
        <div className="mt-5 rounded-[8px] border border-[rgba(20,22,26,0.10)] bg-white p-4">
          <p className="mb-3 text-sm font-semibold">Recent proof events</p>
          <div className="space-y-2">
            {latestLogs.length ? (
              latestLogs.map((entry) => (
                <div key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                  <span className="truncate text-muted-foreground">{entry.detail}</span>
                  <span className="shrink-0 font-medium">{entry.time}</span>
                </div>
              ))
            ) : (
              <p className="text-sm text-muted-foreground">No events were recorded before this certificate.</p>
            )}
          </div>
        </div>
        <p className="mt-5 text-sm leading-6 text-muted-foreground">
          This is a local preview, not a public verification certificate.
        </p>
      </div>
      <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button type="button" variant="outline" className="rounded-full" onClick={onRestart}>
          Do it again
        </Button>
        <Button type="button" className="rounded-full font-bold" onClick={onEnd}>
          End demo
        </Button>
      </div>
    </div>
  );
}

function DonePanel({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="flex min-h-[420px] flex-col justify-center">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Demo complete</p>
      <h3 className="mt-3 text-2xl font-semibold tracking-[-0.02em]">The local session has ended.</h3>
      <p className="mt-4 text-sm leading-6 text-muted-foreground">
        Start another run to configure a fresh setting, write again, inspect a new log, and generate a new preview.
      </p>
      <Button type="button" className="mt-6 w-fit rounded-full font-bold" onClick={onRestart}>
        <RotateCcw className="mr-2 h-4 w-4" />
        Do it again
      </Button>
    </div>
  );
}

function CompletionPreview() {
  return (
    <div className="grid h-full min-h-[460px] place-items-center text-center">
      <div>
        <h3 className="text-2xl font-semibold tracking-[-0.02em]">Ready for another run?</h3>
        <p className="mx-auto mt-4 max-w-sm text-sm leading-6 text-muted-foreground">
          The last demo text and log are cleared when you start again.
        </p>
      </div>
    </div>
  );
}

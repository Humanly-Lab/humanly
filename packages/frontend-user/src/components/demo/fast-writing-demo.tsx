'use client';

import { ChangeEvent, ClipboardEvent, useEffect, useMemo, useState } from 'react';
import QRCode from 'qrcode';
import {
  ArrowLeft,
  Award,
  Calendar,
  Check,
  CheckCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileJson,
  FileText,
  History,
  Loader2,
  RotateCcw,
  Settings2,
  Share2,
  Sparkles,
  Upload,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import {
  CertificateGenerationDialog,
  type CertificateGenerationOptions,
} from '@/components/certificates/certificate-generation-dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import {
  WRITING_AI_ACCESS_OPTIONS,
  formatWritingAiAccess,
  isWritingAiChatEnabled,
  isWritingAiEnabled,
  type WritingAiAccess,
} from '@humanly/shared';

type DemoStep = 'setup' | 'writing' | 'log' | 'certificate' | 'done';
type DemoEnvironment = 'default_writing' | 'custom';
type AiAccess = WritingAiAccess;
type PastePolicy = 'allowed' | 'blocked';
type LogKind = 'setting' | 'input' | 'paste' | 'blocked-paste' | 'ai' | 'certificate';
type SaveStatus = 'saved' | 'saving';

interface DemoSettings {
  documentName: string;
  description: string;
  environment: DemoEnvironment;
  aiAccess: AiAccess;
  aiGuidelines: string;
  pastePolicy: PastePolicy;
  maxCharacters: number;
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
  typedPercentage: number;
  pastedPercentage: number;
}

interface DemoCertificatePayload {
  certificateId: string;
  documentId: string;
  title: string;
  generatedAt: string;
  shareUrl: string;
  summary: {
    typedPercentage: number;
    pastedPercentage: number;
    totalCharacters: number;
    words: number;
    typedCharacters: number;
    pastedCharacters: number;
    eventCount: number;
  };
  display: CertificateGenerationOptions;
  recentEvents: Array<Pick<DemoLogEntry, 'time' | 'kind' | 'detail' | 'characters'>>;
  fullText?: string;
}

const initialSettings: DemoSettings = {
  documentName: 'Research Reflection',
  description: 'Personal writing demo with a local process certificate.',
  environment: 'custom',
  aiAccess: 'off',
  aiGuidelines: 'Brainstorming and feedback only; do not write the final draft.',
  pastePolicy: 'allowed',
  maxCharacters: 1200,
};

const defaultEnvironmentPreset: Pick<DemoSettings, 'environment' | 'aiAccess' | 'aiGuidelines' | 'pastePolicy' | 'maxCharacters'> = {
  environment: 'default_writing',
  aiAccess: 'off',
  aiGuidelines: '',
  pastePolicy: 'allowed',
  maxCharacters: 1200,
};

const customEnvironmentDefaults: Pick<DemoSettings, 'environment' | 'aiAccess' | 'aiGuidelines' | 'pastePolicy' | 'maxCharacters'> = {
  environment: 'custom',
  aiAccess: 'off',
  aiGuidelines: 'Brainstorming and feedback only; do not write the final draft.',
  pastePolicy: 'allowed',
  maxCharacters: 1200,
};

const pastePolicyLabels: Record<PastePolicy, string> = {
  allowed: 'Copy & paste allowed',
  blocked: 'Copy & paste blocked',
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

function getDemoShareUrl(certificateId: string) {
  if (typeof window === 'undefined') return `demo://certificate/${certificateId}`;
  return `${window.location.origin}/demo/fast-writing#${certificateId}`;
}

function makeSvgDataUrl(svg: string) {
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

async function copyTextToClipboard(text: string) {
  if (!navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function makeDemoCertificatePayload({
  title,
  stats,
  logs,
  options,
  draft,
  generatedAt,
  shareUrl,
}: {
  title: string;
  stats: DemoStats;
  logs: DemoLogEntry[];
  options: CertificateGenerationOptions;
  draft: string;
  generatedAt: string;
  shareUrl: string;
}): DemoCertificatePayload {
  return {
    certificateId: 'demo-certificate-local',
    documentId: 'demo-document-local',
    title: title || 'Untitled Writing',
    generatedAt,
    shareUrl,
    summary: {
      typedPercentage: stats.typedPercentage,
      pastedPercentage: stats.pastedPercentage,
      totalCharacters: stats.totalCharacters,
      words: stats.words,
      typedCharacters: stats.typedCharacters,
      pastedCharacters: stats.pastedCharacters,
      eventCount: stats.logCount,
    },
    display: options,
    recentEvents: logs.slice(0, 10).map(({ time, kind, detail, characters }) => ({
      time,
      kind,
      detail,
      characters,
    })),
    ...(options.includeFullText ? { fullText: draft } : {}),
  };
}

function sanitizePdfText(text: string) {
  return text.replace(/[^\x20-\x7E]/g, '?').replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function buildDemoCertificatePdf(payload: DemoCertificatePayload) {
  const lines = [
    'Humanly Demo Certificate',
    payload.title,
    `Certificate ID: ${payload.certificateId}`,
    `Document ID: ${payload.documentId}`,
    `Generated: ${new Date(payload.generatedAt).toLocaleString()}`,
    `Share Link: ${payload.shareUrl}`,
    '',
    `Typed: ${payload.summary.typedPercentage}%`,
    `Pasted: ${payload.summary.pastedPercentage}%`,
    `Final Text: ${payload.summary.totalCharacters.toLocaleString()} characters`,
    `Words: ${payload.summary.words.toLocaleString()}`,
    `Events: ${payload.summary.eventCount.toLocaleString()}`,
    '',
    'Recent Events:',
    ...(payload.recentEvents.length
      ? payload.recentEvents.slice(0, 6).map((event) => `${event.time}  ${event.kind}  ${event.detail}`)
      : ['No events recorded.']),
  ];

  const content = [
    'BT',
    '/F1 18 Tf',
    `1 0 0 1 50 750 Tm (${sanitizePdfText(lines[0])}) Tj`,
    '/F1 11 Tf',
    ...lines.slice(1).map((line, index) => `1 0 0 1 50 ${724 - index * 20} Tm (${sanitizePdfText(line)}) Tj`),
    'ET',
  ].join('\n');

  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>',
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
    `<< /Length ${content.length} >>\nstream\n${content}\nendstream`,
  ];

  let pdf = '%PDF-1.4\n';
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  offsets.slice(1).forEach((offset) => {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;
  return pdf;
}

function openDemoPdf(payload: DemoCertificatePayload) {
  const blob = new Blob([buildDemoCertificatePdf(payload)], { type: 'application/pdf' });
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank', 'noopener,noreferrer');
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

function downloadDemoJson(payload: DemoCertificatePayload) {
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${payload.certificateId}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 30000);
}

export function FastWritingDemo() {
  const [step, setStep] = useState<DemoStep>('setup');
  const [settings, setSettings] = useState<DemoSettings>(initialSettings);
  const [draft, setDraft] = useState('');
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiResponse, setAiResponse] = useState('');
  const [logs, setLogs] = useState<DemoLogEntry[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('saved');
  const [certificateDialogOpen, setCertificateDialogOpen] = useState(false);
  const [isGeneratingCertificate, setIsGeneratingCertificate] = useState(false);
  const [certificateOptions, setCertificateOptions] = useState<CertificateGenerationOptions>({
    includeFullText: true,
    includeEditHistory: true,
  });

  const stats = useMemo(() => {
    const pastedCharacters = logs
      .filter((entry) => entry.kind === 'paste')
      .reduce((total, entry) => total + entry.characters, 0);
    const typedCharacters = logs
      .filter((entry) => entry.kind === 'input')
      .reduce((total, entry) => total + entry.characters, 0);
    const authoredCharacters = typedCharacters + pastedCharacters;

    return {
      totalCharacters: draft.length,
      words: countWords(draft),
      typedCharacters,
      pastedCharacters,
      logCount: logs.length,
      typedPercentage: authoredCharacters > 0 ? Math.round((typedCharacters / authoredCharacters) * 100) : 0,
      pastedPercentage: authoredCharacters > 0 ? Math.round((pastedCharacters / authoredCharacters) * 100) : 0,
    };
  }, [draft, logs]);

  const appendLog = (entry: DemoLogEntry) => {
    setLogs((current) => [entry, ...current].slice(0, 80));
  };

  const updateSettings = (patch: Partial<DemoSettings>) => {
    setSettings((current) => ({ ...current, ...patch }));
  };

  const handleCreateTask = () => {
    setStep('writing');
    setSaveStatus('saved');
    const environmentLabel = settings.environment === 'default_writing' ? 'Default Environment' : 'Custom Environment';
    const aiGuidelineLabel =
      isWritingAiChatEnabled(settings.aiAccess) && settings.aiGuidelines.trim()
        ? `, AI rule: ${settings.aiGuidelines.trim()}`
        : '';
    appendLog(
      makeEntry(
        'setting',
        `${environmentLabel}, ${formatWritingAiAccess(settings.aiAccess)}, ${pastePolicyLabels[settings.pastePolicy]}, ${settings.maxCharacters.toLocaleString()} character cap${aiGuidelineLabel}`
      )
    );
  };

  const handleDraftChange = (event: ChangeEvent<HTMLTextAreaElement>) => {
    const nextDraft = event.target.value;
    const delta = nextDraft.length - draft.length;

    setDraft(nextDraft);
    setSaveStatus('saved');

    if (delta > 0) {
      appendLog(makeEntry('input', 'Typed in the Humanly editor', delta));
    }
  };

  const handlePaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = event.clipboardData.getData('text');

    if (settings.pastePolicy === 'blocked') {
      event.preventDefault();
      appendLog(makeEntry('blocked-paste', 'Paste blocked by writing environment', pastedText.length));
      return;
    }

    appendLog(makeEntry('paste', 'Pasted text into the Humanly editor', pastedText.length));
  };

  const handleAskAi = () => {
    if (!isWritingAiChatEnabled(settings.aiAccess)) return;

    const prompt = aiPrompt.trim();
    const guideline = settings.aiGuidelines.trim();
    const draftContext = draft.trim()
      ? 'Focus on structure, clarity, and places where the existing draft needs evidence.'
      : 'Start with a short outline before drafting sentences.';

    setAiResponse(
      guideline
        ? `Allowed use: ${guideline} ${draftContext}`
        : `Use the assistant for planning and feedback. ${draftContext}`
    );
    appendLog(makeEntry('ai', prompt ? `Asked AI: ${prompt}` : 'Asked AI for writing feedback', prompt.length));
    setAiPrompt('');
  };

  const handleGenerateCertificate = (options: CertificateGenerationOptions) => {
    setIsGeneratingCertificate(true);
    setCertificateOptions(options);
    appendLog(makeEntry('certificate', 'Generated a demo authorship certificate', draft.length));
    window.setTimeout(() => {
      setIsGeneratingCertificate(false);
      setCertificateDialogOpen(false);
      setStep('certificate');
    }, 180);
  };

  const handleRestart = () => {
    setStep('setup');
    setSettings(initialSettings);
    setDraft('');
    setAiPrompt('');
    setAiResponse('');
    setLogs([]);
    setSaveStatus('saved');
    setCertificateOptions({
      includeFullText: true,
      includeEditHistory: true,
    });
    setCertificateDialogOpen(false);
    setIsGeneratingCertificate(false);
  };

  return (
    <section id="demo" className="min-h-screen bg-background px-4 py-4 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-[1180px]">
        <div className="mb-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground">
              Humanly Demo
            </p>
            <h2 className="mt-1 text-2xl font-semibold leading-tight tracking-normal sm:text-3xl">
              Setup, write, certify.
            </h2>
          </div>
          <div className="grid grid-cols-4 gap-2 text-[11px] text-muted-foreground sm:min-w-[420px]">
            <StepBadge active={step === 'setup'} complete={step !== 'setup'} Icon={Settings2} label="Setup" />
            <StepBadge active={step === 'writing'} complete={['log', 'certificate', 'done'].includes(step)} Icon={FileText} label="Writing" />
            <StepBadge active={step === 'log'} complete={['certificate', 'done'].includes(step)} Icon={History} label="Logs" />
            <StepBadge active={step === 'certificate' || step === 'done'} complete={step === 'done'} Icon={Award} label="Certificate" />
          </div>
        </div>

        {step === 'setup' ? (
          <DemoTaskSetup
            settings={settings}
            onSettingsChange={updateSettings}
            onCreateTask={handleCreateTask}
          />
        ) : step === 'writing' ? (
          <DemoWritingEditor
            settings={settings}
            draft={draft}
            aiPrompt={aiPrompt}
            aiResponse={aiResponse}
            stats={stats}
            saveStatus={saveStatus}
            onDraftChange={handleDraftChange}
            onPaste={handlePaste}
            onAiPromptChange={(event) => setAiPrompt(event.target.value)}
            onAskAi={handleAskAi}
            onBackToSetup={handleRestart}
            onViewLogs={() => setStep('log')}
            onOpenCertificateDialog={() => setCertificateDialogOpen(true)}
          />
        ) : step === 'log' ? (
          <DemoActivityLog
            logs={logs}
            onBackToWriting={() => setStep('writing')}
            onOpenCertificateDialog={() => setCertificateDialogOpen(true)}
          />
        ) : step === 'certificate' ? (
          <DemoCertificatePreview
            title={settings.documentName}
            stats={stats}
            logs={logs}
            options={certificateOptions}
            draft={draft}
            onEnd={() => setStep('done')}
            onRestart={handleRestart}
          />
        ) : (
          <DonePanel onRestart={handleRestart} />
        )}
      </div>

      <CertificateGenerationDialog
        open={certificateDialogOpen}
        onOpenChange={setCertificateDialogOpen}
        onGenerate={handleGenerateCertificate}
        isGenerating={isGeneratingCertificate}
      />
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
      className={`flex min-h-10 flex-col items-center justify-center gap-0.5 rounded-[8px] border px-2 py-1 text-center ${
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

function SectionHeading({ title, description }: { title: string; description?: string }) {
  return (
    <div>
      <h3 className="text-base font-semibold tracking-normal">{title}</h3>
      {description ? <p className="mt-1 text-sm leading-6 text-muted-foreground">{description}</p> : null}
    </div>
  );
}

function DemoTaskSetup({
  settings,
  onSettingsChange,
  onCreateTask,
}: {
  settings: DemoSettings;
  onSettingsChange: (patch: Partial<DemoSettings>) => void;
  onCreateTask: () => void;
}) {
  const [referenceStatus, setReferenceStatus] = useState<string | null>(null);

  const handleEnvironmentChange = (value: DemoEnvironment) => {
    onSettingsChange(value === 'default_writing' ? defaultEnvironmentPreset : customEnvironmentDefaults);
  };

  return (
    <div className="mx-auto w-full max-w-6xl">
      <div className="mb-3 flex justify-end">
        <Button asChild variant="ghost" size="sm" className="w-fit px-0 hover:bg-transparent">
          <a href="/">
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Home
          </a>
        </Button>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="p-3 sm:p-4">
          <CardTitle className="text-lg">Document setup</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-3 px-3 pb-3 pt-0 sm:px-4 sm:pb-4 sm:pt-0 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] xl:items-stretch">
          <section className="h-full space-y-3 rounded-lg border border-border/70 bg-background p-3">
            <SectionHeading title="Basic Information" />

            <div className="humanly-field">
              <Label htmlFor="demo-document-name">Document Name</Label>
              <Input
                id="demo-document-name"
                value={settings.documentName}
                onChange={(event) => onSettingsChange({ documentName: event.target.value })}
                placeholder="My Writing Document"
              />
            </div>

            <div className="humanly-field">
              <Label htmlFor="demo-document-description">Description</Label>
              <Textarea
                id="demo-document-description"
                value={settings.description}
                onChange={(event) => onSettingsChange({ description: event.target.value })}
                placeholder="Optional context for this document..."
                className="h-16 resize-none"
                style={{ minHeight: '4rem' }}
              />
            </div>

            <div className="rounded-lg border border-dashed border-border/80 bg-muted/25 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Upload className="h-4 w-4 text-accent" />
                PDF
              </div>
              <button
                type="button"
                aria-label="Open reflection-source.pdf"
                onClick={() => setReferenceStatus('Opened local reference preview.')}
                className="mt-2 flex w-full items-center gap-3 rounded-lg border border-border/70 bg-background p-2 text-left transition-colors hover:border-foreground/50 hover:bg-muted/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <FileText className="h-5 w-5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">reflection-source.pdf</p>
                </div>
                <ExternalLink className="h-4 w-4 shrink-0 text-muted-foreground" />
              </button>
              {referenceStatus ? (
                <p className="mt-2 text-xs text-muted-foreground" role="status">
                  {referenceStatus}
                </p>
              ) : null}
            </div>
          </section>

          <div className="h-full space-y-3 rounded-lg border border-border/70 bg-background p-3">
            <SectionHeading title="Environment" />

            <div className="humanly-field">
              <Label>Environment</Label>
              <Select value={settings.environment} onValueChange={(value) => handleEnvironmentChange(value as DemoEnvironment)}>
                <SelectTrigger aria-label="Environment">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default_writing">Default Environment</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {settings.environment === 'default_writing' ? (
              <div className="rounded-lg border border-border/70 bg-card p-3">
                <div className="grid gap-3 text-sm text-muted-foreground sm:grid-cols-3">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em]">AI</p>
                    <p className="mt-1 text-foreground">{formatWritingAiAccess(settings.aiAccess)}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em]">Paste</p>
                    <p className="mt-1 text-foreground">{pastePolicyLabels[settings.pastePolicy]}</p>
                  </div>
                  <div>
                    <p className="text-xs font-bold uppercase tracking-[0.12em]">Maximum</p>
                    <p className="mt-1 text-foreground">{settings.maxCharacters.toLocaleString()} characters</p>
                  </div>
                </div>
              </div>
            ) : (
              <div className="grid gap-3 lg:grid-cols-2">
                <div className="space-y-3 rounded-lg border border-border/70 bg-card p-3">
                  <div className="humanly-field">
                    <Label>AI</Label>
                    <Select
                      value={settings.aiAccess}
                      onValueChange={(value) => onSettingsChange({ aiAccess: value as AiAccess })}
                    >
                      <SelectTrigger aria-label="AI access">
                        <SelectValue placeholder="AI access" />
                      </SelectTrigger>
                      <SelectContent>
                        {WRITING_AI_ACCESS_OPTIONS.map((option) => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-border/70 bg-card p-3">
                  <div className="humanly-field">
                    <Label>Copy & Paste</Label>
                    <Select
                      value={settings.pastePolicy}
                      onValueChange={(value) => onSettingsChange({ pastePolicy: value as PastePolicy })}
                    >
                      <SelectTrigger aria-label="Copy-paste policy">
                        <SelectValue placeholder="Copy-paste policy" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="allowed">Allowed</SelectItem>
                        <SelectItem value="blocked">Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {isWritingAiEnabled(settings.aiAccess) ? (
                  <div className="space-y-3 rounded-lg border border-border/70 bg-card p-3 lg:col-span-2">
                    <div className="humanly-field">
                      <Label htmlFor="demo-ai-guidelines">AI Guidelines</Label>
                      <Textarea
                        id="demo-ai-guidelines"
                        value={settings.aiGuidelines}
                        onChange={(event) => onSettingsChange({ aiGuidelines: event.target.value })}
                        className="h-16 resize-none"
                        style={{ minHeight: '4rem' }}
                      />
                    </div>
                  </div>
                ) : null}

                <div className="space-y-3 rounded-lg border border-border/70 bg-card p-3 lg:col-span-2">
                  <div className="humanly-field">
                    <Label htmlFor="demo-max-characters">Maximum Characters</Label>
                    <Input
                      id="demo-max-characters"
                      type="number"
                      min={1}
                      value={settings.maxCharacters}
                      onChange={(event) => onSettingsChange({ maxCharacters: Number(event.target.value) || 1 })}
                      placeholder="No maximum"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-end gap-3 border-t border-border/70 bg-muted/20 px-3 py-3 sm:px-4">
          <Button asChild variant="outline">
            <a href="/">
              Cancel
            </a>
          </Button>
          <Button type="button" onClick={onCreateTask}>
            Create Writing
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

function SaveStatusIndicator({ status }: { status: SaveStatus }) {
  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium ${
        status === 'saving' ? 'text-muted-foreground' : 'text-emerald-700'
      }`}
      aria-live="polite"
    >
      {status === 'saving' ? (
        <>
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>Saving...</span>
        </>
      ) : (
        <>
          <CheckCircle2 className="h-3.5 w-3.5" />
          <span>Saved</span>
        </>
      )}
    </span>
  );
}

function DemoWritingEditor({
  settings,
  draft,
  aiPrompt,
  aiResponse,
  stats,
  saveStatus,
  onDraftChange,
  onPaste,
  onAiPromptChange,
  onAskAi,
  onBackToSetup,
  onViewLogs,
  onOpenCertificateDialog,
}: {
  settings: DemoSettings;
  draft: string;
  aiPrompt: string;
  aiResponse: string;
  stats: DemoStats;
  saveStatus: SaveStatus;
  onDraftChange: (event: ChangeEvent<HTMLTextAreaElement>) => void;
  onPaste: (event: ClipboardEvent<HTMLTextAreaElement>) => void;
  onAiPromptChange: (event: ChangeEvent<HTMLInputElement>) => void;
  onAskAi: () => void;
  onBackToSetup: () => void;
  onViewLogs: () => void;
  onOpenCertificateDialog: () => void;
}) {
  return (
    <div className="flex h-[calc(100vh-132px)] min-h-[420px] max-h-[620px] flex-col overflow-hidden rounded-lg border border-border/80 bg-background shadow-[0_34px_80px_-56px_rgba(20,22,26,0.75)]">
      <div className="shrink-0 border-b border-border/70 bg-card">
        <div className="px-3 py-2 sm:px-4">
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                type="button"
                variant="outline"
                size="icon"
                aria-label="Back to setup"
                title="Back to setup"
                onClick={onBackToSetup}
                className="h-9 w-9"
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className="min-w-0 truncate text-lg font-semibold tracking-normal">
                    {settings.documentName || 'Untitled Writing'}
                  </h3>
                  <SaveStatusIndicator status={saveStatus} />
                </div>
                <div className="mt-0.5 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                  <span>Personal writing</span>
                </div>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2">
              <Badge variant="secondary" className="rounded-md">
                {stats.totalCharacters.toLocaleString()}/{settings.maxCharacters.toLocaleString()} characters
              </Badge>
              <Button
                type="button"
                variant="outline"
                size="sm"
                aria-label="View Logs"
                onClick={onViewLogs}
                className="sm:size-default"
              >
                <FileText className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">View Logs</span>
              </Button>
              <Button
                type="button"
                size="sm"
                aria-label="Generate Certificate"
                onClick={onOpenCertificateDialog}
                className="sm:size-default"
              >
                <Award className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Generate Certificate</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-hidden p-2 sm:p-3">
        <div className="grid h-full overflow-hidden rounded-lg border border-border/80 bg-card lg:grid-cols-[38%_1fr]">
          <div className="hidden min-h-0 flex-col overflow-hidden border-r border-border/70 bg-card lg:flex">
            <div className="shrink-0 border-b border-border/70 bg-muted/30 px-3 py-2">
              <div className="inline-flex max-w-[240px] items-center gap-2 truncate rounded-lg bg-primary px-3 py-1.5 text-sm font-medium text-primary-foreground">
                <FileText className="h-4 w-4 shrink-0" />
                <span className="truncate">reflection-brief.pdf</span>
              </div>
            </div>
            <div className="min-h-0 flex-1 overflow-auto bg-[#f8f8f6] p-3">
              <div className="mx-auto min-h-full max-w-[390px] rounded-sm bg-white p-4 shadow-sm ring-1 ring-border/70">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-muted-foreground">
                  Assignment Brief
                </p>
                <h4 className="mt-3 text-base font-semibold">Reflection Prompt</h4>
                <p className="mt-2 text-sm leading-5 text-muted-foreground">
                  Write a short reflection that explains your reasoning process.
                </p>
                <Separator className="my-4" />
                <div className="space-y-2 text-sm leading-5">
                  <p><span className="font-medium">AI:</span> {formatWritingAiAccess(settings.aiAccess)}</p>
                  {isWritingAiChatEnabled(settings.aiAccess) && settings.aiGuidelines.trim() ? (
                    <p><span className="font-medium">AI rule:</span> {settings.aiGuidelines}</p>
                  ) : null}
                  <p><span className="font-medium">Paste:</span> {pastePolicyLabels[settings.pastePolicy]}</p>
                  <p><span className="font-medium">Maximum:</span> {settings.maxCharacters.toLocaleString()} characters</p>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-auto bg-background">
            <div className="flex h-full min-h-0 flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4">
              <Textarea
                aria-label="Demo writing editor"
                value={draft}
                onChange={onDraftChange}
                onPaste={onPaste}
                placeholder="Start writing with your instruction file open..."
                className="min-h-0 flex-1 resize-none rounded-lg border-border/80 bg-card p-4 text-base leading-7 shadow-sm"
              />
              {isWritingAiChatEnabled(settings.aiAccess) ? (
                <div className="shrink-0 rounded-lg border border-border/80 bg-card p-3 shadow-sm">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
                      <Sparkles className="h-4 w-4 shrink-0 text-accent" />
                      <span className="truncate">AI Assistant</span>
                    </div>
                    <Badge variant="secondary" className="rounded-md">
                      Guided
                    </Badge>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-[1fr_auto]">
                    <Input
                      aria-label="Demo AI prompt"
                      value={aiPrompt}
                      onChange={onAiPromptChange}
                      placeholder="Ask for feedback or an outline..."
                    />
                    <Button
                      type="button"
                      aria-label="Ask AI assistant"
                      onClick={onAskAi}
                      disabled={!aiPrompt.trim() && !draft.trim()}
                    >
                      <Sparkles className="mr-2 h-4 w-4" />
                      Ask
                    </Button>
                  </div>
                  {aiResponse ? (
                    <p className="mt-2 rounded-md bg-muted/35 px-3 py-2 text-sm leading-5 text-muted-foreground" role="status">
                      {aiResponse}
                    </p>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function DemoActivityLog({
  logs,
  onBackToWriting,
  onOpenCertificateDialog,
}: {
  logs: DemoLogEntry[];
  onBackToWriting: () => void;
  onOpenCertificateDialog: () => void;
}) {
  return (
    <div className="mx-auto max-w-6xl rounded-lg border border-border/80 bg-card shadow-[0_34px_80px_-56px_rgba(20,22,26,0.75)]">
      <div className="flex flex-col gap-3 border-b border-border/70 p-3 sm:flex-row sm:items-center sm:justify-between sm:p-4">
        <div>
          <h3 className="text-xl font-semibold tracking-normal">Activity Logs</h3>
        </div>
        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={onBackToWriting}>
            Back to Writing
          </Button>
          <Button type="button" onClick={onOpenCertificateDialog}>
            <Award className="mr-2 h-4 w-4" />
            Generate Certificate
          </Button>
        </div>
      </div>

      <div className="overflow-hidden">
        <div className="grid grid-cols-[88px_128px_1fr_72px] bg-muted/35 px-4 py-2 text-xs font-bold uppercase tracking-[0.12em] text-muted-foreground">
          <span>Time</span>
          <span>Event</span>
          <span>Detail</span>
          <span className="text-right">Chars</span>
        </div>
        <div className="max-h-[calc(100vh-190px)] overflow-auto">
          {logs.length ? (
            logs.map((entry) => (
              <div
                key={entry.id}
                className="grid grid-cols-[88px_128px_1fr_72px] border-t border-border/70 px-4 py-2 text-sm"
              >
                <span className="text-muted-foreground">{entry.time}</span>
                <span>
                  <Badge variant="secondary" className="rounded-md">
                    {entry.kind}
                  </Badge>
                </span>
                <span className="min-w-0 truncate text-muted-foreground">{entry.detail}</span>
                <span className="text-right text-muted-foreground">{entry.characters}</span>
              </div>
            ))
          ) : (
            <div className="px-5 py-12 text-center text-sm text-muted-foreground">
              No events yet. Go back and type a few words.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border/60 bg-muted/35 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-2xl font-semibold">{value}</p>
    </div>
  );
}

function DemoCertificatePreview({
  title,
  stats,
  logs,
  options,
  draft,
  onEnd,
  onRestart,
}: {
  title: string;
  stats: DemoStats;
  logs: DemoLogEntry[];
  options: CertificateGenerationOptions;
  draft: string;
  onEnd: () => void;
  onRestart: () => void;
}) {
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [qrCodeDataUrl, setQrCodeDataUrl] = useState('');
  const editingMinutes = Math.max(1, Math.ceil(stats.logCount / 3));
  const latestLogs = logs.slice(0, 4);
  const generatedAt = useMemo(() => new Date().toISOString(), []);
  const shareUrl = useMemo(() => getDemoShareUrl('demo-certificate-local'), []);
  const visibleShareUrl = shareUrl.replace(/^https?:\/\//, '');
  const certificatePayload = useMemo(
    () => makeDemoCertificatePayload({
      title,
      stats,
      logs,
      options,
      draft,
      generatedAt,
      shareUrl,
    }),
    [title, stats, logs, options, draft, generatedAt, shareUrl]
  );

  useEffect(() => {
    let isMounted = true;

    QRCode.toString(shareUrl, {
      type: 'svg',
      margin: 2,
      color: {
        dark: '#1a1c20',
        light: '#ffffff',
      },
    })
      .then((svg) => {
        if (isMounted) setQrCodeDataUrl(makeSvgDataUrl(svg));
      })
      .catch(() => {
        if (isMounted) setQrCodeDataUrl('');
      });

    return () => {
      isMounted = false;
    };
  }, [shareUrl]);

  const handleShareLink = async () => {
    const copied = await copyTextToClipboard(shareUrl);
    setActionStatus(copied ? 'Share link copied.' : `Share link: ${shareUrl}`);
  };

  const handleOpenPdf = () => {
    openDemoPdf(certificatePayload);
    setActionStatus('Opened local certificate PDF.');
  };

  const handleDownloadJson = () => {
    downloadDemoJson(certificatePayload);
    setActionStatus('JSON data downloaded.');
  };

  const handleCopyToken = async () => {
    const copied = await copyTextToClipboard(certificatePayload.certificateId);
    setActionStatus(copied ? 'Certificate token copied.' : `Certificate token: ${certificatePayload.certificateId}`);
  };

  return (
    <div className="mx-auto max-w-6xl rounded-lg border border-border/80 bg-background p-3 shadow-[0_34px_80px_-56px_rgba(20,22,26,0.75)] sm:p-4">
      <div className="mb-3 flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted-foreground">
            Certificate
          </p>
          <h3 className="truncate text-xl font-semibold tracking-normal">{title || 'Untitled Writing'}</h3>
        </div>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-5 lg:w-auto">
          <Button type="button" variant="outline" size="sm" aria-label="End demo" onClick={onEnd}>
            End
          </Button>
          <Button type="button" variant="outline" size="sm" aria-label="Share Link" onClick={handleShareLink}>
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
          <Button type="button" size="sm" aria-label="Open PDF" onClick={handleOpenPdf}>
            <FileText className="mr-2 h-4 w-4" />
            PDF
          </Button>
          <Button type="button" variant="outline" size="sm" aria-label="JSON Data" onClick={handleDownloadJson}>
            <FileJson className="mr-2 h-4 w-4" />
            JSON
          </Button>
          <Button type="button" variant="outline" size="sm" aria-label="Do it again" onClick={onRestart}>
            <RotateCcw className="mr-2 h-4 w-4" />
            Again
          </Button>
        </div>
      </div>
      {actionStatus ? (
        <p className="mb-3 rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-sm text-muted-foreground" role="status">
          {actionStatus}
        </p>
      ) : null}

      <Card>
        <CardContent className="grid gap-3 p-3 lg:grid-cols-[minmax(0,1.4fr)_minmax(220px,0.75fr)_minmax(240px,0.85fr)]">
          <div className="space-y-3">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Generated just now
            </div>
            <p className="text-sm text-muted-foreground">Verifiable writing process snapshot.</p>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-2">
              <StatTile label="Typed" value={`${stats.typedPercentage}%`} />
              <StatTile label="Pasted" value={`${stats.pastedPercentage}%`} />
              <StatTile label="Final Text" value={stats.totalCharacters.toLocaleString()} />
              <StatTile label="Time" value={`${editingMinutes} min`} />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Composition</span>
                <span className="font-medium">
                  {stats.typedCharacters.toLocaleString()} typed / {stats.pastedCharacters.toLocaleString()} pasted
                </span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
                <div className="bg-primary" style={{ width: `${stats.typedPercentage}%` }} />
                <div className="bg-[#b9774f]" style={{ width: `${stats.pastedPercentage}%` }} />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
            <h4 className="text-sm font-medium">Verification</h4>
            <div className="mt-2 flex flex-col items-center">
              <div className="flex h-32 w-32 items-center justify-center rounded bg-white p-2 ring-1 ring-border/70">
                {qrCodeDataUrl ? (
                  <img
                    src={qrCodeDataUrl}
                    alt="Demo certificate verification QR code"
                    className="h-full w-full"
                  />
                ) : (
                  <div
                    className="h-full w-full animate-pulse rounded bg-muted"
                    role="status"
                    aria-label="Generating verification QR code"
                  />
                )}
              </div>
              <p className="mt-2 max-w-full break-all text-center text-[11px] leading-4 text-muted-foreground">
                {visibleShareUrl}
              </p>
            </div>
            <Button type="button" variant="outline" size="sm" className="mt-2 w-full bg-background" onClick={handleShareLink}>
              <Share2 className="mr-2 h-4 w-4" />
              Copy Link
            </Button>
          </div>

          <div className="space-y-3">
            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <h4 className="text-sm font-medium">Public Display</h4>
              <div className="mt-2 space-y-1.5 text-sm text-muted-foreground">
                <p className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-700" />
                  {options.includeFullText ? 'Full text included' : 'Full text hidden'}
                </p>
                <p className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-emerald-700" />
                  {options.includeEditHistory ? 'Edit history included' : 'Edit history hidden'}
                </p>
              </div>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <h4 className="text-sm font-medium">Recent proof events</h4>
              {latestLogs.length ? (
                <div className="mt-2 space-y-1.5">
                  {latestLogs.map((entry) => (
                    <div key={entry.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-muted-foreground">{entry.detail}</span>
                      <span className="shrink-0 font-medium">{entry.time}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="mt-2 text-sm text-muted-foreground">No events recorded.</p>
              )}
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/20 p-3 text-xs">
              <h4 className="text-sm font-medium">Demo identifiers</h4>
              <div className="mt-2 grid grid-cols-2 gap-2">
                <div>
                  <p className="text-muted-foreground">Certificate ID</p>
                  <p className="truncate">demo-certificate-local</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Document ID</p>
                  <p className="truncate">demo-document-local</p>
                </div>
              </div>
              <Button type="button" variant="outline" size="sm" className="mt-2 w-full bg-background" onClick={handleCopyToken}>
                <Copy className="mr-2 h-4 w-4" />
                Copy Token
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DonePanel({ onRestart }: { onRestart: () => void }) {
  return (
    <div className="mx-auto max-w-3xl rounded-lg border border-border/80 bg-card p-8 text-center shadow-[0_34px_80px_-56px_rgba(20,22,26,0.75)]">
      <p className="text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground">Demo complete</p>
      <h3 className="mt-3 text-2xl font-semibold tracking-normal">The local session has ended.</h3>
      <p className="mx-auto mt-4 max-w-md text-sm leading-6 text-muted-foreground">
        Start another run to configure a fresh writing document, write again, inspect new logs, and generate a new preview.
      </p>
      <Button type="button" className="mt-6 font-bold" onClick={onRestart}>
        <RotateCcw className="mr-2 h-4 w-4" />
        Do it again
      </Button>
    </div>
  );
}

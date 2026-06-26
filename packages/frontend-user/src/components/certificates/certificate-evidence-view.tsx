'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Award,
  Calendar,
  ChevronDown,
  Clock,
  Download,
  FileText,
  MessageSquare,
  ShieldAlert,
  ShieldCheck,
  Wand2,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  formatCompactDuration,
  formatDisplayDateTimeRange,
  formatDisplayTimestamp,
  getLocalTimeZoneLabel,
  formatWritingAiAccess,
  formatWritingAiPolicy,
  getMaxWritingAttempts,
  isWritingAiChatEnabled,
  isWritingAiPolishEnabled,
  normalizeCopyPastePolicy,
  normalizeWritingAttemptPolicy,
  normalizeResourceAccessPolicy,
  getEnvironmentConfigExtension,
  serializeEnvironmentConfig,
  type AuthorshipComposition,
  type AuthorshipTextSourceSpan,
  type AIAuthorshipStats,
  type CertificateSeal,
  type CertificateSealStatus,
  type CertificateType,
  type EnvironmentConfigFileFormat,
  type WritingAnomalyFlag,
  type WritingEnvironmentConfig,
} from '@humanly/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { DocumentReplay } from '@/components/certificates/document-replay';

const SECTION_TITLE_CLASS = 'text-lg font-semibold tracking-normal';
const COMPOSITION_COLORS = {
  typed: '#7B8C9E',
  pasted: '#B2A189',
  aiAssisted: '#9E93B5',
} as const;
const COMPOSITION_HIGHLIGHT_COLORS = {
  typed: 'rgba(88, 128, 166, 0.40)',
  pasted: 'rgba(190, 164, 112, 0.42)',
  aiAssisted: 'rgba(150, 132, 176, 0.42)',
} as const;
const FINAL_TEXT_PREVIEW_ROWS = 6;

export interface CertificateEvidenceRecord {
  id: string;
  documentId?: string;
  title: string;
  certificateType: CertificateType | string;
  generatedAt: string | Date;
  totalCharacters: number;
  typedCharacters: number;
  pastedCharacters: number;
  finalTextComposition?: AuthorshipComposition | null;
  finalTextSourceSpans?: AuthorshipTextSourceSpan[] | null;
  processInputVolume?: AuthorshipComposition | null;
  totalEvents: number;
  typingEvents: number;
  pasteEvents: number;
  editingTimeSeconds: number;
  anomalyFlags?: WritingAnomalyFlag[] | null;
  includeEditHistory?: boolean;
  signerName?: string | null;
  environmentConfig?: WritingEnvironmentConfig | null;
}

interface CertificateEvidenceViewProps {
  certificate: CertificateEvidenceRecord;
  aiStats?: AIAuthorshipStats | null;
  isLoadingAiStats?: boolean;
  replayToken?: string;
  replayAccessCode?: string;
  seal?: CertificateSeal;
  sealStatus?: CertificateSealStatus;
  integrityMessage?: string;
}

function getSealStatusLabel(status?: CertificateSealStatus) {
  if (status === 'valid') return 'Signature verified';
  if (status === 'legacy_valid') return 'Legacy seal';
  if (status === 'invalid') return 'Seal mismatch';
  return 'Seal unavailable';
}

function getSealStatusPresentation(status?: CertificateSealStatus) {
  if (status === 'valid') {
    return {
      Icon: ShieldCheck,
      containerClass: 'border-[#c8d4c8] bg-[#f3f7f1]',
      iconClass: 'bg-[#dfe8dc] text-[#58715f]',
      badgeClass: 'border-[#c8d4c8] bg-[#eef3ed] text-[#58715f]',
      message: 'Publicly verifiable signature matches this certificate record.',
    };
  }

  if (status === 'legacy_valid') {
    return {
      Icon: ShieldCheck,
      containerClass: 'border-[#d7c8a8] bg-[#fbf6e8]',
      iconClass: 'bg-[#f1e4c5] text-[#8a6b2f]',
      badgeClass: 'border-[#d7c8a8] bg-[#f8eed3] text-[#8a6b2f]',
      message: 'The integrity seal matches this certificate record.',
    };
  }

  if (status === 'invalid') {
    return {
      Icon: ShieldAlert,
      containerClass: 'border-destructive/30 bg-destructive/10',
      iconClass: 'bg-destructive/15 text-destructive',
      badgeClass: 'border-destructive/30 bg-destructive/10 text-destructive',
      message: 'The seal does not match this certificate record.',
    };
  }

  return {
    Icon: ShieldAlert,
    containerClass: 'border-border/70 bg-muted/25',
    iconClass: 'bg-muted text-muted-foreground',
    badgeClass: 'border-border/70 bg-muted/35 text-muted-foreground',
    message: 'No integrity seal is available for this certificate.',
  };
}

function formatPercentage(value: number) {
  if (!Number.isFinite(value) || value <= 0) return '0%';
  if (value < 1) return '<1%';
  return `${Math.round(value)}%`;
}

function formatCompositionLabel(percentage: number, characters: number) {
  return `${formatPercentage(percentage)} · ${characters.toLocaleString()} chars`;
}

function createLegacyComposition(certificate: Pick<CertificateEvidenceRecord, 'typedCharacters' | 'pastedCharacters'>): AuthorshipComposition {
  return {
    typedCharacters: certificate.typedCharacters,
    pastedCharacters: certificate.pastedCharacters,
    aiAssistedCharacters: 0,
    aiAssistedByType: {
      chatInsert: 0,
      chatPaste: 0,
      grammar: 0,
      improve: 0,
      simplify: 0,
      formal: 0,
      other: 0,
    },
  };
}

function getCompositionTotal(composition: AuthorshipComposition) {
  return composition.typedCharacters + composition.pastedCharacters + composition.aiAssistedCharacters;
}

function getCompositionPercentages(composition: AuthorshipComposition) {
  const total = getCompositionTotal(composition);
  return {
    total,
    typed: total > 0 ? (composition.typedCharacters / total) * 100 : 0,
    pasted: total > 0 ? (composition.pastedCharacters / total) * 100 : 0,
    aiAssisted: total > 0 ? (composition.aiAssistedCharacters / total) * 100 : 0,
  };
}

function getSourceSpanColor(source: AuthorshipTextSourceSpan['source']) {
  if (source === 'pasted') return COMPOSITION_HIGHLIGHT_COLORS.pasted;
  if (source === 'ai_assisted') return COMPOSITION_HIGHLIGHT_COLORS.aiAssisted;
  return COMPOSITION_HIGHLIGHT_COLORS.typed;
}

function getTextSourceSpanCharacterCount(spans: AuthorshipTextSourceSpan[]) {
  return spans.reduce((total, span) => total + span.text.length, 0);
}

function formatPreset(value?: string | null) {
  if (!value) return 'Custom';
  return value
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase());
}

function formatUsageLimit(config: WritingEnvironmentConfig) {
  const limit = config.aiUsageLimit;
  if (!limit || limit.mode === 'unlimited') return 'Unlimited';
  if (limit.mode === 'max_requests') return `${limit.maxRequests ?? 0} requests`;
  if (limit.mode === 'max_tokens') return `${limit.maxTokens ?? 0} tokens`;
  return 'Time restricted';
}

function formatTokenLimit(value?: number | null) {
  if (!value) return 'Not configured';
  return `${value.toLocaleString()} tokens`;
}

function formatAvailabilityWindow(config: WritingEnvironmentConfig) {
  return formatDisplayDateTimeRange(
    {
      start: config.time?.startTime,
      end: config.time?.endTime,
    },
    {
      emptyFallback: 'No availability window',
      invalidFallback: 'Availability window unavailable',
    }
  );
}

function formatWritingTimeLimit(config: WritingEnvironmentConfig) {
  const limitSeconds = config.time?.timeLimitSeconds;
  if (limitSeconds) return formatCompactDuration(limitSeconds);

  return 'No limit';
}

function formatCharacterLimit(config: WritingEnvironmentConfig) {
  const min = config.submission?.minCharacters;
  const max = config.submission?.maxCharacters;
  if (min && max) return `${min.toLocaleString()} - ${max.toLocaleString()} chars`;
  if (min) return `Min ${min.toLocaleString()} chars`;
  if (max) return `Max ${max.toLocaleString()} chars`;
  return 'No limit';
}

function formatTraceability(config: WritingEnvironmentConfig) {
  const traceability = config.traceability || {};
  const enabled = [
    traceability.trackTyping ? 'Typing' : null,
    traceability.trackCopyPaste ? 'Clipboard' : null,
    traceability.trackFocusBlur ? 'Focus' : null,
    traceability.trackAiUsage ? 'AI' : null,
  ].filter(Boolean);

  return enabled.length > 0 ? enabled.join(', ') : 'Not configured';
}

function getEnvironmentRows(config?: WritingEnvironmentConfig | null) {
  if (!config) return [];

  const isAdminAssigned = config.taskType === 'admin_assigned';
  const aiEnabled = config.aiAccess !== 'off';
  const rows: string[][] = [
    ['Environment', isAdminAssigned ? 'Assigned task' : 'Personal writing'],
    ['Preset', formatPreset(config.preset)],
    ['AI access', formatWritingAiAccess(config.aiAccess)],
  ];

  if (aiEnabled && config.allowedModels?.length) {
    rows.push(['AI model', config.allowedModels.join(', ')]);
  }

  if (isWritingAiPolishEnabled(config.aiAccess)) {
    rows.push(['Quick-action token limit', formatTokenLimit(config.aiTokenBudget?.shortcutMaxTokens)]);
  }

  if (isWritingAiChatEnabled(config.aiAccess)) {
    rows.push(['Agent chat token limit', formatTokenLimit(config.aiTokenBudget?.chatMaxTokens)]);
    rows.push([
      'AI Guard policy',
      formatWritingAiPolicy(config) === 'Guard' ? 'Guarded by custom rejection rule' : 'Off',
    ]);
  }

  if (isAdminAssigned) {
    rows.push(['AI limit', formatUsageLimit(config)]);
  }

  rows.push([
    'Copy / paste',
    normalizeCopyPastePolicy(config.copyPastePolicy) === 'blocked'
      ? 'Copy-paste blocked'
      : 'Copy-paste allowed',
  ]);
  rows.push([
    'PDF resource access',
    normalizeResourceAccessPolicy(config.resourceAccess) === 'view-only' ? 'View-only' : 'Downloadable',
  ]);

  if (isAdminAssigned) {
    rows.push(['Availability window', formatAvailabilityWindow(config)]);
  }

  rows.push(['Writing time limit', formatWritingTimeLimit(config)]);

  if (isAdminAssigned) {
    rows.push(['Character limit', formatCharacterLimit(config)]);
    const attemptPolicy = normalizeWritingAttemptPolicy(config.submission?.attemptPolicy);
    rows.push([
      'Task Attempts',
      attemptPolicy.mode === 'restart_allowed'
        ? `Restarts allowed, max ${getMaxWritingAttempts(config)}`
        : 'Single durable attempt',
    ]);
  } else {
    rows.push([
      'Maximum characters',
      config.submission?.maxCharacters ? `${config.submission.maxCharacters.toLocaleString()} chars` : 'No maximum',
    ]);
  }

  rows.push(['Traceability', formatTraceability(config)]);

  return rows;
}

function getFlagSeverityClass(severity: WritingAnomalyFlag['severity']) {
  if (severity === 'critical') {
    return 'border-[#d6c5c7] bg-[#f2edee] text-[#6f5d61]';
  }

  if (severity === 'warning') {
    return 'border-[#d8ccba] bg-[#f2efe8] text-[#6a6256]';
  }

  return 'border-[#c8d1dc] bg-[#eef1f4] text-[#576777]';
}

function normalizeReviewSignal(flag: WritingAnomalyFlag): WritingAnomalyFlag | null {
  if (flag.code === 'clock_skew_anomaly' || flag.code === 'uniform_key_cadence') {
    return null;
  }

  if (
    flag.code === 'text_influx_without_input' ||
    flag.code === 'focus_text_influx' ||
    flag.code === 'sustained_high_typing_speed'
  ) {
    return {
      ...flag,
      code: 'rapid_text_accumulation',
      label: 'Rapid text accumulation',
      description: 'A large amount of text appeared within a short time window.',
      evidence: {
        legacyCode: flag.code,
        ...(flag.evidence || {}),
      },
    };
  }

  if (flag.code === 'away_from_workspace') {
    const leftCount = Number(flag.evidence?.leftCount || 0);
    const totalAwayTime = String(flag.evidence?.totalAwayTime || '');
    const longestAwayTime = String(flag.evidence?.longestAwayTime || '');
    const isClearlyLongOrRepeated =
      leftCount >= 3 ||
      /[5-9]min|[1-9][0-9]+min/.test(longestAwayTime) ||
      /1[0-9]min|[2-9][0-9]+min/.test(totalAwayTime);

    if (!isClearlyLongOrRepeated) return null;

    return {
      ...flag,
      code: 'long_or_repeated_away_from_workspace',
      label: 'Long or repeated away-from-workspace time',
      description: 'The writer left the Humanly writing workspace for a long time or repeatedly during the session.',
      evidence: {
        legacyCode: flag.code,
        ...(flag.evidence || {}),
      },
    };
  }

  if (flag.code === 'rapid_tab_switching') {
    return {
      ...flag,
      label: 'Rapid tab switching',
      description: 'The writer repeatedly left and returned to the Humanly workspace in a short window.',
    };
  }

  if (flag.code === 'paste_policy_violation') {
    return {
      ...flag,
      code: 'blocked_copy_paste_attempt',
      label: 'Blocked copy-paste attempt',
      description: 'Copy, cut, or paste was attempted while copy-paste was disabled in the writing environment.',
      evidence: {
        legacyCode: flag.code,
        ...(flag.evidence || {}),
      },
    };
  }

  if (flag.code === 'ai_policy_refusal') {
    return {
      ...flag,
      code: 'chat_refusal',
      label: flag.evidence?.refusalCount === 1 ? 'Chat refusal' : 'Chat refusals',
    };
  }

  return flag;
}

function getReviewSignals(flags?: WritingAnomalyFlag[] | null): WritingAnomalyFlag[] {
  return (flags || [])
    .map(normalizeReviewSignal)
    .filter((flag): flag is WritingAnomalyFlag => Boolean(flag));
}

function isTimestampEvidenceKey(key: string) {
  return key === 'windowStart' || key === 'windowEnd' || /timestamp$/i.test(key);
}

function formatEvidenceValue(key: string, value: unknown) {
  if (value === null || value === undefined) return 'Unavailable';
  if (Array.isArray(value)) return value.join(', ');
  if (isTimestampEvidenceKey(key)) {
    return formatDisplayTimestamp(
      typeof value === 'string' || typeof value === 'number' ? value : null,
      { locale: 'en-US' }
    );
  }
  if (typeof value === 'number') return Number.isInteger(value) ? value.toLocaleString() : value.toFixed(1);
  return String(value);
}

function formatEvidenceKey(key: string) {
  return key
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (char) => char.toUpperCase());
}

const HIDDEN_EVIDENCE_KEYS = new Set(['eventType', 'legacyCode']);

function getVisibleEvidenceEntries(flag: WritingAnomalyFlag) {
  return Object.entries(flag.evidence || {})
    .filter(([key]) => !HIDDEN_EVIDENCE_KEYS.has(key))
    .slice(0, 6);
}

function downloadEnvironmentConfig(
  certificateId: string,
  config: WritingEnvironmentConfig | null | undefined,
  format: EnvironmentConfigFileFormat
) {
  if (!config || typeof window === 'undefined') return;

  const { content, contentType } = serializeEnvironmentConfig(config, format);
  const blob = new Blob([content], { type: contentType });
  const url = window.URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = `humanly-environment-${certificateId}.${getEnvironmentConfigExtension(format)}`;
  window.document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

export function CertificateEvidenceView({
  certificate,
  aiStats,
  isLoadingAiStats = false,
  replayToken,
  replayAccessCode,
  seal,
  sealStatus,
  integrityMessage,
}: CertificateEvidenceViewProps) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [sealDetailsOpen, setSealDetailsOpen] = useState(false);
  const [replayOpen, setReplayOpen] = useState(false);
  const [behaviorReviewOpen, setBehaviorReviewOpen] = useState(false);
  const [environmentOpen, setEnvironmentOpen] = useState(false);
  const [finalTextExpanded, setFinalTextExpanded] = useState(false);
  const [finalTextCanExpand, setFinalTextCanExpand] = useState(false);
  const finalTextVisualizationRef = useRef<HTMLDivElement | null>(null);
  const textImprovementTotal = aiStats?.selectionActions.total || 0;
  const aiChatTotal = aiStats?.aiQuestions.total || 0;
  const finalTextComposition = certificate.finalTextComposition || createLegacyComposition(certificate);
  const processInputVolume = certificate.processInputVolume || null;
  const finalTextPercentages = getCompositionPercentages(finalTextComposition);
  const finalTextSourceSpans = (certificate.finalTextSourceSpans || []).filter((span) => Boolean(span.text));
  const finalTextSourceCharacterCount = getTextSourceSpanCharacterCount(finalTextSourceSpans);
  const hasFinalTextVisualization = finalTextSourceCharacterCount > 0;
  const processInputPercentages = processInputVolume
    ? getCompositionPercentages(processInputVolume)
    : null;
  const sealHashPreview = seal?.payloadHash
    ? `${seal.payloadHash.slice(0, 12)}...${seal.payloadHash.slice(-12)}`
    : null;
  const sealEvidenceRows = [
    ['Payload hash', sealHashPreview || 'Unavailable'],
    ['Algorithm', seal?.algorithm || 'Unavailable'],
    ['Key ID', seal?.keyId || 'Unavailable'],
    ['Public key fingerprint', seal?.publicKeyFingerprint ? `${seal.publicKeyFingerprint.slice(0, 12)}...${seal.publicKeyFingerprint.slice(-12)}` : 'Unavailable'],
    ['Signed fields', seal?.signedFields?.length ? seal.signedFields.length.toLocaleString() : 'Unavailable'],
  ];
  const sealPresentation = getSealStatusPresentation(sealStatus);
  const SealStatusIcon = sealPresentation.Icon;
  const showReplay = Boolean(certificate.includeEditHistory && replayToken);
  const environmentRows = getEnvironmentRows(certificate.environmentConfig);
  const localTimeZoneLabel = getLocalTimeZoneLabel();
  const reviewSignals: WritingAnomalyFlag[] = getReviewSignals(certificate.anomalyFlags);

  useEffect(() => {
    if (!hasFinalTextVisualization || !finalTextVisualizationRef.current) {
      setFinalTextCanExpand(false);
      return;
    }

    const element = finalTextVisualizationRef.current;
    const measure = () => {
      const styles = window.getComputedStyle(element);
      const lineHeight = Number.parseFloat(styles.lineHeight) || 28;
      const verticalPadding =
        (Number.parseFloat(styles.paddingTop) || 0) + (Number.parseFloat(styles.paddingBottom) || 0);
      const collapsedHeight = lineHeight * FINAL_TEXT_PREVIEW_ROWS + verticalPadding;
      setFinalTextCanExpand(element.scrollHeight > collapsedHeight + 1);
    };

    measure();

    if (typeof ResizeObserver === 'undefined') return;

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [hasFinalTextVisualization, finalTextSourceCharacterCount]);

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-4 p-4 sm:p-5">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <div className="min-w-0 flex-1">
              <div className="flex items-start gap-3">
                <Award className="mt-1 h-6 w-6 shrink-0 text-accent" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h1 className="break-words text-2xl font-semibold tracking-normal">{certificate.title}</h1>
                  </div>
                  {certificate.signerName && (
                    <p className="mt-1 text-sm text-muted-foreground">By: {certificate.signerName}</p>
                  )}
                  <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                    <Calendar className="h-4 w-4" />
                    Generated {format(new Date(certificate.generatedAt), 'MMMM dd, yyyy')}
                  </p>
                </div>
              </div>
            </div>
          </div>

          <div
            id="certificate-seal"
            tabIndex={-1}
            className={`scroll-mt-24 rounded-lg border p-3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${sealPresentation.containerClass}`}
          >
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex min-w-0 items-start gap-3">
                <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${sealPresentation.iconClass}`}>
                  <SealStatusIcon className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-sm font-semibold">Certificate seal</p>
                    <Badge
                      variant="outline"
                      className={`px-2 py-0.5 text-xs ${sealPresentation.badgeClass}`}
                    >
                      {getSealStatusLabel(sealStatus)}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">{sealPresentation.message}</p>
                </div>
              </div>
            </div>

            <Collapsible open={sealDetailsOpen} onOpenChange={setSealDetailsOpen} className="mt-3">
              <CollapsibleTrigger asChild>
                <button
                  type="button"
                  className="inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground/80 transition hover:bg-background/70 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  aria-label={sealDetailsOpen ? 'Hide certificate seal details' : 'Show certificate seal details'}
                >
                  {sealDetailsOpen ? 'Less seal details' : 'More seal details'}
                  <ChevronDown className={`h-3.5 w-3.5 transition-transform ${sealDetailsOpen ? 'rotate-180' : ''}`} />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-2 pt-2 text-xs sm:text-sm">
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                  {sealEvidenceRows.map(([label, value]) => (
                    <div key={label} className="rounded-md bg-background/70 px-3 py-2">
                      <p className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</p>
                      <p className="mt-1 break-words font-mono text-[11px] text-foreground">{value}</p>
                    </div>
                  ))}
                </div>
                <p className="font-medium">Certificate integrity</p>
                <p>
                  This certificate was checked against the Humanly integrity seal for the protected certificate record, including
                  the writing metrics, document identity, generated timestamp, and current display options.
                </p>
                {integrityMessage && (
                  <p className="text-muted-foreground">{integrityMessage}</p>
                )}
                <p className="text-muted-foreground">
                  The seal verifies the certificate record shown here, including the signed fields listed above. It does not make
                  claims about off-platform behavior.
                </p>
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-3">
          <CardTitle className={SECTION_TITLE_CLASS}>Authorship Statistics</CardTitle>
          <CardDescription>
            Final text composition, writing length, and active writing time.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">

            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium">Final text composition</p>
                <p className="text-xs text-muted-foreground">
                  {finalTextPercentages.total.toLocaleString()} final-text characters
                </p>
              </div>
              <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                Typed is final text kept from keyboard input. Pasted is final text kept from clipboard insertion.
                AI-assisted is final text kept from Humanly AI edits or inserted AI output.
              </p>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-secondary">
                {finalTextPercentages.typed > 0 && (
                  <div style={{ width: `${finalTextPercentages.typed}%`, backgroundColor: COMPOSITION_COLORS.typed }} />
                )}
                {finalTextPercentages.pasted > 0 && (
                  <div style={{ width: `${finalTextPercentages.pasted}%`, backgroundColor: COMPOSITION_COLORS.pasted }} />
                )}
                {finalTextPercentages.aiAssisted > 0 && (
                  <div style={{ width: `${finalTextPercentages.aiAssisted}%`, backgroundColor: COMPOSITION_COLORS.aiAssisted }} />
                )}
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COMPOSITION_COLORS.typed }} />
                  <span className="text-muted-foreground">Typed</span>
                  <span className="font-medium">
                    {formatCompositionLabel(finalTextPercentages.typed, finalTextComposition.typedCharacters)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COMPOSITION_COLORS.pasted }} />
                  <span className="text-muted-foreground">Pasted</span>
                  <span className="font-medium">
                    {formatCompositionLabel(finalTextPercentages.pasted, finalTextComposition.pastedCharacters)}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: COMPOSITION_COLORS.aiAssisted }} />
                  <span className="text-muted-foreground">AI-assisted</span>
                  <span className="font-medium">
                    {formatCompositionLabel(finalTextPercentages.aiAssisted, finalTextComposition.aiAssistedCharacters)}
                  </span>
                </div>
              </div>

              {hasFinalTextVisualization && (
                <div className="mt-4 border-t border-border/60 pt-4">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                    <p className="text-sm font-medium">Final text visualization</p>
                    <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm border border-border/50" style={{ backgroundColor: COMPOSITION_HIGHLIGHT_COLORS.typed }} />
                        Typed
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm border border-border/50" style={{ backgroundColor: COMPOSITION_HIGHLIGHT_COLORS.pasted }} />
                        Pasted
                      </span>
                      <span className="inline-flex items-center gap-1.5">
                        <span className="h-3 w-3 rounded-sm border border-border/50" style={{ backgroundColor: COMPOSITION_HIGHLIGHT_COLORS.aiAssisted }} />
                        AI-assisted
                      </span>
                    </div>
                  </div>
                  <div className="relative mt-3">
                    <div
                      ref={finalTextVisualizationRef}
                      className="whitespace-pre-wrap rounded-md border border-border/50 bg-background/45 p-3 text-sm leading-7 text-foreground"
                      style={{
                        maxHeight: finalTextExpanded ? '18rem' : `${FINAL_TEXT_PREVIEW_ROWS * 1.75 + 1.5}rem`,
                        overflow: finalTextExpanded ? 'auto' : 'hidden',
                        paddingBottom: finalTextCanExpand && !finalTextExpanded ? '3.25rem' : undefined,
                      }}
                    >
                      {finalTextSourceSpans.map((span, index) => (
                        <span
                          key={`${span.source}-${index}`}
                          className="rounded px-0.5"
                          style={{
                            backgroundColor: getSourceSpanColor(span.source),
                            WebkitBoxDecorationBreak: 'clone',
                            boxDecorationBreak: 'clone',
                          }}
                        >
                          {span.text}
                        </span>
                      ))}
                    </div>
                    {finalTextCanExpand && !finalTextExpanded && (
                      <div className="pointer-events-none absolute inset-x-px bottom-px flex h-24 items-end justify-center rounded-b-md bg-gradient-to-b from-background/0 via-background/80 to-background pb-3 backdrop-blur-[1.5px]">
                        <button
                          type="button"
                          className="pointer-events-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground/85 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                          onClick={() => setFinalTextExpanded(true)}
                        >
                          See details
                          <ChevronDown className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                  {finalTextCanExpand && finalTextExpanded && (
                    <button
                      type="button"
                      className="mx-auto mt-2 inline-flex items-center gap-1 rounded-full px-2 py-1 text-xs font-medium text-muted-foreground/80 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      onClick={() => setFinalTextExpanded(false)}
                    >
                      See less
                      <ChevronDown className="h-3.5 w-3.5 rotate-180" />
                    </button>
                  )}
                </div>
              )}
            </div>

            <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
              {!detailsOpen && (
                <CollapsibleTrigger asChild>
                  <button
                    type="button"
                    aria-label="Show more authorship details"
                    className="mx-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-muted-foreground/70 transition hover:bg-muted/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    See more
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </CollapsibleTrigger>
              )}
              <CollapsibleContent className="space-y-4 pt-3">
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-lg border border-border/60 bg-muted/35 p-3">
                    <div className="flex items-center gap-1">
                      <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Final Text</p>
                    </div>
                    <p className="mt-1 text-2xl font-semibold">{finalTextPercentages.total.toLocaleString()}</p>
                    <p className="mt-1 text-xs text-muted-foreground">characters</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/35 p-3">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                      <p className="text-xs text-muted-foreground">Writing Time</p>
                    </div>
                    <p className="mt-1 text-2xl font-semibold">{formatCompactDuration(certificate.editingTimeSeconds)}</p>
                    <p className="mt-1 text-xs text-muted-foreground">active writing window</p>
                  </div>
                </div>

                {processInputVolume && (
                  <div className="rounded-lg border border-border/60 bg-muted/20 p-3">
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                      <div>
                        <p className="text-sm font-medium">Process input volume</p>
                        <p className="text-xs text-muted-foreground">
                          Characters added during the session, including text later deleted or overwritten.
                        </p>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {processInputPercentages?.total.toLocaleString()} process characters
                      </p>
                    </div>
                    <div className="mt-3 grid gap-2 sm:grid-cols-3">
                      <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                        <p className="text-xs text-muted-foreground">Typed during process</p>
                        <p className="mt-1 text-xl font-semibold">{processInputVolume.typedCharacters.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                        <p className="text-xs text-muted-foreground">Pasted during process</p>
                        <p className="mt-1 text-xl font-semibold">{processInputVolume.pastedCharacters.toLocaleString()}</p>
                      </div>
                      <div className="rounded-lg border border-border/50 bg-background/60 p-3">
                        <p className="text-xs text-muted-foreground">AI-assisted during process</p>
                        <p className="mt-1 text-xl font-semibold">{processInputVolume.aiAssistedCharacters.toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                )}

                {isLoadingAiStats ? (
                  <div className="flex items-center justify-center rounded-lg border border-border/60 bg-muted/25 py-6">
                    <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading AI details...</span>
                  </div>
                ) : aiStats ? (
                  <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
                    <div className="space-y-3">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <Wand2 className="h-4 w-4 text-[#b9774f]" />
                        AI improvement details
                      </p>
                      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                        <div className="rounded-lg border border-border/60 bg-muted/35 p-3 text-center">
                          <p className="text-xs text-muted-foreground">Grammar</p>
                          <p className="text-xl font-semibold">{aiStats.selectionActions.grammarFixes}</p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-muted/35 p-3 text-center">
                          <p className="text-xs text-muted-foreground">Improve</p>
                          <p className="text-xl font-semibold">{aiStats.selectionActions.improveWriting}</p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-muted/35 p-3 text-center">
                          <p className="text-xs text-muted-foreground">Simplify</p>
                          <p className="text-xl font-semibold">{aiStats.selectionActions.simplify}</p>
                        </div>
                        <div className="rounded-lg border border-border/60 bg-muted/35 p-3 text-center">
                          <p className="text-xs text-muted-foreground">Formal</p>
                          <p className="text-xl font-semibold">{aiStats.selectionActions.makeFormal}</p>
                        </div>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {textImprovementTotal} total · {aiStats.selectionActions.accepted} accepted · {aiStats.selectionActions.rejected} discarded
                        {textImprovementTotal > 0 ? ` · ${aiStats.selectionActions.acceptanceRate.toFixed(0)}% acceptance` : ''}
                      </p>
                    </div>

                    <div className="rounded-lg border border-border/70 bg-muted/25 p-4">
                      <p className="flex items-center gap-2 text-sm font-medium">
                        <MessageSquare className="h-4 w-4 text-[#b9774f]" />
                        Agent chat details
                      </p>
                      <p className="mt-3 text-3xl font-semibold">{aiChatTotal}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        Chat questions asked in this document.
                      </p>
                    </div>
                  </div>
                ) : (
                  <p className="rounded-lg border border-border/60 bg-muted/25 py-4 text-center text-sm text-muted-foreground">
                    No AI statistics available.
                  </p>
                )}
                {detailsOpen && (
                  <CollapsibleTrigger asChild>
                    <button
                      type="button"
                      aria-label="Hide more authorship details"
                      className="mx-auto inline-flex items-center gap-1 rounded-full px-2 py-1 text-sm font-medium text-muted-foreground/70 transition hover:bg-muted/30 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      See less
                      <ChevronDown className="h-4 w-4 rotate-180" />
                    </button>
                  </CollapsibleTrigger>
                )}
              </CollapsibleContent>
            </Collapsible>
        </CardContent>
      </Card>

      {showReplay && (
        <Card>
          <Collapsible open={replayOpen} onOpenChange={setReplayOpen}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <CardTitle className={SECTION_TITLE_CLASS}>Replay</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">
                    Watch how this certificate was created from recorded edit history.
                  </CardDescription>
                </div>
                <CollapsibleTrigger asChild>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="shrink-0 gap-1"
                    aria-label={replayOpen ? 'Hide replay section' : 'Show replay section'}
                  >
                    {replayOpen ? 'Hide' : 'Show'}
                    <ChevronDown className={`h-4 w-4 transition-transform ${replayOpen ? 'rotate-180' : ''}`} />
                  </Button>
                </CollapsibleTrigger>
              </div>
            </CardHeader>
            <CollapsibleContent>
              <CardContent>
                <DocumentReplay token={replayToken!} accessCode={replayAccessCode} />
              </CardContent>
            </CollapsibleContent>
          </Collapsible>
        </Card>
      )}

      <Card>
        <Collapsible open={behaviorReviewOpen} onOpenChange={setBehaviorReviewOpen}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className={SECTION_TITLE_CLASS}>Anomaly Behavior Review</CardTitle>
                <CardDescription>
                  Review write-time signals that may need attention. These are evidence for review, not automatic verdicts.
                </CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1"
                  aria-label={
                    behaviorReviewOpen
                      ? 'Hide anomaly behavior review section'
                      : 'Show anomaly behavior review section'
                  }
                >
                  {behaviorReviewOpen ? 'Hide' : 'Show'}
                  <ChevronDown className={`h-4 w-4 transition-transform ${behaviorReviewOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent>
              {reviewSignals.length === 0 ? (
                <div className="rounded-lg border border-border/60 bg-muted/25 p-4 text-sm text-muted-foreground">
                  No recorded write-time review signals were detected before this certificate was generated.
                </div>
              ) : (
                <div className="grid gap-3 md:grid-cols-2">
                  {reviewSignals.map((flag) => (
                    <div key={flag.code} className="rounded-lg border border-border/70 bg-muted/20 p-4">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge
                          variant="outline"
                          className={`capitalize ${getFlagSeverityClass(flag.severity)}`}
                        >
                          {flag.severity}
                        </Badge>
                        <p className="font-medium">{flag.label}</p>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{flag.description}</p>
                      {getVisibleEvidenceEntries(flag).length > 0 && (
                        <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2">
                          {getVisibleEvidenceEntries(flag).map(([key, value]) => (
                            <div key={key} className="rounded-md bg-background/70 px-2 py-1.5">
                              <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
                                {formatEvidenceKey(key)}
                              </p>
                              <p className="mt-0.5 break-words font-medium">{formatEvidenceValue(key, value)}</p>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

      <Card>
        <Collapsible open={environmentOpen} onOpenChange={setEnvironmentOpen}>
          <CardHeader className="pb-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <CardTitle className={SECTION_TITLE_CLASS}>Environment</CardTitle>
                <CardDescription>The writing policy active when this certificate was created.</CardDescription>
              </div>
              <CollapsibleTrigger asChild>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="shrink-0 gap-1"
                  aria-label={environmentOpen ? 'Hide environment section' : 'Show environment section'}
                >
                  {environmentOpen ? 'Hide' : 'Show'}
                  <ChevronDown className={`h-4 w-4 transition-transform ${environmentOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
            </div>
          </CardHeader>
          <CollapsibleContent>
            <CardContent className="space-y-3">
              <p className="text-xs text-muted-foreground">
                Times shown in your local timezone: {localTimeZoneLabel}
              </p>
              {certificate.environmentConfig && (
                <div className="flex justify-end">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="w-fit"
                      >
                        <Download className="mr-2 h-4 w-4" />
                        Download Config
                        <ChevronDown className="ml-1 h-3.5 w-3.5" />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem onClick={() => downloadEnvironmentConfig(certificate.id, certificate.environmentConfig, 'json')}>
                        Download as JSON
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={() => downloadEnvironmentConfig(certificate.id, certificate.environmentConfig, 'yaml')}>
                        Download as YAML
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              )}
              {environmentRows.length > 0 ? (
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {environmentRows.map(([label, value]) => (
                    <div key={label} className="rounded-lg border border-border/60 bg-muted/25 p-3">
                      <p className="text-xs text-muted-foreground">{label}</p>
                      <p className="mt-1 break-words text-sm font-medium">{value}</p>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="rounded-lg border border-border/60 bg-muted/25 p-4 text-sm text-muted-foreground">
                  No environment configuration is stored for this certificate.
                </p>
              )}
            </CardContent>
          </CollapsibleContent>
        </Collapsible>
      </Card>

    </div>
  );
}

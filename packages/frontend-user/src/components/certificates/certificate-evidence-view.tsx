'use client';

import { useState } from 'react';
import {
  Activity,
  Award,
  Calendar,
  ChevronDown,
  Clock,
  Download,
  FileText,
  MessageSquare,
  Settings,
  Wand2,
} from 'lucide-react';
import { format } from 'date-fns';
import {
  formatWritingAiAccess,
  normalizeCopyPastePolicy,
  type AIAuthorshipStats,
  type CertificateSeal,
  type CertificateSealStatus,
  type CertificateType,
  type WritingEnvironmentConfig,
} from '@humanly/shared';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Separator } from '@/components/ui/separator';
import { DocumentReplay } from '@/components/certificates/document-replay';

export interface CertificateEvidenceRecord {
  id: string;
  documentId?: string;
  title: string;
  certificateType: CertificateType | string;
  generatedAt: string | Date;
  totalCharacters: number;
  typedCharacters: number;
  pastedCharacters: number;
  totalEvents: number;
  typingEvents: number;
  pasteEvents: number;
  editingTimeSeconds: number;
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
  if (status === 'valid') return 'Seal verified';
  if (status === 'legacy_valid') return 'Legacy signature';
  if (status === 'invalid') return 'Seal mismatch';
  return 'Seal unavailable';
}

function formatPercentage(value: number) {
  if (!Number.isFinite(value)) return '0%';
  return `${Math.round(value)}%`;
}

function formatDuration(seconds: number) {
  const safeSeconds = Math.max(0, Math.round(seconds || 0));
  if (safeSeconds < 60) return `${safeSeconds}s`;

  const minutes = Math.round(safeSeconds / 60);
  if (minutes < 60) return `${minutes} min`;

  const hours = Math.floor(minutes / 60);
  const remainder = minutes % 60;
  return remainder > 0 ? `${hours}h ${remainder}m` : `${hours}h`;
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

function formatTimeWindow(config: WritingEnvironmentConfig) {
  const limitSeconds = config.time?.timeLimitSeconds;
  if (limitSeconds) return formatDuration(limitSeconds);

  if (config.time?.startTime || config.time?.endTime) {
    return [config.time.startTime, config.time.endTime].filter(Boolean).join(' - ');
  }

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

  return [
    ['Preset', formatPreset(config.preset)],
    ['Task type', config.taskType === 'admin_assigned' ? 'Assigned task' : 'Personal writing'],
    ['AI access', formatWritingAiAccess(config.aiAccess)],
    ['AI model', config.allowedModels?.length ? config.allowedModels.join(', ') : 'No fixed model'],
    ['AI limit', formatUsageLimit(config)],
    ['Copy / paste', normalizeCopyPastePolicy(config.copyPastePolicy) === 'blocked' ? 'Blocked' : 'Allowed'],
    ['Time limit', formatTimeWindow(config)],
    ['Character limit', formatCharacterLimit(config)],
    ['Submission mode', config.submission?.mode === 'single' ? 'Single submission' : 'Multiple submissions'],
    ['Traceability', formatTraceability(config)],
  ];
}

function downloadEnvironmentConfig(certificateId: string, config?: WritingEnvironmentConfig | null) {
  if (!config || typeof window === 'undefined') return;

  const blob = new Blob([JSON.stringify(config, null, 2)], { type: 'application/json' });
  const url = window.URL.createObjectURL(blob);
  const anchor = window.document.createElement('a');
  anchor.href = url;
  anchor.download = `humanly-environment-${certificateId}.json`;
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
  const totalCharactersFromSources = certificate.typedCharacters + certificate.pastedCharacters;
  const typedCharacterPercentage = totalCharactersFromSources > 0
    ? (certificate.typedCharacters / totalCharactersFromSources) * 100
    : 0;
  const pastedCharacterPercentage = totalCharactersFromSources > 0
    ? (certificate.pastedCharacters / totalCharactersFromSources) * 100
    : 0;
  const textImprovementTotal = aiStats?.selectionActions.total || 0;
  const aiChatTotal = aiStats?.aiQuestions.total || 0;
  const compositionEventTotal = certificate.typingEvents + certificate.pasteEvents + textImprovementTotal;
  const typedEventPercentage = compositionEventTotal > 0
    ? (certificate.typingEvents / compositionEventTotal) * 100
    : 0;
  const pastedEventPercentage = compositionEventTotal > 0
    ? (certificate.pasteEvents / compositionEventTotal) * 100
    : 0;
  const aiImprovementEventPercentage = compositionEventTotal > 0
    ? (textImprovementTotal / compositionEventTotal) * 100
    : 0;
  const isFullyHumanCreated = certificate.pastedCharacters === 0 && certificate.typedCharacters > 0;
  const sealHashPreview = seal?.payloadHash
    ? `${seal.payloadHash.slice(0, 12)}...${seal.payloadHash.slice(-12)}`
    : null;
  const showReplay = Boolean(certificate.includeEditHistory && replayToken);
  const environmentRows = getEnvironmentRows(certificate.environmentConfig);

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
                    <Badge
                      variant="outline"
                      className="border-[#c8d4c8] bg-[#eef3ed] px-2 py-0.5 text-xs text-[#58715f]"
                    >
                      {getSealStatusLabel(sealStatus)}
                    </Badge>
                    {isFullyHumanCreated && (
                      <Badge
                        variant="outline"
                        className="border-[#c8d4c8] bg-[#eef3ed] px-2 py-0.5 text-xs text-[#58715f]"
                      >
                        100% Human Created
                      </Badge>
                    )}
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

          <Separator />

          <div className="space-y-3">
            <div>
              <h2 className="text-lg font-semibold tracking-normal">Authorship Statistics</h2>
              <p className="text-sm text-muted-foreground">
                Write-time composition, event counts, and in-platform AI activity.
              </p>
            </div>

            <div className="rounded-lg border border-border/70 bg-muted/20 p-3">
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm font-medium">Typed / pasted / AI improvement composition</p>
                <p className="text-xs text-muted-foreground">
                  {compositionEventTotal.toLocaleString()} composition events
                </p>
              </div>
              <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-secondary">
                <div className="bg-[#6fa8dc]" style={{ width: `${typedEventPercentage}%` }} />
                <div className="bg-[#f4b266]" style={{ width: `${pastedEventPercentage}%` }} />
                <div className="bg-[#a895d3]" style={{ width: `${aiImprovementEventPercentage}%` }} />
              </div>
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-3">
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#6fa8dc]" />
                  <span className="text-muted-foreground">Typed</span>
                  <span className="font-medium">{formatPercentage(typedEventPercentage)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#f4b266]" />
                  <span className="text-muted-foreground">Pasted</span>
                  <span className="font-medium">{formatPercentage(pastedEventPercentage)}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#a895d3]" />
                  <span className="text-muted-foreground">AI improvements</span>
                  <span className="font-medium">{formatPercentage(aiImprovementEventPercentage)}</span>
                </div>
              </div>
            </div>

            <div className="grid gap-2 sm:grid-cols-3">
              <div className="rounded-lg border border-border/60 bg-muted/35 p-3">
                <div className="flex items-center gap-1">
                  <Activity className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Events</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{certificate.totalEvents.toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {certificate.typingEvents.toLocaleString()} typed · {certificate.pasteEvents.toLocaleString()} pasted · {textImprovementTotal.toLocaleString()} AI improvements
                </p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/35 p-3">
                <div className="flex items-center gap-1">
                  <FileText className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Final Text</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{certificate.totalCharacters.toLocaleString()}</p>
                <p className="mt-1 text-xs text-muted-foreground">characters</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/35 p-3">
                <div className="flex items-center gap-1">
                  <Clock className="h-3.5 w-3.5 text-muted-foreground" />
                  <p className="text-xs text-muted-foreground">Writing Time</p>
                </div>
                <p className="mt-1 text-2xl font-semibold">{formatDuration(certificate.editingTimeSeconds)}</p>
                <p className="mt-1 text-xs text-muted-foreground">active writing window</p>
              </div>
            </div>

            <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
              <CollapsibleTrigger asChild>
                <Button type="button" variant="outline" size="sm" className="w-full justify-between">
                  Check more
                  <ChevronDown className={`h-4 w-4 transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent className="space-y-4 pt-3">
                <div className="grid gap-2 sm:grid-cols-3">
                  <div className="rounded-lg border border-border/60 bg-muted/25 p-3">
                    <p className="text-xs text-muted-foreground">Typed Characters</p>
                    <p className="mt-1 text-xl font-semibold">{certificate.typedCharacters.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/25 p-3">
                    <p className="text-xs text-muted-foreground">Pasted Characters</p>
                    <p className="mt-1 text-xl font-semibold">{certificate.pastedCharacters.toLocaleString()}</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-muted/25 p-3">
                    <p className="text-xs text-muted-foreground">AI Chat</p>
                    <p className="mt-1 text-xl font-semibold">{aiChatTotal.toLocaleString()}</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="text-muted-foreground">Character composition</span>
                    <span className="font-medium">
                      {certificate.typedCharacters.toLocaleString()} typed · {certificate.pastedCharacters.toLocaleString()} pasted
                    </span>
                  </div>
                  <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
                    <div className="bg-primary" style={{ width: `${typedCharacterPercentage}%` }} />
                    <div className="bg-[#b9774f]" style={{ width: `${pastedCharacterPercentage}%` }} />
                  </div>
                </div>

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
              </CollapsibleContent>
            </Collapsible>
          </div>
        </CardContent>
      </Card>

      {showReplay && (
        <Card>
          <CardHeader className="pb-3 sm:pb-6">
            <CardTitle className="text-xl sm:text-2xl">Replay</CardTitle>
            <CardDescription className="text-xs sm:text-sm">
              Watch how this certificate was created from recorded edit history.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DocumentReplay token={replayToken!} accessCode={replayAccessCode} />
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex items-start gap-2">
              <Settings className="mt-0.5 h-5 w-5 text-[#58715f]" />
              <div>
                <CardTitle className="text-lg">Environment</CardTitle>
                <CardDescription>The writing policy active when this certificate was created.</CardDescription>
              </div>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="w-fit"
              disabled={!certificate.environmentConfig}
              onClick={() => downloadEnvironmentConfig(certificate.id, certificate.environmentConfig)}
            >
              <Download className="mr-2 h-4 w-4" />
              Download Config
            </Button>
          </div>
        </CardHeader>
        <CardContent>
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
      </Card>

      <Card className="bg-muted/50">
        <CardHeader className="pb-3 sm:pb-6">
          <CardTitle className="text-base sm:text-lg">Certificate integrity</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-xs sm:text-sm">
          <p>
            This certificate was checked against the Humanly server-issued integrity seal for the protected certificate
            record, including the writing metrics, document identity, generated timestamp, and current display options.
          </p>
          {sealHashPreview && (
            <p className="font-mono text-[11px] text-muted-foreground sm:text-xs">
              Payload hash: {sealHashPreview}
            </p>
          )}
          {integrityMessage && (
            <p className="text-muted-foreground">{integrityMessage}</p>
          )}
          <p className="text-muted-foreground">
            The authorship statistics come from write-time tracking of typing, paste, replayed edit history, and in-platform
            AI assistance. The seal verifies the certificate record shown here; it does not make claims about off-platform behavior.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

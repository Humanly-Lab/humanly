'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  Award,
  ChevronDown,
  Clock,
  Download,
  FileText,
  HelpCircle,
  PanelLeftClose,
} from 'lucide-react';
import { LexicalEditor } from '@humanly/editor';
import {
  DEFAULT_WRITING_ENVIRONMENT_CONFIG,
  decodeWorkspaceSetupPreviewPayload,
  formatCompactDuration,
  getWorkspaceSetupPreviewHashValue,
  isWritingAiChatEnabled,
  isWritingAiEnabled,
  isWritingAiPolishEnabled,
  normalizeCopyPastePolicy,
  normalizeResourceAccessPolicy,
  normalizeWritingAiAccess,
  type WorkspaceSetupPreviewPayload,
  type WritingEnvironmentConfig,
} from '@humanly/shared';

import { AIAssistantButton, AIAssistantPanelPreview, AISelectionMenu } from '@/components/ai';
import PDFViewer from '@/components/pdf/PDFViewer';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from '@/components/ui/resizable';
import { formatDateTime } from '@/lib/utils';

const CANVAS = 'mx-auto w-full max-w-[2400px] px-3 sm:px-4';
const PREVIEW_DOCUMENT_ID = 'workspace-preview';
const PREVIEW_SELECTED_TEXT = 'This selected sentence shows where AI writing tools appear.';
const PREVIEW_EDITOR_INTRO = 'This preview mirrors the real writing workspace with a source panel, toolbar, editor surface, and optional AI assistant.';
const PREVIEW_EDITOR_TEXT = `After a short draft, ${PREVIEW_SELECTED_TEXT} The rest of this paragraph remains visible after the writer selects text.`;
const PREVIEW_EDITOR_CONTENT = {
  root: {
    children: [
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: PREVIEW_EDITOR_INTRO,
            type: 'text',
            version: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
      {
        children: [
          {
            detail: 0,
            format: 0,
            mode: 'normal',
            style: '',
            text: PREVIEW_EDITOR_TEXT,
            type: 'text',
            version: 1,
          },
        ],
        direction: 'ltr',
        format: '',
        indent: 0,
        type: 'paragraph',
        version: 1,
      },
    ],
    direction: 'ltr',
    format: '',
    indent: 0,
    type: 'root',
    version: 1,
  },
};

function normalizePreviewConfig(config: Partial<WritingEnvironmentConfig> | undefined): WritingEnvironmentConfig {
  const sourceConfig = config || {};
  return {
    ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
    ...sourceConfig,
    aiAccess: normalizeWritingAiAccess(sourceConfig.aiAccess),
    instructions: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.instructions,
      ...(sourceConfig.instructions || {}),
    },
    aiTokenBudget: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.aiTokenBudget,
      ...(sourceConfig.aiTokenBudget || {}),
    },
    aiUsageLimit: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.aiUsageLimit,
      ...(sourceConfig.aiUsageLimit || {}),
    },
    time: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.time,
      ...(sourceConfig.time || {}),
    },
    submission: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.submission,
      ...(sourceConfig.submission || {}),
    },
    traceability: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.traceability,
      ...(sourceConfig.traceability || {}),
    },
    resourceAccess: normalizeResourceAccessPolicy(sourceConfig.resourceAccess),
    copyPastePolicy: normalizeCopyPastePolicy(sourceConfig.copyPastePolicy),
  };
}

function formatCountdownDuration(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
}

function getPreviewPayload(): WorkspaceSetupPreviewPayload | null {
  if (typeof window === 'undefined') return null;

  const encodedPayload = getWorkspaceSetupPreviewHashValue(window.location.hash);
  if (!encodedPayload) return null;

  try {
    return decodeWorkspaceSetupPreviewPayload(encodedPayload);
  } catch {
    return null;
  }
}

function getTaskWindowLabel(payload: WorkspaceSetupPreviewPayload): string | null {
  const taskWindow = payload.taskWindow;
  if (!taskWindow || payload.mode !== 'admin') return null;
  if (!taskWindow.enabled) return 'Always available';
  if (taskWindow.startDate && taskWindow.endDate) {
    return `${formatDateTime(taskWindow.startDate)} - ${formatDateTime(taskWindow.endDate)}`;
  }
  if (taskWindow.startDate) return `Starts ${formatDateTime(taskWindow.startDate)}`;
  if (taskWindow.endDate) return `Deadline ${formatDateTime(taskWindow.endDate)}`;
  return 'Task window enabled';
}

function getCharacterBounds(config: WritingEnvironmentConfig, mode: WorkspaceSetupPreviewPayload['mode']) {
  const minimum = mode === 'admin' && config.submission.minCharacters
    ? Math.max(1, Math.floor(config.submission.minCharacters))
    : null;
  const maximum = config.submission.maxCharacters
    ? Math.max(1, Math.floor(config.submission.maxCharacters))
    : null;

  if (minimum !== null && maximum !== null) {
    return {
      hasBounds: true,
      label: `0/${maximum.toLocaleString()} characters · min ${minimum.toLocaleString()}`,
      title: `Required range: ${minimum.toLocaleString()}-${maximum.toLocaleString()} characters.`,
    };
  }

  if (minimum !== null) {
    return {
      hasBounds: true,
      label: `0 characters · min ${minimum.toLocaleString()}`,
      title: `Minimum: ${minimum.toLocaleString()} characters.`,
    };
  }

  if (maximum !== null) {
    return {
      hasBounds: true,
      label: `0/${maximum.toLocaleString()} characters`,
      title: `Maximum: ${maximum.toLocaleString()} characters.`,
    };
  }

  return {
    hasBounds: false,
    label: '0 characters',
    title: 'Character count includes letters, spaces, punctuation, and symbols.',
  };
}

function getTraceabilityLabel(config: WritingEnvironmentConfig): string {
  const enabled = [
    config.traceability.trackTyping ? 'Typing' : null,
    config.traceability.trackCopyPaste ? 'Clipboard' : null,
    config.traceability.trackFocusBlur ? 'Focus' : null,
    config.traceability.trackAiUsage ? 'AI' : null,
  ].filter(Boolean);

  return enabled.length ? enabled.join(', ') : 'Minimal';
}

function PdfPreviewPanel({
  label,
  previewUrl,
  viewOnly,
}: {
  label?: string;
  previewUrl?: string;
  viewOnly: boolean;
}) {
  return (
    <div className="flex h-full flex-col overflow-hidden border-r border-border/70 bg-card">
      <div className="flex items-center justify-between gap-3 border-b border-border/70 bg-muted/25 px-3 py-2">
        <div className="flex min-w-0 items-center gap-2 text-sm font-medium">
          <FileText className="h-4 w-4 text-muted-foreground" />
          <span className="truncate">{label || 'Instruction PDF'}</span>
        </div>
        <Badge variant="outline" className="rounded-md">
          {viewOnly ? 'View only' : 'Downloadable'}
        </Badge>
      </div>
      <div className="min-h-0 flex-1 bg-muted/20">
        {previewUrl ? (
          <PDFViewer
            documentId={PREVIEW_DOCUMENT_ID}
            previewUrl={previewUrl}
            viewOnly={viewOnly}
          />
        ) : (
          <div className="flex h-full items-start justify-center overflow-auto p-5">
            <div className="min-h-[72%] w-full max-w-[520px] rounded-sm bg-background p-8 shadow-lg">
              <div className="mb-6 h-5 w-2/3 rounded bg-muted" />
              <div className="space-y-3">
                <div className="h-3 rounded bg-muted/80" />
                <div className="h-3 rounded bg-muted/80" />
                <div className="h-3 w-5/6 rounded bg-muted/80" />
                <div className="h-3 w-4/6 rounded bg-muted/80" />
              </div>
              <div className="mt-8 space-y-3">
                <div className="h-3 rounded bg-muted/70" />
                <div className="h-3 w-11/12 rounded bg-muted/70" />
                <div className="h-3 w-3/4 rounded bg-muted/70" />
              </div>
              <p className="mt-8 text-xs text-muted-foreground">
                First page preview appears here when a local PDF is selected.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default function WorkspacePreviewPage() {
  const [payload, setPayload] = useState<WorkspaceSetupPreviewPayload | null>(null);
  const [parseFailed, setParseFailed] = useState(false);

  useEffect(() => {
    const parsedPayload = getPreviewPayload();
    setPayload(parsedPayload);
    setParseFailed(!parsedPayload);
  }, []);

  const config = useMemo(
    () => normalizePreviewConfig(payload?.config),
    [payload?.config],
  );

  if (parseFailed) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6">
        <div className="max-w-md text-center">
          <h1 className="text-lg font-semibold">Preview unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Return to the setup page and open the preview again.
          </p>
        </div>
      </div>
    );
  }

  if (!payload) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <p className="text-muted-foreground">Loading workspace preview...</p>
      </div>
    );
  }

  const title = payload.title?.trim() || (payload.mode === 'admin' ? 'Assigned writing task' : 'Untitled Document');
  const description = payload.description?.trim();
  const aiAccessMode = normalizeWritingAiAccess(config.aiAccess);
  const aiEnabled = isWritingAiEnabled(aiAccessMode);
  const aiPolishEnabled = isWritingAiPolishEnabled(aiAccessMode);
  const aiChatEnabled = isWritingAiChatEnabled(aiAccessMode);
  const hasPdf = !!payload.hasPdf;
  const isResourceViewOnly = normalizeResourceAccessPolicy(config.resourceAccess) === 'view-only';
  const characterBounds = getCharacterBounds(config, payload.mode);
  const timeLimitSeconds = config.time.timeLimitSeconds
    ? Math.max(1, Math.floor(config.time.timeLimitSeconds))
    : null;
  const taskWindowLabel = getTaskWindowLabel(payload);
  const lockedAiModel = payload.selectedAiModel || config.allowedModels?.[0] || config.customModels?.[0];
  const lockedAiBaseUrl = config.aiProvider?.baseUrl;

  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      <div className="shrink-0 border-b border-border/70 bg-card">
        <div className={`${CANVAS} py-3`}>
          <div className="flex items-center justify-between gap-4">
            <div className="flex min-w-0 items-center gap-3">
              <Button
                variant="ghost"
                size="icon"
                className="-ml-2 text-muted-foreground hover:bg-transparent hover:text-foreground"
                aria-label="Close preview"
                onClick={() => window.close()}
              >
                <ArrowLeft className="h-4 w-4" />
              </Button>

              <div className="min-w-0 flex-1">
                <div className="flex min-w-0 items-center gap-2">
                  <h1 className="min-w-0 truncate text-lg font-semibold tracking-normal" title={title}>
                    {title}
                  </h1>
                  <Badge variant="secondary" className="rounded-md">Preview</Badge>
                </div>
                {description ? (
                  <p className="mt-1 max-w-2xl truncate text-xs text-muted-foreground">{description}</p>
                ) : null}
                {taskWindowLabel ? (
                  <div className="mt-1 text-xs text-muted-foreground">{taskWindowLabel}</div>
                ) : null}
                {timeLimitSeconds ? (
                  <Badge variant="outline" className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md">
                    <Clock className="h-3.5 w-3.5 shrink-0" />
                    <span>Writing time left</span>
                    <span className="font-semibold">{formatCountdownDuration(timeLimitSeconds)}</span>
                  </Badge>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-end gap-2 sm:gap-3">
              {hasPdf ? (
                <Button variant="outline" size="sm" title="PDF" disabled>
                  <PanelLeftClose className="h-4 w-4" />
                  <span className="ml-1 hidden sm:inline">PDF</span>
                </Button>
              ) : null}

              {!characterBounds.hasBounds ? (
                <div className="hidden text-sm text-muted-foreground sm:block" title={characterBounds.title}>
                  {characterBounds.label}
                </div>
              ) : (
                <Badge variant="secondary" className="rounded-md" title={characterBounds.title}>
                  {characterBounds.label}
                </Badge>
              )}

              <Button
                type="button"
                variant="ghost"
                size="sm"
                title="View writing rules"
                className="gap-1 px-2 text-muted-foreground hover:text-foreground"
                disabled
              >
                <HelpCircle className="h-4 w-4" />
                <span className="hidden sm:inline">Rules</span>
              </Button>

              {aiChatEnabled ? (
                <AIAssistantButton
                  isOpen
                  onClick={() => undefined}
                />
              ) : null}

              <Button variant="outline" size="sm" disabled>
                <FileText className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">View Logs</span>
              </Button>

              {payload.mode === 'personal' ? (
                <Button variant="outline" size="sm" disabled>
                  <Download className="h-4 w-4 sm:mr-2" />
                  <span className="hidden sm:inline">Export Config</span>
                  <ChevronDown className="ml-1 h-3.5 w-3.5" />
                </Button>
              ) : null}

              <Button size="sm" disabled>
                <Award className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">{payload.mode === 'admin' ? 'Submit' : 'Generate Certificate'}</span>
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-hidden">
        <div className={`${CANVAS} h-full py-3`}>
          <ResizablePanelGroup direction="horizontal" className="h-full w-full overflow-hidden rounded-lg border border-border/80 bg-card">
            {hasPdf ? (
              <ResizablePanel defaultSize={38} minSize={22}>
                <PdfPreviewPanel
                  label={payload.pdfLabel}
                  previewUrl={payload.pdfPreviewUrl}
                  viewOnly={isResourceViewOnly}
                />
              </ResizablePanel>
            ) : null}

            {hasPdf ? <ResizableHandle withHandle /> : null}

            <ResizablePanel
              defaultSize={hasPdf ? (aiChatEnabled ? 37 : 62) : (aiChatEnabled ? 70 : 100)}
              minSize={30}
            >
              <div className="h-full overflow-auto bg-background">
                <div className={`${hasPdf || aiChatEnabled ? 'px-4 py-4' : 'px-6 py-6'} h-full`}>
                  {!hasPdf ? (
                    <div className="mb-4 rounded-lg border border-dashed border-border/80 bg-muted/30 p-4">
                      <h2 className="text-sm font-semibold">No PDF linked</h2>
                      <p className="text-sm text-muted-foreground">
                        This personal document does not have a source PDF.
                      </p>
                    </div>
                  ) : null}

                  <div className="relative h-full">
                    <LexicalEditor
                      documentId={PREVIEW_DOCUMENT_ID}
                      initialContent={PREVIEW_EDITOR_CONTENT}
                      initialSelectionText={aiEnabled ? PREVIEW_SELECTED_TEXT : undefined}
                      clearSelectionOnPopupClose
                      placeholder={hasPdf ? 'Start writing with your PDF open...' : 'Start typing your document...'}
                      editable
                      previewReadOnly
                      trackingEnabled={false}
                      copyPastePolicy={config.copyPastePolicy}
                      maxCharacters={config.submission.maxCharacters}
                      autoSaveEnabled={false}
                      className="h-full"
                      renderSelectionPopup={aiEnabled ? ({ selection, onClose, replaceSelection, cancelAIAction, undoLastAction }) => (
                        <AISelectionMenu
                          documentId={PREVIEW_DOCUMENT_ID}
                          selection={selection}
                          onClose={onClose}
                          replaceSelection={replaceSelection}
                          cancelAIAction={cancelAIAction}
                          undoLastAction={undoLastAction}
                          onAskAI={() => undefined}
                          taskManaged
                          allowPolishActions={aiPolishEnabled}
                          allowAskAI={aiChatEnabled}
                          previewOnly
                        />
                      ) : undefined}
                    />
                    <div className="pointer-events-none absolute bottom-3 right-3 rounded-md border border-border/70 bg-background/90 px-2 py-1 text-xs text-muted-foreground shadow-sm">
                      Tracking: {getTraceabilityLabel(config)}
                      {timeLimitSeconds ? ` / ${formatCompactDuration(timeLimitSeconds)} limit` : ''}
                    </div>
                  </div>
                </div>
              </div>
            </ResizablePanel>

            {aiChatEnabled ? (
              <>
                <ResizableHandle withHandle />
                <ResizablePanel defaultSize={25} minSize={18}>
                  <div className="h-full overflow-hidden border-l border-border/70 bg-card">
                    <AIAssistantPanelPreview
                      lockedModel={lockedAiModel}
                      lockedBaseUrl={lockedAiBaseUrl}
                    />
                  </div>
                </ResizablePanel>
              </>
            ) : null}
          </ResizablePanelGroup>
        </div>
      </div>
    </div>
  );
}

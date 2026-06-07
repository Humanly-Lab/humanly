'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  CheckCircle,
  FileText,
  Loader2,
  Upload,
  X,
} from 'lucide-react';
import {
  AI_CHAT_MAX_TOKENS_DEFAULT,
  AI_MAX_TOKENS_MAX,
  AI_MAX_TOKENS_MIN,
  AI_SHORTCUT_MAX_TOKENS_DEFAULT,
  SUBMISSION_MAX_CHARACTERS_MAX,
  WRITING_AI_ACCESS_OPTIONS,
  WRITING_AI_MODELS,
  WRITING_ENVIRONMENT_PRESETS,
  formatWritingAiAccess,
  isWritingAiChatEnabled,
  isWritingAiPolishEnabled,
  normalizeWritingAiAccess,
  normalizeCopyPastePolicy,
  validateWritingEnvironmentImportTemplate,
  type UserAISettings,
  type WritingAiAccess,
  type WritingAiProviderConfig,
  type WritingEnvironmentConfig,
  type WritingEnvironmentPreset,
} from '@humanly/shared';

import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/components/ui/use-toast';
import { useDocuments } from '@/hooks/use-documents';
import { apiClient } from '@/lib/api-client';
import {
  AI_PROVIDER_OPTIONS,
  TOGETHER_AI_BASE_URL,
  getProviderValueForBaseUrl,
  getWhitelist,
} from '@/lib/ai-models';

const DEFAULT_AI_BASE_URL = TOGETHER_AI_BASE_URL;
const USE_EXISTING_AI_KEY = '__use_existing__';
const IMPORT_ENVIRONMENT_VALUE = 'import_environment';

type EnvironmentSelection = WritingEnvironmentPreset | typeof IMPORT_ENVIRONMENT_VALUE;

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="space-y-1">
      <p className="humanly-eyebrow">{title}</p>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

const getPresetConfig = (preset: WritingEnvironmentPreset): WritingEnvironmentConfig => ({
  ...WRITING_ENVIRONMENT_PRESETS[preset],
  taskType: 'personal',
  aiAccess: normalizeWritingAiAccess(WRITING_ENVIRONMENT_PRESETS[preset].aiAccess),
  copyPastePolicy: normalizeCopyPastePolicy(WRITING_ENVIRONMENT_PRESETS[preset].copyPastePolicy),
});

const getTimeLimitMinutesValue = (seconds?: number): string => (
  String(Math.max(1, Math.round((seconds || 3600) / 60)))
);

const parseTimeLimitMinutes = (value: string, fallback = 1): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.max(1, Math.round(parsed));
};

const parseOptionalMaxCharacters = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;

  return Math.min(Math.floor(parsed), SUBMISSION_MAX_CHARACTERS_MAX);
};

const getAiProviderConfigForBaseUrl = (baseUrl: string): WritingAiProviderConfig | undefined => {
  const normalizedBaseUrl = baseUrl.trim();
  if (!normalizedBaseUrl) return undefined;
  return {
    provider: getProviderValueForBaseUrl(normalizedBaseUrl),
    baseUrl: normalizedBaseUrl,
  };
};

const normalizeImportedEnvironmentConfig = (value: unknown): WritingEnvironmentConfig => {
  const imported = validateWritingEnvironmentImportTemplate(value, 'personal');
  const aiAccess: WritingAiAccess = normalizeWritingAiAccess(imported.aiAccess);
  const copyPastePolicy = normalizeCopyPastePolicy(imported.copyPastePolicy);

  return {
    ...imported,
    preset: 'custom',
    taskType: 'personal',
    aiAccess,
    aiProvider: aiAccess === 'off' ? undefined : imported.aiProvider,
    allowedModels: aiAccess === 'off' ? [] : imported.allowedModels,
    customModels: aiAccess === 'off' ? [] : imported.customModels || [],
    submission: {
      ...imported.submission,
      minCharacters: undefined,
    },
    traceability: {
      ...imported.traceability,
      trackAiUsage: aiAccess !== 'off',
      trackCopyPaste: copyPastePolicy === 'allowed',
    },
    copyPastePolicy,
  };
};

export default function NewDocumentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { createDocument } = useDocuments();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [environmentSelection, setEnvironmentSelection] = useState<EnvironmentSelection>('default_writing');
  const [environmentConfig, setEnvironmentConfig] = useState<WritingEnvironmentConfig>(getPresetConfig('default_writing'));
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_AI_BASE_URL);
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [hasExistingAiKey, setHasExistingAiKey] = useState(false);
  const [maskedAiKey, setMaskedAiKey] = useState('');
  const [testedAiModels, setTestedAiModels] = useState<string[]>([]);
  const [timeLimitMinutesInput, setTimeLimitMinutesInput] = useState('60');
  const [environmentDialogOpen, setEnvironmentDialogOpen] = useState(false);
  const allowEnvironmentDialogCloseRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    const loadAiSettings = async () => {
      try {
        const response = await apiClient.get('/ai/settings');
        const settings: UserAISettings | null = response.data?.data || null;

        if (cancelled) return;

        if (!settings?.hasApiKey) {
          setHasExistingAiKey(false);
          setMaskedAiKey('');
          return;
        }

        setHasExistingAiKey(true);
        setMaskedAiKey(settings.maskedApiKey || '');
        setAiBaseUrl(settings.baseUrl || DEFAULT_AI_BASE_URL);
        setAiModel(settings.model || '');
        setEnvironmentConfig((current) => ({
          ...current,
          aiTokenBudget: {
            shortcutMaxTokens: settings.shortcutMaxTokens || AI_SHORTCUT_MAX_TOKENS_DEFAULT,
            chatMaxTokens: settings.chatMaxTokens || AI_CHAT_MAX_TOKENS_DEFAULT,
          },
        }));
      } catch {
        if (!cancelled) {
          setHasExistingAiKey(false);
          setMaskedAiKey('');
        }
      }
    };

    loadAiSettings();

    return () => {
      cancelled = true;
    };
  }, []);

  const aiModelOptions = useMemo(() => {
    const whitelist = getWhitelist(aiBaseUrl);
    let options: string[];

    if (testedAiModels.length) {
      options = testedAiModels;
    } else if (whitelist?.length) {
      options = whitelist;
    } else {
      options = WRITING_AI_MODELS.filter((model) => model !== 'Custom models');
    }

    return !whitelist?.length && aiModel && !options.includes(aiModel)
      ? [aiModel, ...options]
      : options;
  }, [aiBaseUrl, aiModel, testedAiModels]);

  const selectedAiModel = aiModel.trim();
  const shortcutTokensEnabled = isWritingAiPolishEnabled(environmentConfig.aiAccess);
  const chatTokensEnabled = isWritingAiChatEnabled(environmentConfig.aiAccess);
  const timeMode = environmentConfig.aiUsageLimit.mode === 'time_restricted' ? 'time_restricted' : 'unlimited';

  useEffect(() => {
    if (timeMode === 'time_restricted') {
      setTimeLimitMinutesInput(getTimeLimitMinutesValue(environmentConfig.time.timeLimitSeconds));
    }
  }, [timeMode, environmentConfig.time.timeLimitSeconds]);

  const markCustom = (updater: (current: WritingEnvironmentConfig) => WritingEnvironmentConfig) => {
    setEnvironmentSelection('custom');
    setEnvironmentConfig((current) => ({
      ...updater(current),
      preset: 'custom',
    }));
  };

  const syncAiModelFromEnvironment = (config: WritingEnvironmentConfig) => {
    if (config.aiAccess === 'off') {
      setAiModel('');
      return;
    }

    const firstAllowedModel = config.allowedModels[0] || '';
    setAiModel(firstAllowedModel);
  };

  const applyEnvironmentPreset = (preset: WritingEnvironmentPreset) => {
    const config = getPresetConfig(preset);
    setEnvironmentSelection(preset);
    setEnvironmentConfig(config);
    syncAiModelFromEnvironment(config);
  };

  const handleEnvironmentSelectionChange = (value: EnvironmentSelection) => {
    if (value === IMPORT_ENVIRONMENT_VALUE) {
      setEnvironmentSelection(value);
      setEnvironmentDialogOpen(false);
      return;
    }

    applyEnvironmentPreset(value);
    if (value === 'custom') {
      allowEnvironmentDialogCloseRef.current = false;
    }
    setEnvironmentDialogOpen(value === 'custom');
  };

  const handleEnvironmentImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (!file.name.toLowerCase().endsWith('.json')) {
      toast({
        title: 'Invalid environment file',
        description: 'Import Environment currently supports JSON files only.',
        variant: 'destructive',
      });
      event.target.value = '';
      return;
    }

    try {
      const parsed = JSON.parse(await file.text());
      const config = normalizeImportedEnvironmentConfig(parsed);
      if (config.aiProvider?.baseUrl) {
        setAiBaseUrl(config.aiProvider.baseUrl);
      }
      syncAiModelFromEnvironment(config);
      setEnvironmentSelection('custom');
      setEnvironmentConfig(config);
      toast({
        title: 'Environment imported',
        description: 'The JSON configuration was applied to this document.',
      });
    } catch (err: any) {
      toast({
        title: 'Invalid environment file',
        description: err.message || 'Unable to import the environment JSON file.',
        variant: 'destructive',
      });
    } finally {
      event.target.value = '';
    }
  };

  const setEnvironmentAiModel = (model: string) => {
    markCustom((current) => ({
      ...current,
      allowedModels: model ? [model] : [],
      customModels: [],
    }));
  };

  const updateAiBaseUrl = (nextBaseUrl: string, resetModel = false) => {
    setAiBaseUrl(nextBaseUrl);
    setTestedAiModels([]);
    markCustom((current) => ({
      ...current,
      aiProvider: getAiProviderConfigForBaseUrl(nextBaseUrl),
    }));

    if (resetModel) {
      const nextModel = getWhitelist(nextBaseUrl)?.[0] || '';
      setAiModel(nextModel);
      setEnvironmentAiModel(nextModel);
    }
  };

  const setAiTokenBudget = (patch: NonNullable<WritingEnvironmentConfig['aiTokenBudget']>) => {
    markCustom((current) => ({
      ...current,
      aiTokenBudget: {
        shortcutMaxTokens: current.aiTokenBudget?.shortcutMaxTokens || AI_SHORTCUT_MAX_TOKENS_DEFAULT,
        chatMaxTokens: current.aiTokenBudget?.chatMaxTokens || AI_CHAT_MAX_TOKENS_DEFAULT,
        ...patch,
      },
    }));
  };

  const setSubmissionMaximumCharacters = (value: string) => {
    const maxCharacters = parseOptionalMaxCharacters(value);
    markCustom((current) => ({
      ...current,
      submission: {
        ...current.submission,
        maxCharacters,
      },
    }));
  };

  const setAiAccess = (aiAccess: WritingAiAccess) => {
    const defaultModel = aiModel || aiModelOptions[0] || 'GPT-4.1';

    if (aiAccess !== 'off' && !aiModel) {
      setAiModel(defaultModel);
    }

    markCustom((current) => ({
      ...current,
      aiAccess,
      allowedModels: aiAccess === 'off'
        ? []
        : current.allowedModels.length
          ? current.allowedModels
          : [defaultModel],
      customModels: aiAccess === 'off' ? [] : current.customModels,
      traceability: {
        ...current.traceability,
        trackAiUsage: aiAccess !== 'off',
      },
    }));
  };

  const handlePdfSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.type !== 'application/pdf') {
      toast({ title: 'Error', description: 'Please select a PDF file', variant: 'destructive' });
      return;
    }

    if (file.size > 50 * 1024 * 1024) {
      toast({ title: 'Error', description: 'PDF must be smaller than 50MB', variant: 'destructive' });
      return;
    }

    setPdfFile(file);
    if (!title.trim()) {
      setTitle(file.name.replace(/\.pdf$/i, ''));
    }
  };

  const handleCustomEnvironmentDone = () => {
    allowEnvironmentDialogCloseRef.current = true;
    setEnvironmentDialogOpen(false);
  };

  const handleEnvironmentDialogOpenChange = (open: boolean) => {
    if (open) {
      allowEnvironmentDialogCloseRef.current = false;
      setEnvironmentDialogOpen(true);
      return;
    }

    if (
      environmentConfig.aiAccess !== 'off'
      && !allowEnvironmentDialogCloseRef.current
    ) {
      setAiAccess('off');
    }

    allowEnvironmentDialogCloseRef.current = false;
    setEnvironmentDialogOpen(false);
  };

  const handleCreateDocument = useCallback(async () => {
    if (!title.trim()) {
      toast({
        title: 'Error',
        description: 'Please enter a document title',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsCreating(true);
      let configToCreate: WritingEnvironmentConfig = {
        ...environmentConfig,
        taskType: 'personal',
        copyPastePolicy: normalizeCopyPastePolicy(environmentConfig.copyPastePolicy),
        instructions: {
          ...environmentConfig.instructions,
          hasInstructionPdf: !!pdfFile,
        },
        traceability: {
          ...environmentConfig.traceability,
          trackCopyPaste: normalizeCopyPastePolicy(environmentConfig.copyPastePolicy) === 'allowed',
        },
        submission: {
          ...environmentConfig.submission,
          minCharacters: undefined,
        },
      };

      if (configToCreate.aiUsageLimit.mode === 'time_restricted') {
        const minutes = parseTimeLimitMinutes(timeLimitMinutesInput, 1);
        configToCreate = {
          ...configToCreate,
          time: {
            ...configToCreate.time,
            timeLimitSeconds: minutes * 60,
          },
        };
      }

      if (environmentConfig.aiAccess !== 'off') {
        if (!aiApiKey.trim() && !hasExistingAiKey) {
          toast({
            title: 'AI key required',
            description: 'Enter an AI API key before creating an AI-enabled document.',
            variant: 'destructive',
          });
          return;
        }

        if (!selectedAiModel) {
          toast({
            title: 'AI model required',
            description: 'Select or enter the AI model for this writing environment.',
            variant: 'destructive',
          });
          return;
        }

        const baseUrlToSave = aiBaseUrl.trim();
        if (!baseUrlToSave) {
          toast({
            title: 'AI provider required',
            description: 'Select a provider or enter a custom base URL before creating an AI-enabled document.',
            variant: 'destructive',
          });
          return;
        }

        await apiClient.put('/ai/settings', {
          apiKey: aiApiKey.trim() || USE_EXISTING_AI_KEY,
          baseUrl: baseUrlToSave,
          model: selectedAiModel,
          shortcutMaxTokens: configToCreate.aiTokenBudget?.shortcutMaxTokens || AI_SHORTCUT_MAX_TOKENS_DEFAULT,
          chatMaxTokens: configToCreate.aiTokenBudget?.chatMaxTokens || AI_CHAT_MAX_TOKENS_DEFAULT,
        });

        configToCreate = {
          ...configToCreate,
          aiProvider: getAiProviderConfigForBaseUrl(baseUrlToSave),
          allowedModels: [selectedAiModel],
          customModels: [],
          traceability: {
            ...configToCreate.traceability,
            trackAiUsage: true,
          },
        };
      }

      const document = await createDocument(
        title,
        pdfFile || undefined,
        configToCreate,
        description
      );

      toast({
        title: 'Success',
        description: pdfFile ? 'Document created with linked PDF' : 'Document created successfully',
      });
      router.push(`/documents/${document.id}`);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to create document',
        variant: 'destructive',
      });
    } finally {
      setIsCreating(false);
    }
  }, [
    title,
    description,
    pdfFile,
    environmentConfig,
    timeLimitMinutesInput,
    aiApiKey,
    aiBaseUrl,
    hasExistingAiKey,
    selectedAiModel,
    createDocument,
    toast,
    router,
  ]);

  const isImportingEnvironment = environmentSelection === IMPORT_ENVIRONMENT_VALUE;
  const showCustomEnvironmentSummary = environmentSelection === 'custom';
  const customEnvironmentControls = (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className="space-y-4 rounded-lg border border-border/70 bg-card p-4 lg:col-span-2">
        <SectionHeading
          title="AI"
          description="Control whether this document can use assistant support."
        />

        <div className="humanly-field">
          <Label>AI</Label>
          <Select value={environmentConfig.aiAccess} onValueChange={(value) => setAiAccess(value as WritingAiAccess)}>
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

        {environmentConfig.aiAccess !== 'off' && (
          <div className="grid gap-4 rounded-lg border border-border/70 bg-muted/30 p-3">
            <div className="humanly-field">
              <Label htmlFor="ai-api-key">AI API Key</Label>
              <Input
                id="ai-api-key"
                type="password"
                value={aiApiKey}
                onChange={(event) => setAiApiKey(event.target.value)}
                placeholder={hasExistingAiKey ? `Current: ${maskedAiKey || 'saved key'}` : 'Enter API key'}
                disabled={isCreating}
              />
              {hasExistingAiKey && !aiApiKey && (
                <p className="text-xs text-muted-foreground">
                  Leave empty to use the saved key.
                </p>
              )}
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="humanly-field">
                <Label>Model</Label>
                <Select
                  value={aiModel}
                  onValueChange={(value) => {
                    setAiModel(value);
                    setEnvironmentAiModel(value);
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select model" />
                  </SelectTrigger>
                  <SelectContent>
                    {aiModelOptions.map((model) => (
                      <SelectItem key={model} value={model}>
                        {model}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="humanly-field">
                <Label>Provider</Label>
                <Select
                  value={getProviderValueForBaseUrl(aiBaseUrl)}
                  onValueChange={(value) => {
                    const provider = AI_PROVIDER_OPTIONS.find(option => option.value === value);
                    updateAiBaseUrl(provider?.baseUrl ?? '', true);
                  }}
                  disabled={isCreating}
                >
                  <SelectTrigger aria-label="AI provider">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDER_OPTIONS.map((provider) => (
                      <SelectItem key={provider.value} value={provider.value}>
                        {provider.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="humanly-field">
                <Label htmlFor="ai-shortcut-max-tokens">Shortcut Tokens</Label>
                <Input
                  id="ai-shortcut-max-tokens"
                  type="number"
                  min={AI_MAX_TOKENS_MIN}
                  max={AI_MAX_TOKENS_MAX}
                  value={shortcutTokensEnabled ? environmentConfig.aiTokenBudget?.shortcutMaxTokens || AI_SHORTCUT_MAX_TOKENS_DEFAULT : ''}
                  placeholder={shortcutTokensEnabled ? undefined : 'Not available in this mode'}
                  onChange={(event) => setAiTokenBudget({
                    shortcutMaxTokens: Number(event.target.value) || AI_SHORTCUT_MAX_TOKENS_DEFAULT,
                  })}
                  disabled={isCreating || !shortcutTokensEnabled}
                />
                <p className="text-xs text-muted-foreground">
                  {shortcutTokensEnabled
                    ? 'Shortcut actions and fallback answers.'
                    : 'Not available when AI access is chat only.'}
                </p>
              </div>

              <div className="humanly-field">
                <Label htmlFor="ai-chat-max-tokens">Chat Tokens</Label>
                <Input
                  id="ai-chat-max-tokens"
                  type="number"
                  min={AI_MAX_TOKENS_MIN}
                  max={AI_MAX_TOKENS_MAX}
                  value={chatTokensEnabled ? environmentConfig.aiTokenBudget?.chatMaxTokens || AI_CHAT_MAX_TOKENS_DEFAULT : ''}
                  placeholder={chatTokensEnabled ? undefined : 'Not available in this mode'}
                  onChange={(event) => setAiTokenBudget({
                    chatMaxTokens: Number(event.target.value) || AI_CHAT_MAX_TOKENS_DEFAULT,
                  })}
                  disabled={isCreating || !chatTokensEnabled}
                />
                <p className="text-xs text-muted-foreground">
                  {chatTokensEnabled
                    ? 'Chat and retrieval tool turns, per model call.'
                    : 'Not available when AI access is polish only.'}
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4 rounded-lg border border-border/70 bg-card p-4">
        <SectionHeading
          title="Writing Control"
          description="Set rules for editing behavior during writing."
        />

        <div className="humanly-field">
          <Label>Copy & Paste</Label>
          <Select
            value={normalizeCopyPastePolicy(environmentConfig.copyPastePolicy)}
            onValueChange={(value) => {
              markCustom((current) => ({
                ...current,
                copyPastePolicy: normalizeCopyPastePolicy(value),
              }));
            }}
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

        <div className="grid gap-3">
          <div className="humanly-field">
            <Label htmlFor="maximum-characters">Maximum Characters</Label>
            <Input
              id="maximum-characters"
              type="number"
              min={1}
              max={SUBMISSION_MAX_CHARACTERS_MAX}
              value={environmentConfig.submission.maxCharacters ?? ''}
              onChange={(event) => setSubmissionMaximumCharacters(event.target.value)}
              placeholder="No maximum"
              disabled={isCreating}
            />
          </div>

          <p className="text-xs text-muted-foreground">
            Optional cap for personal writing. Leave blank for no maximum length.
          </p>
        </div>
      </div>

      <div className="space-y-4 rounded-lg border border-border/70 bg-card p-4">
        <SectionHeading
          title="Time Limitation"
          description="Set whether the writing session should have a time limit."
        />

        <div className="humanly-field">
          <Label>Time</Label>
          <Select
            value={timeMode}
            onValueChange={(value) => {
              markCustom((current) => ({
                ...current,
                aiUsageLimit: {
                  ...current.aiUsageLimit,
                  mode: value === 'time_restricted' ? 'time_restricted' : 'unlimited',
                },
                time: {
                  ...current.time,
                  timeLimitSeconds: value === 'time_restricted'
                    ? current.time.timeLimitSeconds || 3600
                    : undefined,
                },
              }));
              if (value === 'time_restricted') {
                setTimeLimitMinutesInput(getTimeLimitMinutesValue(environmentConfig.time.timeLimitSeconds));
              }
            }}
          >
            <SelectTrigger aria-label="Time policy">
              <SelectValue placeholder="Time policy" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="unlimited">No limitations</SelectItem>
              <SelectItem value="time_restricted">Time limited</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {timeMode === 'time_restricted' && (
          <div className="humanly-field">
            <Label htmlFor="time-limit-minutes">Time Limit (minutes)</Label>
            <Input
              id="time-limit-minutes"
              type="number"
              min={1}
              value={timeLimitMinutesInput}
              disabled={isCreating}
              onChange={(event) => {
                const nextValue = event.target.value;
                setTimeLimitMinutesInput(nextValue);
                if (!nextValue) return;
                const minutes = parseTimeLimitMinutes(nextValue, 1);
                markCustom((current) => ({
                  ...current,
                  time: {
                    ...current.time,
                    timeLimitSeconds: minutes * 60,
                  },
                }));
              }}
              onBlur={() => {
                const minutes = parseTimeLimitMinutes(timeLimitMinutesInput, 1);
                setTimeLimitMinutesInput(String(minutes));
                markCustom((current) => ({
                  ...current,
                  time: {
                    ...current.time,
                    timeLimitSeconds: minutes * 60,
                  },
                }));
              }}
            />
          </div>
        )}
      </div>
    </div>
  );

  return (
    <div className="humanly-page">
      <div className="mb-4">
        <Button
          variant="ghost"
          size="sm"
          className="mb-3 -ml-2 h-auto px-2 py-1 text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={() => router.push('/documents')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Workspace
        </Button>
        <p className="humanly-eyebrow">Personal writing</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">Create Writing</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Create a personal writing document and configure its writing environment.
        </p>
      </div>

      <Card className="overflow-hidden">
        <CardHeader className="p-4 sm:p-5">
          <CardTitle>Document setup</CardTitle>
          <CardDescription>
            Set up the document details, AI access, and writing controls before you start.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4 px-4 pb-4 pt-0 sm:px-5 sm:pb-5 sm:pt-0 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.2fr)] xl:items-stretch">
          <section className="h-full space-y-3 rounded-lg border border-border/70 bg-background p-3">
            <SectionHeading
              title="Basic Information"
              description="Name the document and attach an optional source PDF for side-by-side writing."
            />

            <div className="humanly-field">
              <Label htmlFor="document-title">Document Name</Label>
              <Input
                id="document-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="My Writing Document"
                disabled={isCreating}
              />
            </div>

            <div className="humanly-field">
              <Label htmlFor="document-description">Description</Label>
              <Textarea
                id="document-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional context for this document..."
                disabled={isCreating}
              />
            </div>

            <div className="rounded-lg border border-dashed border-border/80 bg-muted/25 p-3">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Upload className="h-4 w-4 text-accent" />
                PDF
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Optional PDF source file for side-by-side writing.
              </p>
              <Input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="mt-2"
                onChange={handlePdfSelect}
                disabled={isCreating}
              />
              {pdfFile && (
                <div className="mt-3 flex items-center gap-3 rounded-lg border border-border/70 bg-background p-3">
                  <FileText className="h-5 w-5 shrink-0 text-accent" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium" title={pdfFile.name}>
                      {pdfFile.name}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {(pdfFile.size / 1024 / 1024).toFixed(2)} MB
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => {
                      setPdfFile(null);
                      if (fileInputRef.current) fileInputRef.current.value = '';
                    }}
                    disabled={isCreating}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>
          </section>

          <div className="h-full space-y-4 rounded-lg border border-border/70 bg-background p-3">
            <SectionHeading
              title="Environment"
              description="Choose a default, customize the modules below, or import a JSON configuration."
            />

            <div className="humanly-field">
              <Label>Environment</Label>
              <Select value={environmentSelection} onValueChange={(value) => handleEnvironmentSelectionChange(value as EnvironmentSelection)}>
                <SelectTrigger aria-label="Environment">
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default_writing">Default Environment</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                  <SelectItem value={IMPORT_ENVIRONMENT_VALUE}>Import Environment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {isImportingEnvironment && (
              <div className="rounded-lg border border-dashed border-border/80 bg-muted/25 p-3">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Upload className="h-4 w-4 text-accent" />
                  Import JSON Configuration
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload a JSON file that matches the writing environment configuration shape.
                </p>
                <Input
                  type="file"
                  accept="application/json,.json"
                  className="mt-2"
                  onChange={handleEnvironmentImport}
                  disabled={isCreating}
                />
              </div>
            )}

            {!showCustomEnvironmentSummary && !isImportingEnvironment && (
              <div className="rounded-lg border border-border/70 bg-muted/35 p-3">
                <div className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#6f8a78]" />
                  <div>
                    <p className="font-medium">Default Environment</p>
                    <p className="text-sm text-muted-foreground">
                      A simple personal writing setup with authorship tracking enabled and no AI assistant configured.
                    </p>
                  </div>
                </div>

                <div className="mt-3 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border border-border/60 bg-background p-2.5">
                    <p className="humanly-eyebrow">AI</p>
                    <p className="mt-1 text-sm font-medium">Off</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background p-2.5">
                    <p className="humanly-eyebrow">Writing</p>
                    <p className="mt-1 text-sm font-medium">Copy & paste allowed</p>
                  </div>
                  <div className="rounded-lg border border-border/60 bg-background p-2.5">
                    <p className="humanly-eyebrow">Time</p>
                    <p className="mt-1 text-sm font-medium">No limit</p>
                  </div>
                </div>

                <p className="mt-3 text-sm text-muted-foreground">
                  Choose Custom to configure AI access, copy-paste rules, or a time limit.
                </p>
              </div>
            )}

            {showCustomEnvironmentSummary && (
              <div className="rounded-lg border border-border/70 bg-muted/35 p-3">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="min-w-0 flex-1 space-y-4">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#6f8a78]" />
                      <div>
                        <p className="font-medium">Custom Environment</p>
                        <p className="text-sm text-muted-foreground">
                          Configure AI, copy-paste, character cap, and time limit in a separate dialog.
                        </p>
                      </div>
                    </div>

                    <div className="grid gap-3 sm:grid-cols-3">
                      <div className="rounded-lg border border-border/60 bg-background p-2.5">
                        <p className="humanly-eyebrow">AI</p>
                        <p className="mt-1 text-sm font-medium">
                          {formatWritingAiAccess(environmentConfig.aiAccess)}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background p-2.5">
                        <p className="humanly-eyebrow">Writing</p>
                        <p className="mt-1 text-sm font-medium">
                          {normalizeCopyPastePolicy(environmentConfig.copyPastePolicy) === 'blocked'
                            ? 'Paste blocked'
                            : 'Paste allowed'}
                        </p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-background p-2.5">
                        <p className="humanly-eyebrow">Time</p>
                        <p className="mt-1 text-sm font-medium">
                          {timeMode === 'time_restricted'
                            ? `${getTimeLimitMinutesValue(environmentConfig.time.timeLimitSeconds)} min`
                            : 'No limit'}
                        </p>
                      </div>
                    </div>
                  </div>

                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      allowEnvironmentDialogCloseRef.current = false;
                      setEnvironmentDialogOpen(true);
                    }}
                    disabled={isCreating}
                  >
                    Edit Settings
                  </Button>
                </div>
              </div>
            )}
          </div>
        </CardContent>
        <CardFooter className="mt-4 flex justify-end gap-3 border-t border-border/70 bg-muted/20 px-5 pb-5 pt-7 sm:pt-7">
          <Button variant="outline" onClick={() => router.push('/documents')} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreateDocument} disabled={isCreating}>
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isCreating ? 'Creating...' : 'Create Writing'}
          </Button>
        </CardFooter>
      </Card>

      <Dialog open={environmentDialogOpen} onOpenChange={handleEnvironmentDialogOpenChange}>
        <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Custom Environment</DialogTitle>
            <DialogDescription>
              Configure AI access, writing rules, character cap, and time limit before creating this document.
            </DialogDescription>
          </DialogHeader>

          {customEnvironmentControls}

          <DialogFooter>
            <Button
              type="button"
              onClick={handleCustomEnvironmentDone}
              disabled={isCreating}
            >
              Done
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

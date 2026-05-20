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
  XCircle,
} from 'lucide-react';
import {
  AI_CHAT_MAX_TOKENS_DEFAULT,
  AI_MAX_TOKENS_MAX,
  AI_MAX_TOKENS_MIN,
  AI_SHORTCUT_MAX_TOKENS_DEFAULT,
  SUBMISSION_MAX_CHARACTERS_MAX,
  SUBMISSION_MIN_CHARACTERS_MAX,
  WRITING_AI_MODELS,
  WRITING_ENVIRONMENT_PRESETS,
  normalizeCopyPastePolicy,
  type UserAISettings,
  type WritingAiAccess,
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
  CUSTOM_AI_PROVIDER_VALUE,
  TOGETHER_AI_BASE_URL,
  getProviderValueForBaseUrl,
  getWhitelist,
} from '@/lib/ai-models';

const DEFAULT_AI_BASE_URL = TOGETHER_AI_BASE_URL;
const CUSTOM_MODEL_VALUE = '__custom_model__';
const USE_EXISTING_AI_KEY = '__use_existing__';
const IMPORT_ENVIRONMENT_VALUE = 'import_environment';

type AiConnectionResult = {
  success: boolean;
  message: string;
};

type EnvironmentSelection = WritingEnvironmentPreset | typeof IMPORT_ENVIRONMENT_VALUE;

function SectionHeading({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div>
      <h3 className="font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

const getPresetConfig = (preset: WritingEnvironmentPreset): WritingEnvironmentConfig => ({
  ...WRITING_ENVIRONMENT_PRESETS[preset],
  taskType: 'personal',
  copyPastePolicy: normalizeCopyPastePolicy(WRITING_ENVIRONMENT_PRESETS[preset].copyPastePolicy),
});

const isRecord = (value: unknown): value is Record<string, unknown> => (
  !!value && typeof value === 'object' && !Array.isArray(value)
);

const normalizeAiAccessForForm = (value: unknown, fallback: WritingAiAccess): WritingAiAccess => (
  value === 'off' ? 'off' : value === 'full' || value === 'readonly' ? 'full' : fallback
);

const isPositiveNumber = (value: unknown): value is number => (
  typeof value === 'number' && Number.isFinite(value) && value > 0
);

const getTimeLimitMinutesValue = (seconds?: number): string => (
  String(Math.max(1, Math.round((seconds || 3600) / 60)))
);

const parseTimeLimitMinutes = (value: string, fallback = 1): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.max(1, Math.round(parsed));
};

const parseOptionalMinCharacters = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;

  return Math.min(Math.floor(parsed), SUBMISSION_MIN_CHARACTERS_MAX);
};

const parseOptionalMaxCharacters = (value: string): number | undefined => {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 1) return undefined;

  return Math.min(Math.floor(parsed), SUBMISSION_MAX_CHARACTERS_MAX);
};

const normalizeStringArray = (value: unknown, fallback: string[] = []) => (
  Array.isArray(value)
    ? value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
    : fallback
);

const normalizeImportedEnvironmentConfig = (value: unknown): WritingEnvironmentConfig => {
  if (!isRecord(value)) {
    throw new Error('Environment configuration must be a JSON object.');
  }

  const base = getPresetConfig('default_writing');
  const imported = value;
  const instructions = isRecord(imported.instructions) ? imported.instructions : {};
  const aiUsageLimit = isRecord(imported.aiUsageLimit) ? imported.aiUsageLimit : {};
  const aiTokenBudget = isRecord(imported.aiTokenBudget) ? imported.aiTokenBudget : {};
  const time = isRecord(imported.time) ? imported.time : {};
  const submission = isRecord(imported.submission) ? imported.submission : {};
  const traceability = isRecord(imported.traceability) ? imported.traceability : {};
  const aiAccess = normalizeAiAccessForForm(imported.aiAccess, base.aiAccess);
  const usageMode = aiUsageLimit.mode === 'time_restricted' ? 'time_restricted' : 'unlimited';
  const copyPastePolicy = normalizeCopyPastePolicy(
    typeof imported.copyPastePolicy === 'string'
      ? imported.copyPastePolicy
      : base.copyPastePolicy
  );

  return {
    ...base,
    description: typeof imported.description === 'string' ? imported.description : base.description,
    preset: 'custom',
    taskType: 'personal',
    aiAccess,
    allowedModels: aiAccess === 'off' ? [] : normalizeStringArray(imported.allowedModels, base.allowedModels),
    customModels: aiAccess === 'off' ? [] : normalizeStringArray(imported.customModels, base.customModels),
    instructions: {
      ...base.instructions,
      hasInstructionPdf: typeof instructions.hasInstructionPdf === 'boolean'
        ? instructions.hasInstructionPdf
        : base.instructions.hasInstructionPdf,
      editableAfterSubmission: typeof instructions.editableAfterSubmission === 'boolean'
        ? instructions.editableAfterSubmission
        : base.instructions.editableAfterSubmission,
    },
    aiUsageLimit: {
      ...base.aiUsageLimit,
      mode: usageMode,
    },
    aiTokenBudget: {
      shortcutMaxTokens: isPositiveNumber(aiTokenBudget.shortcutMaxTokens)
        ? aiTokenBudget.shortcutMaxTokens
        : base.aiTokenBudget?.shortcutMaxTokens || AI_SHORTCUT_MAX_TOKENS_DEFAULT,
      chatMaxTokens: isPositiveNumber(aiTokenBudget.chatMaxTokens)
        ? aiTokenBudget.chatMaxTokens
        : base.aiTokenBudget?.chatMaxTokens || AI_CHAT_MAX_TOKENS_DEFAULT,
    },
    time: {
      ...base.time,
      timeLimitSeconds: usageMode === 'time_restricted'
        ? isPositiveNumber(time.timeLimitSeconds)
          ? time.timeLimitSeconds
          : base.time.timeLimitSeconds || 3600
        : undefined,
    },
    submission: {
      ...base.submission,
      mode: submission.mode === 'single' || submission.mode === 'multiple'
        ? submission.mode
        : base.submission.mode,
      minCharacters: isPositiveNumber(submission.minCharacters)
        ? Math.min(Math.floor(submission.minCharacters), SUBMISSION_MIN_CHARACTERS_MAX)
        : undefined,
      maxCharacters: isPositiveNumber(submission.maxCharacters)
        ? Math.min(Math.floor(submission.maxCharacters), SUBMISSION_MAX_CHARACTERS_MAX)
        : undefined,
    },
    traceability: {
      ...base.traceability,
      trackAiUsage: typeof traceability.trackAiUsage === 'boolean'
        ? traceability.trackAiUsage
        : aiAccess !== 'off',
      trackTyping: typeof traceability.trackTyping === 'boolean'
        ? traceability.trackTyping
        : base.traceability.trackTyping,
      trackCopyPaste: copyPastePolicy === 'allowed',
      trackFocusBlur: typeof traceability.trackFocusBlur === 'boolean'
        ? traceability.trackFocusBlur
        : base.traceability.trackFocusBlur,
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
  const [customAiModel, setCustomAiModel] = useState('');
  const [hasExistingAiKey, setHasExistingAiKey] = useState(false);
  const [maskedAiKey, setMaskedAiKey] = useState('');
  const [isTestingAiConnection, setIsTestingAiConnection] = useState(false);
  const [aiConnectionResult, setAiConnectionResult] = useState<AiConnectionResult | null>(null);
  const [testedAiModels, setTestedAiModels] = useState<string[]>([]);
  const [timeLimitMinutesInput, setTimeLimitMinutesInput] = useState('60');

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
    if (whitelist?.length) {
      options = whitelist;
    } else if (testedAiModels.length) {
      options = testedAiModels;
    } else {
      options = WRITING_AI_MODELS.filter((model) => model !== 'Custom models');
    }

    return aiModel && aiModel !== CUSTOM_MODEL_VALUE && !options.includes(aiModel)
      ? [aiModel, ...options]
      : options;
  }, [aiBaseUrl, aiModel, testedAiModels]);

  const selectedAiModel = aiModel === CUSTOM_MODEL_VALUE ? customAiModel.trim() : aiModel.trim();
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
      setCustomAiModel('');
      return;
    }

    const customModel = config.customModels?.[0] || '';
    const firstAllowedModel = config.allowedModels[0] || '';
    setAiModel(firstAllowedModel || (customModel ? CUSTOM_MODEL_VALUE : ''));
    setCustomAiModel(customModel);
  };

  const applyEnvironmentPreset = (preset: WritingEnvironmentPreset) => {
    const config = getPresetConfig(preset);
    setEnvironmentSelection(preset);
    setEnvironmentConfig(config);
    syncAiModelFromEnvironment(config);
    setAiConnectionResult(null);
    setTestedAiModels([]);
  };

  const handleEnvironmentSelectionChange = (value: EnvironmentSelection) => {
    if (value === IMPORT_ENVIRONMENT_VALUE) {
      setEnvironmentSelection(value);
      return;
    }

    applyEnvironmentPreset(value);
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
      setEnvironmentSelection(IMPORT_ENVIRONMENT_VALUE);
      setEnvironmentConfig(config);
      syncAiModelFromEnvironment(config);
      setAiConnectionResult(null);
      setTestedAiModels([]);
      toast({
        title: 'Environment imported',
        description: 'The JSON configuration was applied to this document.',
      });
    } catch (err: any) {
      toast({
        title: 'Import failed',
        description: err.message || 'Unable to import the environment JSON file.',
        variant: 'destructive',
      });
    } finally {
      event.target.value = '';
    }
  };

  const setEnvironmentAiModel = (model: string, isCustomModel = false) => {
    markCustom((current) => ({
      ...current,
      allowedModels: model ? [model] : [],
      customModels: isCustomModel && model ? [model] : [],
    }));
  };

  const updateAiBaseUrl = (nextBaseUrl: string, resetModel = false) => {
    setAiBaseUrl(nextBaseUrl);
    setAiConnectionResult(null);
    setTestedAiModels([]);

    if (resetModel) {
      const nextModel = getWhitelist(nextBaseUrl)?.[0] || '';
      setAiModel(nextModel);
      setCustomAiModel('');
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

  const setSubmissionMinimumCharacters = (value: string) => {
    const minCharacters = parseOptionalMinCharacters(value);
    markCustom((current) => ({
      ...current,
      submission: {
        ...current.submission,
        minCharacters,
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

  const handleTestAiConnection = async () => {
    if (!aiApiKey.trim() && !hasExistingAiKey) {
      setAiConnectionResult({
        success: false,
        message: 'Enter an AI API key before testing the connection.',
      });
      return;
    }
    const baseUrlToTest = aiBaseUrl.trim();
    if (!baseUrlToTest) {
      setAiConnectionResult({
        success: false,
        message: 'Select a provider or enter a custom base URL before testing the connection.',
      });
      return;
    }

    setIsTestingAiConnection(true);
    setAiConnectionResult(null);
    setTestedAiModels([]);

    try {
      const response = await apiClient.post('/ai/settings/test', {
        apiKey: aiApiKey.trim() || USE_EXISTING_AI_KEY,
        baseUrl: baseUrlToTest,
      });
      const result = response.data || {};

      setAiConnectionResult({
        success: !!result.success,
        message: result.message || (result.success ? 'Connection successful.' : 'Connection failed.'),
      });

      if (result.success) {
        const fallbackModels = getWhitelist(baseUrlToTest) || [];
        const modelsFromApi = Array.isArray(result.models) ? result.models.filter(Boolean) : [];
        const nextModels = fallbackModels.length ? fallbackModels : modelsFromApi;

        setTestedAiModels(nextModels);

        if (nextModels.length > 0 && (!aiModel || !nextModels.includes(aiModel))) {
          setAiModel(nextModels[0]);
          setEnvironmentAiModel(nextModels[0]);
        }
      }
    } catch (err: any) {
      setAiConnectionResult({
        success: false,
        message: err.message || 'Connection test failed.',
      });
    } finally {
      setIsTestingAiConnection(false);
    }
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
          allowedModels: [selectedAiModel],
          customModels: aiModel === CUSTOM_MODEL_VALUE ? [selectedAiModel] : configToCreate.customModels,
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
    aiModel,
    hasExistingAiKey,
    selectedAiModel,
    createDocument,
    toast,
    router,
  ]);

  const showDetailedEnvironmentControls = environmentSelection !== 'default_writing';

  return (
    <div className="container mx-auto max-w-2xl px-4 py-8">
      <div className="mb-6">
        <Button variant="ghost" className="mb-4" onClick={() => router.push('/documents')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Documents
        </Button>
        <h1 className="text-3xl font-bold">New Document</h1>
        <p className="mt-2 text-muted-foreground">
          Create a personal writing document and configure its writing environment.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Document Configuration</CardTitle>
          <CardDescription>
            Set up the document details, AI access, and writing controls before you start.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <section className="space-y-4">
            <SectionHeading
              title="Basic Information"
              description="Name the document and attach an optional source PDF for side-by-side writing."
            />

            <div className="grid gap-2">
              <Label htmlFor="document-title">Document Name</Label>
              <Input
                id="document-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="My Writing Document"
                disabled={isCreating}
              />
            </div>

            <div className="grid gap-2">
              <Label htmlFor="document-description">Description</Label>
              <Textarea
                id="document-description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Optional context for this document..."
                disabled={isCreating}
              />
            </div>

            <div className="rounded-md border border-dashed p-4">
              <div className="flex items-center gap-2 text-sm font-medium">
                <Upload className="h-4 w-4 text-muted-foreground" />
                PDF
              </div>
              <p className="mt-1 text-sm text-muted-foreground">
                Optional PDF source file for side-by-side writing.
              </p>
              <Input
                ref={fileInputRef}
                type="file"
                accept="application/pdf"
                className="mt-3"
                onChange={handlePdfSelect}
                disabled={isCreating}
              />
              {pdfFile && (
                <div className="mt-3 flex items-center gap-3 rounded-md border bg-muted/40 p-3">
                  <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
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

          <div className="space-y-5 rounded-md border p-4">
            <SectionHeading
              title="Environment"
              description="Choose a default, customize the modules below, or import a JSON configuration."
            />

            <div className="grid gap-2">
              <Label>Environment</Label>
              <Select value={environmentSelection} onValueChange={(value) => handleEnvironmentSelectionChange(value as EnvironmentSelection)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select environment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default_writing">Default Environment</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                  <SelectItem value={IMPORT_ENVIRONMENT_VALUE}>Import Environment</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {environmentSelection === IMPORT_ENVIRONMENT_VALUE && (
              <div className="rounded-md border border-dashed p-4">
                <div className="flex items-center gap-2 text-sm font-medium">
                  <Upload className="h-4 w-4 text-muted-foreground" />
                  Import JSON Configuration
                </div>
                <p className="mt-1 text-sm text-muted-foreground">
                  Upload a JSON file that matches the writing environment configuration shape.
                </p>
                <Input
                  type="file"
                  accept="application/json,.json"
                  className="mt-3"
                  onChange={handleEnvironmentImport}
                  disabled={isCreating}
                />
              </div>
            )}

            {!showDetailedEnvironmentControls ? (
              <div className="rounded-md border bg-muted/30 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <div>
                    <p className="font-medium">Default Environment</p>
                    <p className="text-sm text-muted-foreground">
                      A simple personal writing setup with authorship tracking enabled and no AI assistant configured.
                    </p>
                  </div>
                </div>

                <div className="mt-4 grid gap-3 sm:grid-cols-3">
                  <div className="rounded-md bg-background p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">AI</p>
                    <p className="mt-1 text-sm font-medium">Off</p>
                  </div>
                  <div className="rounded-md bg-background p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Writing</p>
                    <p className="mt-1 text-sm font-medium">Copy & paste allowed</p>
                  </div>
                  <div className="rounded-md bg-background p-3">
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Time</p>
                    <p className="mt-1 text-sm font-medium">No limit</p>
                  </div>
                </div>

                <p className="mt-4 text-sm text-muted-foreground">
                  Choose Custom to configure AI access, copy-paste rules, or a time limit.
                </p>
              </div>
            ) : (
              <>
                <div className="space-y-4 rounded-md border p-4">
                  <SectionHeading
                    title="AI"
                    description="Control whether this document can use assistant support."
                  />

                  <div className="grid gap-2">
                    <Label>AI</Label>
                    <Select value={environmentConfig.aiAccess} onValueChange={(value) => setAiAccess(value as WritingAiAccess)}>
                      <SelectTrigger>
                        <SelectValue placeholder="AI access" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="off">AI Off</SelectItem>
                        <SelectItem value="full">AI On</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  {environmentConfig.aiAccess !== 'off' && (
                    <div className="grid gap-4 rounded-md border bg-muted/30 p-3">
                      <div className="grid gap-2">
                        <Label htmlFor="ai-api-key">AI API Key</Label>
                        <Input
                          id="ai-api-key"
                          type="password"
                          value={aiApiKey}
                          onChange={(event) => {
                            setAiApiKey(event.target.value);
                            setAiConnectionResult(null);
                            setTestedAiModels([]);
                          }}
                          placeholder={hasExistingAiKey ? `Current: ${maskedAiKey || 'saved key'}` : 'Enter API key'}
                          disabled={isCreating}
                        />
                        {hasExistingAiKey && !aiApiKey && (
                          <p className="text-xs text-muted-foreground">
                            Leave empty to use the saved key.
                          </p>
                        )}
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={handleTestAiConnection}
                        disabled={isCreating || isTestingAiConnection || (!aiApiKey.trim() && !hasExistingAiKey)}
                      >
                        {isTestingAiConnection ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Testing...
                          </>
                        ) : (
                          'Test Connection'
                        )}
                      </Button>

                      {aiConnectionResult && (
                        <div className="flex items-start gap-2 text-xs">
                          {aiConnectionResult.success ? (
                            <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                          ) : (
                            <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" />
                          )}
                          <p className={aiConnectionResult.success ? 'text-emerald-700' : 'text-destructive'}>
                            {aiConnectionResult.message}
                          </p>
                        </div>
                      )}

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label>Model</Label>
                          <Select
                            value={aiModel}
                            onValueChange={(value) => {
                              setAiModel(value);
                              if (value !== CUSTOM_MODEL_VALUE) {
                                setCustomAiModel('');
                                setEnvironmentAiModel(value);
                              } else {
                                setEnvironmentAiModel(customAiModel.trim(), true);
                              }
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
                              <SelectItem value={CUSTOM_MODEL_VALUE}>Custom model</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>

                        <div className="grid gap-2">
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

                        {getProviderValueForBaseUrl(aiBaseUrl) === CUSTOM_AI_PROVIDER_VALUE && (
                          <div className="grid gap-2 sm:col-span-2">
                            <Label htmlFor="ai-base-url">Custom Base URL</Label>
                            <Input
                              id="ai-base-url"
                              value={aiBaseUrl}
                              onChange={(event) => updateAiBaseUrl(event.target.value, true)}
                              placeholder={DEFAULT_AI_BASE_URL}
                              disabled={isCreating}
                            />
                          </div>
                        )}
                      </div>

                      {aiModel === CUSTOM_MODEL_VALUE && (
                        <div className="grid gap-2">
                          <Label htmlFor="custom-ai-model">Custom Model</Label>
                          <Input
                            id="custom-ai-model"
                            value={customAiModel}
                            onChange={(event) => {
                              setCustomAiModel(event.target.value);
                              setEnvironmentAiModel(event.target.value.trim(), true);
                            }}
                            placeholder="provider/model-name"
                            disabled={isCreating}
                          />
                        </div>
                      )}

                      <div className="grid gap-4 sm:grid-cols-2">
                        <div className="grid gap-2">
                          <Label htmlFor="ai-shortcut-max-tokens">Shortcut Tokens</Label>
                          <Input
                            id="ai-shortcut-max-tokens"
                            type="number"
                            min={AI_MAX_TOKENS_MIN}
                            max={AI_MAX_TOKENS_MAX}
                            value={environmentConfig.aiTokenBudget?.shortcutMaxTokens || AI_SHORTCUT_MAX_TOKENS_DEFAULT}
                            onChange={(event) => setAiTokenBudget({
                              shortcutMaxTokens: Number(event.target.value) || AI_SHORTCUT_MAX_TOKENS_DEFAULT,
                            })}
                            disabled={isCreating}
                          />
                          <p className="text-xs text-muted-foreground">Shortcut actions and fallback answers.</p>
                        </div>

                        <div className="grid gap-2">
                          <Label htmlFor="ai-chat-max-tokens">Chat Tokens</Label>
                          <Input
                            id="ai-chat-max-tokens"
                            type="number"
                            min={AI_MAX_TOKENS_MIN}
                            max={AI_MAX_TOKENS_MAX}
                            value={environmentConfig.aiTokenBudget?.chatMaxTokens || AI_CHAT_MAX_TOKENS_DEFAULT}
                            onChange={(event) => setAiTokenBudget({
                              chatMaxTokens: Number(event.target.value) || AI_CHAT_MAX_TOKENS_DEFAULT,
                            })}
                            disabled={isCreating}
                          />
                          <p className="text-xs text-muted-foreground">Chat and retrieval tool turns, per model call.</p>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div className="space-y-4 rounded-md border p-4">
                  <SectionHeading
                    title="Writing Control"
                    description="Set rules for editing behavior during writing."
                  />

                  <div className="grid gap-2">
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
                      <SelectTrigger>
                        <SelectValue placeholder="Copy-paste policy" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="allowed">Allowed</SelectItem>
                        <SelectItem value="blocked">Blocked</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-2">
                    <div className="grid gap-2">
                      <Label htmlFor="minimum-characters">Minimum Characters</Label>
                      <Input
                        id="minimum-characters"
                        type="number"
                        min={1}
                        max={SUBMISSION_MIN_CHARACTERS_MAX}
                        value={environmentConfig.submission.minCharacters ?? ''}
                        onChange={(event) => setSubmissionMinimumCharacters(event.target.value)}
                        placeholder="No minimum"
                        disabled={isCreating}
                      />
                    </div>

                    <div className="grid gap-2">
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

                    <p className="text-xs text-muted-foreground sm:col-span-2">
                      Leave either field blank when submissions do not need that length bound.
                    </p>
                  </div>
                </div>

                <div className="space-y-4 rounded-md border p-4">
                  <SectionHeading
                    title="Time Limitation"
                    description="Set whether the writing session should have a time limit."
                  />

                  <div className="grid gap-2">
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
                    <div className="grid gap-2">
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
              </>
            )}
          </div>
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => router.push('/documents')} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreateDocument} disabled={isCreating}>
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isCreating ? 'Creating...' : 'Create Writing'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

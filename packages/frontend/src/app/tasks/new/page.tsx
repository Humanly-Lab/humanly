'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  ArrowLeft,
  CheckCircle,
  FileText,
  Loader2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';

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
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api-client';
import { MODEL_WHITELIST, getWhitelist } from '@/lib/ai-models';
import {
  getLocalTimeZoneLabel,
  localDateTimeInputToISOString,
  toLocalDateTimeInputValue,
} from '@/lib/utils';
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
  type Task,
  type UserAISettings,
  type WritingAiAccess,
  type WritingAiProvider,
  type WritingAiProviderConfig,
  type WritingEnvironmentConfig,
  type WritingEnvironmentPreset,
} from '@humanly/shared';

// Zod schema for form validation
const taskFormSchema = z.object({
  name: z
    .string()
    .min(3, 'Task name must be at least 3 characters')
    .max(100, 'Task name must not exceed 100 characters'),
  description: z
    .string()
    .max(500, 'Description must not exceed 500 characters')
    .optional()
    .or(z.literal('')),
  aiUsageLimit: z.coerce.number().int().min(1, 'AI usage limit must be at least 1'),
  startDate: z.string().optional(),
  endDate: z.string().optional(),
}).refine((data) => {
  if (!data.startDate || !data.endDate) return true;
  return new Date(data.endDate) > new Date(data.startDate);
}, {
  message: 'Task end date must be after start date',
  path: ['endDate'],
});

type TaskFormValues = z.infer<typeof taskFormSchema>;

const DEFAULT_AI_BASE_URL = 'https://api.together.xyz/v1';
const CUSTOM_MODEL_VALUE = '__custom_model__';
const USE_EXISTING_AI_KEY = '__use_existing__';
const IMPORT_ENVIRONMENT_VALUE = 'import_environment';
const DEFAULT_TASK_WINDOW_DAYS = 14;
const UNLIMITED_TASK_WINDOW_YEARS = 100;

const fallbackWritingModels = () => (
  WRITING_AI_MODELS.filter((model) => model !== 'Custom models')
);

const modelBelongsToOptions = (model: string, options: string[]) => (
  !!model && model !== CUSTOM_MODEL_VALUE && options.includes(model)
);

const KNOWN_AI_PROVIDER_BASE_URLS: Record<string, string> = {
  'api.together.xyz': 'https://api.together.xyz/v1',
  'openrouter.ai': 'https://openrouter.ai/api/v1',
  'api.openai.com': 'https://api.openai.com/v1',
  'api.deepseek.com': 'https://api.deepseek.com/v1',
  'api.anthropic.com': 'https://api.anthropic.com/v1',
  'generativelanguage.googleapis.com': 'https://generativelanguage.googleapis.com/v1beta',
};

const getAiProviderForBaseUrl = (baseUrl: string): WritingAiProvider => {
  try {
    const host = new URL(baseUrl).hostname;
    if (host === 'api.together.xyz') return 'together';
    if (host === 'openrouter.ai') return 'openrouter';
  } catch {
    return 'custom';
  }
  return 'custom';
};

const getAiProviderConfigForBaseUrl = (baseUrl: string): WritingAiProviderConfig | undefined => {
  const normalizedBaseUrl = baseUrl.trim();
  if (!normalizedBaseUrl) return undefined;
  return {
    provider: getAiProviderForBaseUrl(normalizedBaseUrl),
    baseUrl: normalizedBaseUrl,
  };
};

const getAiProviderConfigForModel = (model: string): WritingAiProviderConfig | undefined => {
  const normalizedModel = model.trim();
  if (!normalizedModel) return undefined;

  const match = Object.entries(MODEL_WHITELIST).find(([, descriptors]) => (
    descriptors.some((descriptor) => descriptor.id === normalizedModel)
  ));
  if (!match) return undefined;

  const [host] = match;
  return getAiProviderConfigForBaseUrl(KNOWN_AI_PROVIDER_BASE_URLS[host] || `https://${host}/v1`);
};

const resolveAiProviderConfig = (
  model: string,
  baseUrl: string,
  existingProvider?: WritingAiProviderConfig,
): WritingAiProviderConfig | undefined => {
  const normalizedBaseUrl = baseUrl.trim();
  if (normalizedBaseUrl && getWhitelist(normalizedBaseUrl)?.includes(model)) {
    return getAiProviderConfigForBaseUrl(normalizedBaseUrl);
  }

  return (
    getAiProviderConfigForModel(model)
    || (existingProvider?.baseUrl ? existingProvider : undefined)
    || getAiProviderConfigForBaseUrl(normalizedBaseUrl || DEFAULT_AI_BASE_URL)
  );
};

type AiConnectionResult = {
  success: boolean;
  message: string;
};

type EnvironmentSelection = 'default_writing' | 'custom' | typeof IMPORT_ENVIRONMENT_VALUE;

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

const getAdminEnvironmentConfig = (preset: WritingEnvironmentPreset = 'default_writing'): WritingEnvironmentConfig => ({
  ...WRITING_ENVIRONMENT_PRESETS[preset],
  taskType: 'admin_assigned',
  preset,
  copyPastePolicy: normalizeCopyPastePolicy(WRITING_ENVIRONMENT_PRESETS[preset].copyPastePolicy),
  aiAccess: preset === 'default_writing' ? 'off' : WRITING_ENVIRONMENT_PRESETS[preset].aiAccess,
  allowedModels: preset === 'default_writing' ? [] : WRITING_ENVIRONMENT_PRESETS[preset].allowedModels,
  customModels: preset === 'default_writing' ? [] : WRITING_ENVIRONMENT_PRESETS[preset].customModels,
  aiUsageLimit: {
    mode: 'max_requests',
    maxRequests: 100,
  },
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

const isWritingAiProvider = (value: unknown): value is WritingAiProvider => (
  value === 'together' || value === 'openrouter' || value === 'custom'
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

  const base = getAdminEnvironmentConfig('default_writing');
  const imported = value;
  const instructions = isRecord(imported.instructions) ? imported.instructions : {};
  const aiProvider = isRecord(imported.aiProvider) ? imported.aiProvider : {};
  const aiUsageLimit = isRecord(imported.aiUsageLimit) ? imported.aiUsageLimit : {};
  const aiTokenBudget = isRecord(imported.aiTokenBudget) ? imported.aiTokenBudget : {};
  const time = isRecord(imported.time) ? imported.time : {};
  const submission = isRecord(imported.submission) ? imported.submission : {};
  const traceability = isRecord(imported.traceability) ? imported.traceability : {};
  const aiAccess = normalizeAiAccessForForm(imported.aiAccess, base.aiAccess);
  const importedProviderBaseUrl = typeof aiProvider.baseUrl === 'string'
    ? aiProvider.baseUrl.trim()
    : undefined;
  const importedProvider = isWritingAiProvider(aiProvider.provider)
    ? aiProvider.provider
    : importedProviderBaseUrl
      ? getAiProviderForBaseUrl(importedProviderBaseUrl)
      : undefined;
  const copyPastePolicy = normalizeCopyPastePolicy(
    typeof imported.copyPastePolicy === 'string'
      ? imported.copyPastePolicy
      : base.copyPastePolicy
  );
  const normalizedAllowedModels = aiAccess === 'off'
    ? []
    : normalizeStringArray(imported.allowedModels, base.allowedModels);
  const normalizedCustomModels = aiAccess === 'off'
    ? []
    : normalizeStringArray(imported.customModels, base.customModels);
  const explicitProviderConfig = importedProviderBaseUrl && importedProvider
    ? {
      provider: importedProvider,
      baseUrl: importedProviderBaseUrl,
    }
    : undefined;
  const modelForProvider = normalizedAllowedModels[0] || normalizedCustomModels[0] || '';
  const aiProviderConfig = aiAccess === 'off'
    ? undefined
    : explicitProviderConfig || getAiProviderConfigForModel(modelForProvider);

  return {
    ...base,
    description: typeof imported.description === 'string' ? imported.description : base.description,
    preset: 'custom',
    taskType: 'admin_assigned',
    aiAccess,
    aiProvider: aiProviderConfig,
    allowedModels: normalizedAllowedModels,
    customModels: normalizedCustomModels,
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
      mode: 'max_requests',
      maxRequests: isPositiveNumber(aiUsageLimit.maxRequests)
        ? aiUsageLimit.maxRequests
        : base.aiUsageLimit.maxRequests || 100,
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
      lateSubmission: time.lateSubmission === 'not_allowed' ? 'not_allowed' : base.time.lateSubmission,
      timeLimitSeconds: isPositiveNumber(time.timeLimitSeconds) ? time.timeLimitSeconds : undefined,
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
      trackAiUsage: aiAccess !== 'off' && (
        typeof traceability.trackAiUsage === 'boolean'
          ? traceability.trackAiUsage
          : true
      ),
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

const getDefaultEndDate = () => new Date(Date.now() + DEFAULT_TASK_WINDOW_DAYS * 24 * 60 * 60 * 1000);

export default function NewTaskPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [instructionFiles, setInstructionFiles] = useState<File[]>([]);
  const [aiAccess, setAiAccessState] = useState<WritingAiAccess>('off');
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_AI_BASE_URL);
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [customAiModel, setCustomAiModel] = useState('');
  const [hasExistingAiKey, setHasExistingAiKey] = useState(false);
  const [maskedAiKey, setMaskedAiKey] = useState('');
  const [isTestingAiConnection, setIsTestingAiConnection] = useState(false);
  const [aiConnectionResult, setAiConnectionResult] = useState<AiConnectionResult | null>(null);
  const [testedAiModels, setTestedAiModels] = useState<string[]>([]);
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(true);
  const [writingTimeLimitMinutesInput, setWritingTimeLimitMinutesInput] = useState('60');
  const [environmentSelection, setEnvironmentSelection] = useState<EnvironmentSelection>('default_writing');
  const [environmentConfig, setEnvironmentConfig] = useState<WritingEnvironmentConfig>(
    getAdminEnvironmentConfig('default_writing')
  );

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      name: '',
      description: '',
      aiUsageLimit: 100,
      startDate: toLocalDateTimeInputValue(new Date()),
      endDate: toLocalDateTimeInputValue(getDefaultEndDate()),
    },
  });

  const { isSubmitting } = form.formState;

  useEffect(() => {
    let cancelled = false;

    const loadAiSettings = async () => {
      try {
        const response = await api.get<{ success: boolean; data: UserAISettings | null }>('/api/v1/ai/settings');
        const settings = response.data;

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
      options = fallbackWritingModels();
    }

    return aiModel && aiModel !== CUSTOM_MODEL_VALUE && !options.includes(aiModel)
      ? [aiModel, ...options]
      : options;
  }, [aiBaseUrl, aiModel, testedAiModels]);

  const selectedAiModel = aiModel === CUSTOM_MODEL_VALUE ? customAiModel.trim() : aiModel.trim();

  const markCustom = (updater: (current: WritingEnvironmentConfig) => WritingEnvironmentConfig) => {
    setEnvironmentSelection('custom');
    setEnvironmentConfig((current) => ({
      ...updater(current),
      preset: 'custom',
    }));
  };

  const updateEnvironment = (patch: Partial<WritingEnvironmentConfig>) => {
    markCustom((current) => ({
      ...current,
      ...patch,
    }));
  };

  const setEnvironmentAiModel = (model: string, isCustomModel = false) => {
    markCustom((current) => ({
      ...current,
      allowedModels: model ? [model] : [],
      customModels: isCustomModel && model ? [model] : [],
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

  const applyEnvironmentPreset = (preset: Extract<EnvironmentSelection, WritingEnvironmentPreset>) => {
    const config = getAdminEnvironmentConfig(preset);
    setEnvironmentSelection(preset);
    setEnvironmentConfig(config);
    setAiAccessState(config.aiAccess);
    syncAiModelFromEnvironment(config);
    setAiConnectionResult(null);
    setTestedAiModels([]);
    setWritingTimeLimitMinutesInput(getTimeLimitMinutesValue(config.time.timeLimitSeconds));
    form.setValue('aiUsageLimit', config.aiUsageLimit.maxRequests || 100);
    if (preset === 'default_writing') {
      setTimeLimitEnabled(true);
      form.setValue('startDate', toLocalDateTimeInputValue(new Date()));
      form.setValue('endDate', toLocalDateTimeInputValue(getDefaultEndDate()));
    }
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
      if (config.aiProvider?.baseUrl) {
        setAiBaseUrl(config.aiProvider.baseUrl);
      }
      setEnvironmentSelection(IMPORT_ENVIRONMENT_VALUE);
      setEnvironmentConfig(config);
      setAiAccessState(config.aiAccess);
      syncAiModelFromEnvironment(config);
      setAiConnectionResult(null);
      setTestedAiModels([]);
      setWritingTimeLimitMinutesInput(getTimeLimitMinutesValue(config.time.timeLimitSeconds));
      form.setValue('aiUsageLimit', config.aiUsageLimit.maxRequests || 100);
      toast({
        title: 'Environment imported',
        description: 'The JSON configuration was applied to this task.',
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

  const setWritingSessionTimerEnabled = (enabled: boolean) => {
    const minutes = parseTimeLimitMinutes(
      writingTimeLimitMinutesInput,
      Number(getTimeLimitMinutesValue(environmentConfig.time.timeLimitSeconds))
    );
    if (enabled) {
      setWritingTimeLimitMinutesInput(String(minutes));
    }

    markCustom((current) => {
      if (!enabled) {
        return {
          ...current,
          time: {
            ...current.time,
            timeLimitSeconds: undefined,
          },
        };
      }

      return {
        ...current,
        time: {
          ...current.time,
          timeLimitSeconds: minutes * 60,
        },
      };
    });
  };

  const setWritingSessionTimerMinutes = (value: string) => {
    setWritingTimeLimitMinutesInput(value);
    if (!value) return;

    const minutes = parseTimeLimitMinutes(value, 1);
    markCustom((current) => ({
      ...current,
      time: {
        ...current.time,
        timeLimitSeconds: minutes * 60,
      },
    }));
  };

  const commitWritingSessionTimerMinutes = () => {
    const minutes = parseTimeLimitMinutes(writingTimeLimitMinutesInput, 1);
    setWritingTimeLimitMinutesInput(String(minutes));
    markCustom((current) => ({
      ...current,
      time: {
        ...current.time,
        timeLimitSeconds: minutes * 60,
      },
    }));
  };

  const setAiAccess = (nextAccess: WritingAiAccess) => {
    const defaultModel = modelBelongsToOptions(aiModel, aiModelOptions)
      ? aiModel
      : aiModelOptions[0] || 'gpt-4.1';

    setAiAccessState(nextAccess);
    if (nextAccess !== 'off' && !modelBelongsToOptions(aiModel, aiModelOptions)) {
      setAiModel(defaultModel);
    }

    markCustom((current) => ({
      ...current,
      aiAccess: nextAccess,
      allowedModels: nextAccess === 'off'
        ? []
        : current.allowedModels.length
          ? current.allowedModels
          : [defaultModel],
      customModels: nextAccess === 'off' ? [] : current.customModels,
      traceability: {
        ...current.traceability,
        trackAiUsage: nextAccess !== 'off',
      },
    }));
  };

  const testAiConnection = async (): Promise<boolean> => {
    if (!aiApiKey.trim() && !hasExistingAiKey) {
      setAiConnectionResult({
        success: false,
        message: 'Enter an AI API key before testing the connection.',
      });
      return false;
    }

    setIsTestingAiConnection(true);
    setAiConnectionResult(null);
    setTestedAiModels([]);

    try {
      const result = await api.post<{ success: boolean; message?: string; models?: string[] }>('/api/v1/ai/settings/test', {
        apiKey: aiApiKey.trim() || USE_EXISTING_AI_KEY,
        baseUrl: aiBaseUrl.trim() || DEFAULT_AI_BASE_URL,
      });

      setAiConnectionResult({
        success: !!result.success,
        message: result.message || (result.success ? 'Connection successful.' : 'Connection failed.'),
      });

      if (result.success) {
        toast({
          title: 'AI key verified',
          description: 'Connection test passed. This task can use AI.',
        });

        const fallbackModels = getWhitelist(aiBaseUrl.trim() || DEFAULT_AI_BASE_URL) || [];
        const modelsFromApi = Array.isArray(result.models) ? result.models.filter(Boolean) : [];
        const nextModels = fallbackModels.length ? fallbackModels : modelsFromApi;

        setTestedAiModels(nextModels);

        if (nextModels.length > 0 && (!aiModel || !nextModels.includes(aiModel))) {
          setAiModel(nextModels[0]);
          setEnvironmentAiModel(nextModels[0]);
        }
      }

      return !!result.success;
    } catch (err: any) {
      setAiConnectionResult({
        success: false,
        message: err.message || 'Connection test failed.',
      });
      return false;
    } finally {
      setIsTestingAiConnection(false);
    }
  };

  const handleTestAiConnection = async () => {
    await testAiConnection();
  };

  const onSubmit = async (data: TaskFormValues) => {
    try {
      setError(null);

      if (aiAccess !== 'off') {
        if (!aiApiKey.trim() && !hasExistingAiKey) {
          throw new Error('Enter an AI API key before creating an AI-enabled task.');
        }

        if (!selectedAiModel) {
          throw new Error('Select or enter the AI model for this task.');
        }

        if (aiConnectionResult?.success !== true) {
          const success = await testAiConnection();
          if (!success) {
            throw new Error('Test AI connection before creating an AI-enabled task.');
          }
        }

        await api.put('/api/v1/ai/settings', {
          apiKey: aiApiKey.trim() || USE_EXISTING_AI_KEY,
          baseUrl: aiBaseUrl.trim() || DEFAULT_AI_BASE_URL,
          model: selectedAiModel,
          shortcutMaxTokens: environmentConfig.aiTokenBudget?.shortcutMaxTokens || AI_SHORTCUT_MAX_TOKENS_DEFAULT,
          chatMaxTokens: environmentConfig.aiTokenBudget?.chatMaxTokens || AI_CHAT_MAX_TOKENS_DEFAULT,
        });
      }

      const allowedModels = aiAccess === 'off' ? [] : [selectedAiModel];
      const resolvedAiProvider = aiAccess === 'off'
        ? undefined
        : resolveAiProviderConfig(selectedAiModel, aiBaseUrl, environmentConfig.aiProvider);
      if (timeLimitEnabled && (!data.startDate || !data.endDate)) {
        throw new Error('Select both start and end time when Time is on.');
      }

      const fallbackStart = new Date();
      const fallbackEnd = new Date(fallbackStart);
      fallbackEnd.setFullYear(fallbackEnd.getFullYear() + UNLIMITED_TASK_WINDOW_YEARS);

      const startTime = timeLimitEnabled && data.startDate
        ? localDateTimeInputToISOString(data.startDate)
        : fallbackStart.toISOString();
      const endTime = timeLimitEnabled && data.endDate
        ? localDateTimeInputToISOString(data.endDate)
        : fallbackEnd.toISOString();
      const configStartTime = timeLimitEnabled ? startTime : undefined;
      const configEndTime = timeLimitEnabled ? endTime : undefined;
      const writingTimeLimitSeconds = environmentConfig.time.timeLimitSeconds
        ? parseTimeLimitMinutes(
            writingTimeLimitMinutesInput,
            Number(getTimeLimitMinutesValue(environmentConfig.time.timeLimitSeconds))
          ) * 60
        : undefined;

      // Clean up the data - remove empty strings for optional fields
      const payload = {
        name: data.name,
        description: data.description || undefined,
        userIdKey: 'userId',
        allowedLlmModels: allowedModels.length ? allowedModels : undefined,
        aiUsageLimit: data.aiUsageLimit,
        startDate: startTime,
        endDate: endTime,
        environmentConfig: {
          ...environmentConfig,
          taskType: 'admin_assigned',
          aiAccess,
          aiProvider: resolvedAiProvider,
          allowedModels,
          customModels: aiModel === CUSTOM_MODEL_VALUE && selectedAiModel ? [selectedAiModel] : [],
          instructions: {
            ...environmentConfig.instructions,
            hasInstructionPdf: instructionFiles.length > 0,
          },
          aiUsageLimit: {
            mode: 'max_requests',
            maxRequests: data.aiUsageLimit,
          },
          time: {
            ...environmentConfig.time,
            startTime: configStartTime,
            endTime: configEndTime,
            timeLimitSeconds: writingTimeLimitSeconds,
            lateSubmission: timeLimitEnabled ? 'not_allowed' : 'allowed',
          },
          traceability: {
            ...environmentConfig.traceability,
            trackAiUsage: aiAccess !== 'off',
            trackCopyPaste: normalizeCopyPastePolicy(environmentConfig.copyPastePolicy) === 'allowed',
          },
        },
      };

      const response = await api.post<{
        success: boolean;
        data: Task;
        message: string;
      }>('/api/v1/tasks', payload);

      let instructionUploadFailed = false;
      if (instructionFiles.length > 0) {
        for (const file of instructionFiles) {
          const formData = new FormData();
          formData.append('pdf', file);
          formData.append('title', file.name.replace(/\.pdf$/i, ''));

          try {
            await api.post(
              `/api/v1/tasks/${response.data.id}/files`,
              formData
            );
          } catch {
            instructionUploadFailed = true;
          }
        }
      }

      toast({
        title: instructionUploadFailed ? 'Task created' : 'Success!',
        description: instructionUploadFailed
          ? 'Task created, but the instruction file upload failed. You can upload it from the task dashboard later.'
          : instructionFiles.length
            ? 'Task created and instruction files uploaded successfully.'
            : 'Task created successfully. Share the generated invite code from the task dashboard.',
        variant: instructionUploadFailed ? 'destructive' : 'default',
      });

      // Redirect to the new task's page
      router.push(`/tasks/${response.data.id}`);
    } catch (err: any) {
      const errorMessage = err?.message || 'Failed to create task. Please try again.';
      setError(errorMessage);

      toast({
        title: 'Error',
        description: errorMessage,
        variant: 'destructive',
      });
    }
  };

  const handleCancel = () => {
    router.push('/tasks');
  };

  const handleInstructionFilesChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;

    const invalidFile = files.find((file) => file.type !== 'application/pdf');
    if (invalidFile) {
      event.target.value = '';
      toast({
        title: 'Invalid file',
        description: 'Task files must be uploaded as PDF.',
        variant: 'destructive',
      });
      return;
    }

    const oversizedFile = files.find((file) => file.size > 50 * 1024 * 1024);
    if (oversizedFile) {
      event.target.value = '';
      toast({
        title: 'File too large',
        description: 'Task PDFs must be smaller than 50MB.',
        variant: 'destructive',
      });
      return;
    }

    setInstructionFiles(files);
  };

  const showDetailedEnvironmentControls = environmentSelection !== 'default_writing';

  return (
    <div className="container mx-auto max-w-6xl px-4 py-8">
      <div className="mb-6">
        <Button variant="ghost" className="mb-4" onClick={() => router.push('/tasks')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tasks
        </Button>
        <h1 className="text-3xl font-bold">New Task</h1>
        <p className="mt-2 text-muted-foreground">
          Create an admin-managed writing task and configure its writing environment.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Task Configuration</CardTitle>
          <CardDescription>
            Set up the task details, instruction files, timing, and environment before enrollment starts.
          </CardDescription>
        </CardHeader>

        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="grid gap-6 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.25fr)] xl:items-start">
              {error && (
                <Alert variant="destructive" className="xl:col-span-2">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

              <section className="space-y-4">
                <SectionHeading
                  title="Basic Information"
                  description="Name the task and attach optional PDF instructions for enrolled users."
                />

                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>
                        Task Name <span className="text-destructive">*</span>
                      </FormLabel>
                      <FormControl>
                        <Input
                          placeholder="Research Reflection Assignment"
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="description"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Description</FormLabel>
                      <FormControl>
                        <Textarea
                          placeholder="Describe the writing task, deadline, evaluation criteria, or class context..."
                          className="resize-none"
                          {...field}
                          disabled={isSubmitting}
                        />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-md border border-dashed p-4">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    <Upload className="h-4 w-4 text-muted-foreground" />
                    Files
                  </div>
                  <p className="mt-1 text-sm text-muted-foreground">
                    Upload one or more PDF instruction files for this task.
                  </p>
                  <Input
                    type="file"
                    accept="application/pdf"
                    multiple
                    className="mt-3"
                    onChange={handleInstructionFilesChange}
                    disabled={isSubmitting}
                  />
                  {instructionFiles.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {instructionFiles.map((file) => (
                        <div key={`${file.name}-${file.size}`} className="flex items-center gap-3 rounded-md border bg-muted/40 p-3">
                          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium" title={file.name}>
                              {file.name}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              {(file.size / 1024 / 1024).toFixed(2)} MB
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => setInstructionFiles((current) => current.filter((item) => item !== file))}
                            disabled={isSubmitting}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>

              <div className="space-y-5 rounded-md border p-4">
                <SectionHeading
                  title="Environment"
                  description="Choose a default, customize task controls, or import a JSON environment."
                />

                <div className="grid gap-2">
                  <FormLabel>Environment</FormLabel>
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
                      disabled={isSubmitting}
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
                          A standard task setup with authorship tracking, no AI assistant, and a two-week writing window.
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
                        <p className="mt-1 text-sm font-medium">Two-week window</p>
                      </div>
                    </div>

                    <p className="mt-4 text-sm text-muted-foreground">
                      Choose Custom to configure AI access, copy-paste rules, or task timing.
                    </p>
                  </div>
                ) : (
                  <div className="grid gap-4 xl:grid-cols-2">
                    <div className="space-y-4 rounded-md border p-4 xl:col-span-2">
                      <SectionHeading
                        title="AI"
                        description="Control whether enrolled users can use assistant support."
                      />

                      <div className="grid gap-2">
                        <FormLabel>AI</FormLabel>
                        <Select value={aiAccess} onValueChange={(value) => setAiAccess(value as WritingAiAccess)}>
                          <SelectTrigger>
                            <SelectValue placeholder="AI access" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="off">AI Off</SelectItem>
                            <SelectItem value="full">AI On</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {aiAccess !== 'off' && (
                        <div className="grid gap-4 rounded-md border bg-muted/30 p-3">
                          <div className="grid gap-2">
                            <FormLabel htmlFor="ai-api-key">AI API Key</FormLabel>
                            <Input
                              id="ai-api-key"
                              type="password"
                              value={aiApiKey}
                              disabled={isSubmitting}
                              onChange={(event) => {
                                setAiApiKey(event.target.value);
                                setAiConnectionResult(null);
                                setTestedAiModels([]);
                              }}
                              placeholder={hasExistingAiKey ? `Current: ${maskedAiKey || 'saved key'}` : 'Enter API key'}
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
                            disabled={isSubmitting || isTestingAiConnection || (!aiApiKey.trim() && !hasExistingAiKey)}
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
                              <FormLabel>Model</FormLabel>
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
                              <FormLabel htmlFor="ai-base-url">Base URL</FormLabel>
                              <Input
                                id="ai-base-url"
                                value={aiBaseUrl}
                                disabled={isSubmitting}
                                onChange={(event) => {
                                  setAiBaseUrl(event.target.value);
                                  setAiConnectionResult(null);
                                  setTestedAiModels([]);
                                }}
                                placeholder={DEFAULT_AI_BASE_URL}
                              />
                            </div>
                          </div>

                          {aiModel === CUSTOM_MODEL_VALUE && (
                            <div className="grid gap-2">
                              <FormLabel htmlFor="custom-ai-model">Custom Model</FormLabel>
                              <Input
                                id="custom-ai-model"
                                value={customAiModel}
                                disabled={isSubmitting}
                                onChange={(event) => {
                                  setCustomAiModel(event.target.value);
                                  setEnvironmentAiModel(event.target.value.trim(), true);
                                }}
                                placeholder="provider/model-name"
                              />
                            </div>
                          )}

                          <div className="grid gap-4 sm:grid-cols-2">
                            <div className="grid gap-2">
                              <FormLabel htmlFor="ai-shortcut-max-tokens">Shortcut Tokens</FormLabel>
                              <Input
                                id="ai-shortcut-max-tokens"
                                type="number"
                                min={AI_MAX_TOKENS_MIN}
                                max={AI_MAX_TOKENS_MAX}
                                value={environmentConfig.aiTokenBudget?.shortcutMaxTokens || AI_SHORTCUT_MAX_TOKENS_DEFAULT}
                                disabled={isSubmitting}
                                onChange={(event) => setAiTokenBudget({
                                  shortcutMaxTokens: Number(event.target.value) || AI_SHORTCUT_MAX_TOKENS_DEFAULT,
                                })}
                              />
                              <FormDescription>Shortcut actions and fallback answers.</FormDescription>
                            </div>

                            <div className="grid gap-2">
                              <FormLabel htmlFor="ai-chat-max-tokens">Chat Tokens</FormLabel>
                              <Input
                                id="ai-chat-max-tokens"
                                type="number"
                                min={AI_MAX_TOKENS_MIN}
                                max={AI_MAX_TOKENS_MAX}
                                value={environmentConfig.aiTokenBudget?.chatMaxTokens || AI_CHAT_MAX_TOKENS_DEFAULT}
                                disabled={isSubmitting}
                                onChange={(event) => setAiTokenBudget({
                                  chatMaxTokens: Number(event.target.value) || AI_CHAT_MAX_TOKENS_DEFAULT,
                                })}
                              />
                              <FormDescription>Chat and retrieval tool turns, per model call.</FormDescription>
                            </div>
                          </div>

                          <FormField
                            control={form.control}
                            name="aiUsageLimit"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  AI Usage Limit <span className="text-destructive">*</span>
                                </FormLabel>
                                <FormControl>
                                  <Input
                                    type="number"
                                    min={1}
                                    placeholder="100"
                                    {...field}
                                    disabled={isSubmitting}
                                  />
                                </FormControl>
                                <FormDescription>
                                  Maximum AI requests allowed per enrolled user for this task.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 rounded-md border p-4">
                      <SectionHeading
                        title="Writing Control"
                        description="Set rules for editing behavior during writing."
                      />

                      <div className="grid gap-2">
                        <FormLabel>Copy & Paste</FormLabel>
                        <Select
                          value={normalizeCopyPastePolicy(environmentConfig.copyPastePolicy)}
                          onValueChange={(value) => updateEnvironment({
                            copyPastePolicy: normalizeCopyPastePolicy(value),
                          })}
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
                          <FormLabel htmlFor="minimum-characters">Minimum Characters</FormLabel>
                          <Input
                            id="minimum-characters"
                            type="number"
                            min={1}
                            max={SUBMISSION_MIN_CHARACTERS_MAX}
                            value={environmentConfig.submission.minCharacters ?? ''}
                            onChange={(event) => setSubmissionMinimumCharacters(event.target.value)}
                            placeholder="No minimum"
                            disabled={isSubmitting}
                          />
                        </div>

                        <div className="grid gap-2">
                          <FormLabel htmlFor="maximum-characters">Maximum Characters</FormLabel>
                          <Input
                            id="maximum-characters"
                            type="number"
                            min={1}
                            max={SUBMISSION_MAX_CHARACTERS_MAX}
                            value={environmentConfig.submission.maxCharacters ?? ''}
                            onChange={(event) => setSubmissionMaximumCharacters(event.target.value)}
                            placeholder="No maximum"
                            disabled={isSubmitting}
                          />
                        </div>

                        <FormDescription className="sm:col-span-2">
                          Leave either field blank when submissions do not need that length bound.
                        </FormDescription>
                      </div>
                    </div>

                    <div className="space-y-4 rounded-md border p-4">
                      <SectionHeading
                        title="Time"
                        description="Set the task availability window shown to enrolled users."
                      />

                      <div className="grid gap-2">
                        <FormLabel>Time</FormLabel>
                        <Select
                          value={timeLimitEnabled ? 'on' : 'off'}
                          onValueChange={(value) => setTimeLimitEnabled(value === 'on')}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="Time policy" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="off">Off</SelectItem>
                            <SelectItem value="on">On</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {timeLimitEnabled && (
                        <div className="grid gap-4 sm:grid-cols-2">
                          <FormField
                            control={form.control}
                            name="startDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Task Start Date <span className="text-destructive">*</span>
                                </FormLabel>
                                <FormControl>
                                  <Input type="datetime-local" {...field} disabled={isSubmitting} />
                                </FormControl>
                                <FormDescription>
                                  Users see this in their own timezone. Yours is {getLocalTimeZoneLabel()}.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />

                          <FormField
                            control={form.control}
                            name="endDate"
                            render={({ field }) => (
                              <FormItem>
                                <FormLabel>
                                  Task End Date <span className="text-destructive">*</span>
                                </FormLabel>
                                <FormControl>
                                  <Input type="datetime-local" {...field} disabled={isSubmitting} />
                                </FormControl>
                                <FormDescription>
                                  Defaults to two weeks after the start time.
                                </FormDescription>
                                <FormMessage />
                              </FormItem>
                            )}
                          />
                        </div>
                      )}
                    </div>

                    <div className="space-y-4 rounded-md border p-4">
                      <SectionHeading
                        title="Writing Session Timer"
                        description="Set an optional countdown shown while enrolled users write."
                      />

                      <div className="grid gap-2">
                        <FormLabel>Timer</FormLabel>
                        <Select
                          value={environmentConfig.time.timeLimitSeconds ? 'time_limited' : 'unlimited'}
                          onValueChange={(value) => setWritingSessionTimerEnabled(value === 'time_limited')}
                        >
                          <SelectTrigger aria-label="Writing session timer">
                            <SelectValue placeholder="Writing session timer" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="unlimited">No time limit</SelectItem>
                            <SelectItem value="time_limited">Time limited</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      {environmentConfig.time.timeLimitSeconds && (
                        <div className="grid gap-2">
                          <FormLabel htmlFor="writing-time-limit-minutes">Time Limit (minutes)</FormLabel>
                          <Input
                            id="writing-time-limit-minutes"
                            type="number"
                            min={1}
                            value={writingTimeLimitMinutesInput}
                            disabled={isSubmitting}
                            onChange={(event) => setWritingSessionTimerMinutes(event.target.value)}
                            onBlur={commitWritingSessionTimerMinutes}
                          />
                          <FormDescription>
                            The editor shows a countdown and blocks submission when the timer reaches zero.
                          </FormDescription>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={handleCancel}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isSubmitting ? 'Creating...' : 'Create Task'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>
    </div>
  );
}

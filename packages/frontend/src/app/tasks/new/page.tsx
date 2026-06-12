'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  ArrowLeft,
  CalendarClock,
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
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { AdminEnvironmentSectionHeading as SectionHeading } from '@/components/admin-environment-ui';
import { api } from '@/lib/api-client';
import { MODEL_WHITELIST, getWhitelist } from '@/lib/ai-models';
import {
  formatDateTime,
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
  TASK_START_DATE_PAST_ERROR_MESSAGE,
  WRITING_AI_ACCESS_OPTIONS,
  WRITING_AI_MODELS,
  WRITING_ENVIRONMENT_PRESETS,
  formatWritingAiAccess,
  isWritingAiChatEnabled,
  isWritingAiPolishEnabled,
  isTaskStartDateTooFarInPast,
  normalizeWritingAiAccess,
  normalizeCopyPastePolicy,
  validateWritingEnvironmentImportTemplate,
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
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const CLAUDE_BASE_URL = 'https://api.anthropic.com/v1';
const USE_EXISTING_AI_KEY = '__use_existing__';
const IMPORT_ENVIRONMENT_VALUE = 'import_environment';
const DEFAULT_TASK_WINDOW_DAYS = 14;
const UNLIMITED_TASK_WINDOW_YEARS = 100;

const isLocalStartDateTooFarInPast = (value?: string): boolean => (
  !!value && isTaskStartDateTooFarInPast(localDateTimeInputToISOString(value))
);

const fallbackWritingModels = () => (
  WRITING_AI_MODELS.filter((model) => model !== 'Custom models')
);

const modelBelongsToOptions = (model: string, options: string[]) => (
  !!model && options.includes(model)
);

const KNOWN_AI_PROVIDER_BASE_URLS: Record<string, string> = {
  'api.together.xyz': DEFAULT_AI_BASE_URL,
  'openrouter.ai': OPENROUTER_BASE_URL,
  'api.openai.com': OPENAI_BASE_URL,
  'api.anthropic.com': CLAUDE_BASE_URL,
};

const AI_PROVIDER_OPTIONS = [
  { label: 'Together AI', value: DEFAULT_AI_BASE_URL },
  { label: 'OpenRouter', value: OPENROUTER_BASE_URL },
  { label: 'OpenAI', value: OPENAI_BASE_URL },
  { label: 'Anthropic', value: CLAUDE_BASE_URL },
] as const;

const getAiProviderForBaseUrl = (baseUrl: string): WritingAiProvider => {
  try {
    const host = new URL(baseUrl).hostname;
    if (host === 'api.together.xyz') return 'together';
    if (host === 'openrouter.ai') return 'openrouter';
    if (host === 'api.openai.com') return 'openai';
    if (host === 'api.anthropic.com') return 'claude';
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
type EnvironmentSummaryItem = {
  label: string;
  value: string;
  detail?: string;
};

const getAdminEnvironmentConfig = (preset: WritingEnvironmentPreset = 'default_writing'): WritingEnvironmentConfig => ({
  ...WRITING_ENVIRONMENT_PRESETS[preset],
  taskType: 'admin_assigned',
  preset,
  copyPastePolicy: normalizeCopyPastePolicy(WRITING_ENVIRONMENT_PRESETS[preset].copyPastePolicy),
  aiAccess: preset === 'default_writing' ? 'off' : normalizeWritingAiAccess(WRITING_ENVIRONMENT_PRESETS[preset].aiAccess),
  allowedModels: preset === 'default_writing' ? [] : WRITING_ENVIRONMENT_PRESETS[preset].allowedModels,
  customModels: preset === 'default_writing' ? [] : WRITING_ENVIRONMENT_PRESETS[preset].customModels,
  aiUsageLimit: {
    mode: 'max_requests',
    maxRequests: 100,
  },
});

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

const normalizeImportedEnvironmentConfig = (value: unknown): WritingEnvironmentConfig => {
  const imported = validateWritingEnvironmentImportTemplate(value, 'admin_assigned');
  const aiAccess: WritingAiAccess = normalizeWritingAiAccess(imported.aiAccess);
  const copyPastePolicy = normalizeCopyPastePolicy(imported.copyPastePolicy);

  return {
    ...imported,
    preset: 'custom',
    taskType: 'admin_assigned',
    aiAccess,
    aiProvider: aiAccess === 'off' ? undefined : imported.aiProvider,
    allowedModels: aiAccess === 'off' ? [] : imported.allowedModels,
    customModels: aiAccess === 'off' ? [] : imported.customModels || [],
    traceability: {
      ...imported.traceability,
      trackAiUsage: aiAccess !== 'off',
      trackCopyPaste: copyPastePolicy === 'allowed',
    },
    copyPastePolicy,
  };
};

const getDefaultTaskWindowValues = (startDate = new Date()) => {
  const endDate = new Date(startDate.getTime() + DEFAULT_TASK_WINDOW_DAYS * 24 * 60 * 60 * 1000);

  return {
    startDate: toLocalDateTimeInputValue(startDate),
    endDate: toLocalDateTimeInputValue(endDate),
  };
};

const formatTaskWindowDate = (value?: string) => formatDateTime(value);

const formatSummaryNumber = (value: number): string => value.toLocaleString('en-US');

const formatAdminCharacterBounds = (config: WritingEnvironmentConfig): string => {
  const { minCharacters, maxCharacters } = config.submission;
  if (minCharacters && maxCharacters) {
    return `${formatSummaryNumber(minCharacters)} - ${formatSummaryNumber(maxCharacters)} chars`;
  }
  if (minCharacters) return `Min ${formatSummaryNumber(minCharacters)}`;
  if (maxCharacters) return `Max ${formatSummaryNumber(maxCharacters)}`;
  return 'No length limit';
};

const formatAdminAiLimit = (config: WritingEnvironmentConfig): string => {
  if (normalizeWritingAiAccess(config.aiAccess) === 'off') return 'Not used';

  if (config.aiUsageLimit.mode === 'max_tokens') {
    return config.aiUsageLimit.maxTokens
      ? `Max ${formatSummaryNumber(config.aiUsageLimit.maxTokens)} tokens`
      : 'Token limited';
  }

  if (config.aiUsageLimit.mode === 'time_restricted') return 'Time restricted';
  if (config.aiUsageLimit.mode === 'unlimited') return 'Unlimited';
  return `Max ${formatSummaryNumber(config.aiUsageLimit.maxRequests || 100)} requests`;
};

const formatAdminTraceability = (config: WritingEnvironmentConfig): string => {
  const enabled = [
    config.traceability.trackTyping ? 'Typing' : null,
    config.traceability.trackCopyPaste ? 'Clipboard' : null,
    config.traceability.trackFocusBlur ? 'Focus' : null,
    config.traceability.trackAiUsage ? 'AI' : null,
  ].filter(Boolean);

  return enabled.length ? enabled.join(', ') : 'Minimal';
};

const formatAdminRecordingNotices = (config: WritingEnvironmentConfig): string => {
  const enabled = [
    config.traceability.requireScreenRecording ? 'Screen' : null,
    config.traceability.requireCameraRecording ? 'Camera' : null,
  ].filter(Boolean);

  return enabled.length ? enabled.join(', ') : 'Not requested';
};

const buildAdminEnvironmentSummary = ({
  config,
  aiAccess,
  selectedAiModel,
  timeLimitEnabled,
  startDate,
  endDate,
  allowGuestSubmissions,
}: {
  config: WritingEnvironmentConfig;
  aiAccess: WritingAiAccess;
  selectedAiModel: string;
  timeLimitEnabled: boolean;
  startDate?: string;
  endDate?: string;
  allowGuestSubmissions: boolean;
}): EnvironmentSummaryItem[] => {
  const normalizedAiAccess = normalizeWritingAiAccess(aiAccess);
  const model = config.allowedModels[0] || selectedAiModel;

  return [
    {
      label: 'AI access',
      value: formatWritingAiAccess(normalizedAiAccess),
      detail: normalizedAiAccess === 'off' ? 'Assistant disabled' : `Model: ${model || 'Not selected'}`,
    },
    {
      label: 'Task window',
      value: timeLimitEnabled ? 'Window on' : 'No task window',
      detail: timeLimitEnabled
        ? `${formatTaskWindowDate(startDate)} to ${formatTaskWindowDate(endDate)}`
        : 'Enrollment is always available',
    },
    {
      label: 'Session timer',
      value: config.time.timeLimitSeconds
        ? `${getTimeLimitMinutesValue(config.time.timeLimitSeconds)} min`
        : 'No limit',
      detail: 'In-editor countdown',
    },
    {
      label: 'Writing rules',
      value: normalizeCopyPastePolicy(config.copyPastePolicy) === 'blocked'
        ? 'Paste blocked'
        : 'Paste allowed',
      detail: formatAdminCharacterBounds(config),
    },
    {
      label: 'AI limit',
      value: formatAdminAiLimit(config),
      detail: 'Per enrolled writer',
    },
    {
      label: 'Submission',
      value: config.submission.mode === 'single' ? 'Single submission' : 'Multiple submissions',
      detail: allowGuestSubmissions ? 'Guests allowed' : 'Sign-in required',
    },
    {
      label: 'Traceability',
      value: formatAdminTraceability(config),
      detail: 'Captured evidence',
    },
    {
      label: 'Recording',
      value: formatAdminRecordingNotices(config),
      detail: 'Optional notices',
    },
  ];
};

export default function NewTaskPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [instructionFiles, setInstructionFiles] = useState<File[]>([]);
  const [aiAccess, setAiAccessState] = useState<WritingAiAccess>('off');
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_AI_BASE_URL);
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [hasExistingAiKey, setHasExistingAiKey] = useState(false);
  const [maskedAiKey, setMaskedAiKey] = useState('');
  const [isTestingAiConnection, setIsTestingAiConnection] = useState(false);
  const [aiConnectionResult, setAiConnectionResult] = useState<AiConnectionResult | null>(null);
  const [testedAiModels, setTestedAiModels] = useState<string[]>([]);
  const [environmentDialogOpen, setEnvironmentDialogOpen] = useState(false);
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(true);
  const [timeWindowDialogOpen, setTimeWindowDialogOpen] = useState(false);
  const [writingTimeLimitMinutesInput, setWritingTimeLimitMinutesInput] = useState('60');
  const [allowGuestSubmissions, setAllowGuestSubmissions] = useState(true);
  const [timeWindowTouched, setTimeWindowTouched] = useState(false);
  const [environmentSelection, setEnvironmentSelection] = useState<EnvironmentSelection>('default_writing');
  const [environmentConfig, setEnvironmentConfig] = useState<WritingEnvironmentConfig>(
    getAdminEnvironmentConfig('default_writing')
  );
  const initialDefaultTaskWindow = useMemo(() => getDefaultTaskWindowValues(), []);

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      name: '',
      description: '',
      aiUsageLimit: 100,
      startDate: initialDefaultTaskWindow.startDate,
      endDate: initialDefaultTaskWindow.endDate,
    },
  });

  const { isSubmitting } = form.formState;
  const watchedStartDate = form.watch('startDate');
  const watchedEndDate = form.watch('endDate');
  const localTimeZoneLabel = getLocalTimeZoneLabel();

  const validateStartDateWithinCreateWindow = (startDate?: string): boolean => {
    if (!timeLimitEnabled || !startDate) {
      form.clearErrors('startDate');
      return true;
    }

    if (isLocalStartDateTooFarInPast(startDate)) {
      if (environmentSelection === 'custom') {
        setEnvironmentDialogOpen(true);
      }
      setTimeWindowDialogOpen(true);
      form.setError('startDate', {
        type: 'validate',
        message: TASK_START_DATE_PAST_ERROR_MESSAGE,
      });
      return false;
    }

    form.clearErrors('startDate');
    return true;
  };

  const setDefaultTaskWindow = () => {
    const defaultWindow = getDefaultTaskWindowValues();
    form.setValue('startDate', defaultWindow.startDate, { shouldDirty: false });
    form.setValue('endDate', defaultWindow.endDate, { shouldDirty: false });
    setTimeWindowTouched(false);
    return defaultWindow;
  };

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

    return !whitelist?.length && aiModel && !options.includes(aiModel)
      ? [aiModel, ...options]
      : options;
  }, [aiBaseUrl, aiModel, testedAiModels]);

  const selectedAiModel = aiModel.trim();
  const shortcutTokensEnabled = isWritingAiPolishEnabled(aiAccess);
  const chatTokensEnabled = isWritingAiChatEnabled(aiAccess);
  const selectedAiProvider = AI_PROVIDER_OPTIONS.some((option) => option.value === aiBaseUrl)
    ? aiBaseUrl
    : DEFAULT_AI_BASE_URL;

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

  const setEnvironmentAiModel = (model: string) => {
    markCustom((current) => ({
      ...current,
      allowedModels: model ? [model] : [],
      customModels: [],
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
      setDefaultTaskWindow();
    }
  };

  const handleEnvironmentSelectionChange = (value: EnvironmentSelection) => {
    if (value === IMPORT_ENVIRONMENT_VALUE) {
      setEnvironmentSelection(value);
      setEnvironmentDialogOpen(false);
      return;
    }

    applyEnvironmentPreset(value);
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
      setEnvironmentSelection('custom');
      setEnvironmentConfig(config);
      setAiAccessState(config.aiAccess);
      syncAiModelFromEnvironment(config);
      setAiConnectionResult(null);
      setTestedAiModels([]);
      setWritingTimeLimitMinutesInput(getTimeLimitMinutesValue(config.time.timeLimitSeconds));
      form.setValue('aiUsageLimit', config.aiUsageLimit.maxRequests || 100);
      setEnvironmentDialogOpen(false);
      toast({
        title: 'Environment imported',
        description: 'The JSON configuration was applied to this task.',
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
      : aiModelOptions[0] || 'gpt-5.4-mini';

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

      const submittedData = timeLimitEnabled && !timeWindowTouched
        ? {
            ...data,
            ...setDefaultTaskWindow(),
          }
        : data;

      if (!validateStartDateWithinCreateWindow(submittedData.startDate)) {
        throw new Error(TASK_START_DATE_PAST_ERROR_MESSAGE);
      }

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
      if (timeLimitEnabled && (!submittedData.startDate || !submittedData.endDate)) {
        throw new Error('Select both start and end time when Time is on.');
      }

      const fallbackStart = new Date();
      const fallbackEnd = new Date(fallbackStart);
      fallbackEnd.setFullYear(fallbackEnd.getFullYear() + UNLIMITED_TASK_WINDOW_YEARS);

      const startTime = timeLimitEnabled && submittedData.startDate
        ? localDateTimeInputToISOString(submittedData.startDate)
        : fallbackStart.toISOString();
      const endTime = timeLimitEnabled && submittedData.endDate
        ? localDateTimeInputToISOString(submittedData.endDate)
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
        name: submittedData.name,
        description: submittedData.description || undefined,
        userIdKey: 'userId',
        allowedLlmModels: allowedModels.length ? allowedModels : undefined,
        aiUsageLimit: submittedData.aiUsageLimit,
        startDate: startTime,
        endDate: endTime,
        allowGuestSubmissions,
        environmentConfig: {
          ...environmentConfig,
          taskType: 'admin_assigned',
          aiAccess,
          aiProvider: resolvedAiProvider,
          allowedModels,
          customModels: [],
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

  const isImportingEnvironment = environmentSelection === IMPORT_ENVIRONMENT_VALUE;
  const showCustomEnvironmentSummary = environmentSelection === 'custom';
  const customEnvironmentSummaryItems = buildAdminEnvironmentSummary({
    config: environmentConfig,
    aiAccess,
    selectedAiModel,
    timeLimitEnabled,
    startDate: watchedStartDate,
    endDate: watchedEndDate,
    allowGuestSubmissions,
  });
  const customEnvironmentControls = (
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
              {WRITING_AI_ACCESS_OPTIONS.map((option) => (
                <SelectItem key={option.value} value={option.value}>
                  {option.label}
                </SelectItem>
              ))}
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

              <div className="grid gap-2">
                <FormLabel>Provider</FormLabel>
                <Select
                  value={selectedAiProvider}
                  onValueChange={(value) => {
                    setAiBaseUrl(value);
                    const nextModel = getWhitelist(value)?.[0] || '';
                    setAiModel(nextModel);
                    setEnvironmentAiModel(nextModel);
                    setAiConnectionResult(null);
                    setTestedAiModels([]);
                  }}
                  disabled={isSubmitting}
                >
                  <SelectTrigger aria-label="AI provider">
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {AI_PROVIDER_OPTIONS.map((option) => (
                      <SelectItem key={option.value} value={option.value}>
                        {option.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <div className="grid gap-2">
                <FormLabel htmlFor="ai-shortcut-max-tokens">Shortcut Tokens</FormLabel>
                <Input
                  id="ai-shortcut-max-tokens"
                  type="number"
                  min={AI_MAX_TOKENS_MIN}
                  max={AI_MAX_TOKENS_MAX}
                  value={shortcutTokensEnabled ? environmentConfig.aiTokenBudget?.shortcutMaxTokens || AI_SHORTCUT_MAX_TOKENS_DEFAULT : ''}
                  placeholder={shortcutTokensEnabled ? undefined : 'Not available in this mode'}
                  disabled={isSubmitting || !shortcutTokensEnabled}
                  onChange={(event) => setAiTokenBudget({
                    shortcutMaxTokens: Number(event.target.value) || AI_SHORTCUT_MAX_TOKENS_DEFAULT,
                  })}
                />
                <FormDescription>
                  {shortcutTokensEnabled
                    ? 'Shortcut actions and fallback answers.'
                    : 'Not available when AI access is chat only.'}
                </FormDescription>
              </div>

              <div className="grid gap-2">
                <FormLabel htmlFor="ai-chat-max-tokens">Chat Tokens</FormLabel>
                <Input
                  id="ai-chat-max-tokens"
                  type="number"
                  min={AI_MAX_TOKENS_MIN}
                  max={AI_MAX_TOKENS_MAX}
                  value={chatTokensEnabled ? environmentConfig.aiTokenBudget?.chatMaxTokens || AI_CHAT_MAX_TOKENS_DEFAULT : ''}
                  placeholder={chatTokensEnabled ? undefined : 'Not available in this mode'}
                  disabled={isSubmitting || !chatTokensEnabled}
                  onChange={(event) => setAiTokenBudget({
                    chatMaxTokens: Number(event.target.value) || AI_CHAT_MAX_TOKENS_DEFAULT,
                  })}
                />
                <FormDescription>
                  {chatTokensEnabled
                    ? 'Chat and retrieval tool turns, per model call.'
                    : 'Not available when AI access is polish only.'}
                </FormDescription>
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
          description="Set paste behavior and final submission length rules."
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
            <FormLabel htmlFor="minimum-characters">Minimum Submission Characters</FormLabel>
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
            <FormLabel htmlFor="maximum-characters">Maximum Submission Characters</FormLabel>
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
            These limits apply to the final submitted document, not copy-paste length.
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
          <div className="rounded-md border bg-muted/30 p-3">
            <div className="flex items-start gap-3">
              <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1 space-y-3">
                <div className="grid gap-2 text-sm">
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Start
                    </p>
                    <p className="mt-0.5 font-medium">
                      {formatTaskWindowDate(watchedStartDate)}
                    </p>
                  </div>
                  <div>
                    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      End
                    </p>
                    <p className="mt-0.5 font-medium">
                      {formatTaskWindowDate(watchedEndDate)}
                    </p>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground">
                  Admin local time: {localTimeZoneLabel}
                </p>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setTimeWindowDialogOpen(true)}
                  disabled={isSubmitting}
                >
                  Edit Time Window
                </Button>
              </div>
            </div>
            <Dialog open={timeWindowDialogOpen} onOpenChange={setTimeWindowDialogOpen}>
              <DialogContent className="w-[calc(100vw-2rem)] max-w-2xl">
                <DialogHeader>
                  <DialogTitle>Task Time Window</DialogTitle>
                  <DialogDescription>
                    Set when enrolled users can access and submit this task.
                  </DialogDescription>
                </DialogHeader>

                <div className="grid gap-5 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>
                          Task Start Date <span className="text-destructive">*</span>
                        </FormLabel>
                        <FormControl>
                          <Input
                            type="datetime-local"
                            {...field}
                            disabled={isSubmitting}
                            onChange={(event) => {
                              setTimeWindowTouched(true);
                              field.onChange(event);
                            }}
                            onBlur={(event) => {
                              field.onBlur();
                              validateStartDateWithinCreateWindow(event.target.value);
                            }}
                          />
                        </FormControl>
                        <FormDescription>
                          Shown in your local timezone: {localTimeZoneLabel}.
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
                          <Input
                            type="datetime-local"
                            {...field}
                            disabled={isSubmitting}
                            onChange={(event) => {
                              setTimeWindowTouched(true);
                              field.onChange(event);
                            }}
                          />
                        </FormControl>
                        <FormDescription>
                          Defaults to two weeks after the start time. Shown in your local timezone: {localTimeZoneLabel}.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <p className="rounded-md bg-muted/40 p-3 text-xs text-muted-foreground">
                  Students see the same absolute window converted into their own local time.
                  Your current timezone is {localTimeZoneLabel}.
                </p>

                <DialogFooter>
                  <Button
                    type="button"
                    onClick={() => setTimeWindowDialogOpen(false)}
                    disabled={isSubmitting}
                  >
                    Done
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
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

      <div className="space-y-4 rounded-md border p-4">
        <SectionHeading
          title="Recording Notices"
          description="Show optional evidence notices in enrolled writers' workspaces and certificates."
        />

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start gap-3 rounded-md border border-border/70 bg-muted/25 p-3 text-sm">
            <Checkbox
              checked={Boolean(environmentConfig.traceability.requireScreenRecording)}
              disabled={isSubmitting}
              onCheckedChange={(checked) => markCustom((current) => ({
                ...current,
                traceability: {
                  ...current.traceability,
                  requireScreenRecording: checked === true,
                },
              }))}
            />
            <span>
              <span className="block font-medium">Screen recording</span>
              <span className="block text-xs text-muted-foreground">
                Tell enrolled writers this task expects screen recording evidence.
              </span>
            </span>
          </label>

          <label className="flex items-start gap-3 rounded-md border border-border/70 bg-muted/25 p-3 text-sm">
            <Checkbox
              checked={Boolean(environmentConfig.traceability.requireCameraRecording)}
              disabled={isSubmitting}
              onCheckedChange={(checked) => markCustom((current) => ({
                ...current,
                traceability: {
                  ...current.traceability,
                  requireCameraRecording: checked === true,
                },
              }))}
            />
            <span>
              <span className="block font-medium">Camera recording</span>
              <span className="block text-xs text-muted-foreground">
                Tell enrolled writers this task expects camera recording evidence.
              </span>
            </span>
          </label>
        </div>
      </div>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-6xl py-2">
      <div className="mb-6">
        <Button variant="ghost" className="mb-4 px-0 hover:bg-transparent" onClick={() => router.push('/tasks')}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Tasks
        </Button>
        <h1 className="text-3xl font-bold tracking-normal">New Task</h1>
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

                <div className="rounded-lg border border-dashed border-border/80 bg-muted/20 p-4">
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
                        <div key={`${file.name}-${file.size}`} className="flex items-center gap-3 rounded-lg border border-border/70 bg-muted/40 p-3">
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

                <div className="rounded-lg border border-border/80 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <FormLabel htmlFor="allow-guest-submissions" className="text-sm font-medium">
                        Allow guest submissions from public link
                      </FormLabel>
                      <p className="mt-1 text-sm text-muted-foreground">
                        When off, visitors must sign in or create an account before writing from the share link.
                      </p>
                    </div>
                    <Checkbox
                      id="allow-guest-submissions"
                      checked={allowGuestSubmissions}
                      onCheckedChange={(checked) => setAllowGuestSubmissions(checked === true)}
                      disabled={isSubmitting}
                    />
                  </div>
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

                {!showCustomEnvironmentSummary && !isImportingEnvironment && (
                  <div className="rounded-lg border border-border/70 bg-muted/35 p-3">
                    <div className="flex items-start gap-3">
                      <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#6f8a78]" />
                      <div>
                        <p className="font-medium">Default Environment</p>
                        <p className="text-sm text-muted-foreground">
                          A standard task setup with authorship tracking, no AI assistant, and a two-week writing window.
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
                        <p className="mt-1 text-sm font-medium">Two-week window</p>
                      </div>
                    </div>

                    <p className="mt-3 text-sm text-muted-foreground">
                      Choose Custom to configure AI access, copy-paste rules, or task timing.
                    </p>
                  </div>
                )}

                {showCustomEnvironmentSummary && (
                  <div className="rounded-lg border border-border/70 bg-muted/35 p-3">
                    <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                      <div className="flex min-w-0 items-start gap-3">
                        <CheckCircle className="mt-0.5 h-4 w-4 shrink-0 text-[#6f8a78]" />
                        <div>
                          <p className="font-medium">Custom Environment</p>
                          <p className="text-sm text-muted-foreground">
                            Configure AI, copy-paste, task window, and session timer in a separate dialog.
                          </p>
                        </div>
                      </div>

                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setEnvironmentDialogOpen(true)}
                        disabled={isSubmitting}
                      >
                        Edit Settings
                      </Button>
                    </div>

                    <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                      {customEnvironmentSummaryItems.map((item) => (
                        <div key={item.label} className="rounded-lg border border-border/60 bg-background p-2.5">
                          <p className="humanly-eyebrow">{item.label}</p>
                          <p className="mt-1 text-sm font-medium">{item.value}</p>
                          {item.detail && (
                            <p className="mt-1 text-xs text-muted-foreground">{item.detail}</p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </CardContent>

            <CardFooter className="flex justify-end gap-3 border-t border-border/70 pt-4">
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

          <Dialog open={environmentDialogOpen} onOpenChange={setEnvironmentDialogOpen}>
            <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Custom Environment</DialogTitle>
                <DialogDescription>
                  Configure AI access, task availability, writing session timing, and submission rules before creating this task.
                </DialogDescription>
              </DialogHeader>

              {customEnvironmentControls}

              <DialogFooter>
                <Button
                  type="button"
                  onClick={() => setEnvironmentDialogOpen(false)}
                  disabled={isSubmitting}
                >
                  Done
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </Form>
      </Card>
    </div>
  );
}

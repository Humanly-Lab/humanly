'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  Check,
  Download,
  FileText,
  Loader2,
} from 'lucide-react';
import {
  AI_CHAT_MAX_TOKENS_DEFAULT,
  AI_MAX_TOKENS_MAX,
  AI_MAX_TOKENS_MIN,
  AI_SHORTCUT_MAX_TOKENS_DEFAULT,
  DEFAULT_WRITING_ENVIRONMENT_CONFIG,
  SUBMISSION_MAX_CHARACTERS_MAX,
  SUBMISSION_MIN_CHARACTERS_MAX,
  WRITING_AI_ACCESS_OPTIONS,
  WRITING_AI_POLICY_OPTIONS,
  WRITING_AI_MODELS,
  formatWritingAiAccess,
  isWritingAiChatEnabled,
  isWritingAiPolishEnabled,
  normalizeWritingAiPolicy,
  normalizeWritingAiAccess,
  normalizeCopyPastePolicy,
  normalizeResourceAccessPolicy,
  type Task,
  type WritingAiAccess,
  type WritingAiPolicyMode,
  type WritingAiProvider,
  type WritingAiProviderConfig,
  type WritingEnvironmentConfig,
} from '@humanly/shared';

import { api } from '@/lib/api-client';
import { MODEL_WHITELIST, getWhitelist } from '@/lib/ai-models';
import { downloadBlob } from '@/lib/download';
import {
  cn,
  getLocalTimeZoneLabel,
  localDateTimeInputToISOString,
  toLocalDateTimeInputValue,
} from '@/lib/utils';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
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
import { RadioGroup } from '@/components/ui/radio-group';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import {
  AdminEnvironmentDialogSection,
  AdminEnvironmentSummary,
  type AdminEnvironmentSummaryItem,
} from '@/components/admin-environment-ui';

const taskSettingsSchema = z.object({
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

type TaskSettingsFormData = z.infer<typeof taskSettingsSchema>;

const DEFAULT_AI_BASE_URL = 'https://api.together.xyz/v1';
const OPENROUTER_BASE_URL = 'https://openrouter.ai/api/v1';
const OPENAI_BASE_URL = 'https://api.openai.com/v1';
const CLAUDE_BASE_URL = 'https://api.anthropic.com/v1';

const fallbackWritingModels = () => (
  WRITING_AI_MODELS.filter((model) => model !== 'Custom models')
);

const getTimeLimitMinutesValue = (seconds?: number): string => (
  String(Math.max(1, Math.round((seconds || 3600) / 60)))
);

const parseTimeLimitMinutes = (value: string, fallback = 1): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.max(1, Math.round(parsed));
};

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

const buildConfigFilename = (name?: string | null) => {
  const normalized = (name || 'task')
    .trim()
    .replace(/[^a-z0-9_-]+/gi, '_')
    .replace(/^_+|_+$/g, '');

  return `${normalized || 'task'}-environment-config.json`;
};

const formatDateTimeSummary = (value?: string) => {
  if (!value) return 'Not set';

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.replace('T', ' ');

  return new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
};

const formatCharacterBounds = (submission: WritingEnvironmentConfig['submission']) => {
  const min = submission.minCharacters;
  const max = submission.maxCharacters;

  if (min && max) return `${min.toLocaleString()}-${max.toLocaleString()} submission characters`;
  if (min) return `At least ${min.toLocaleString()} submission characters`;
  if (max) return `Up to ${max.toLocaleString()} submission characters`;
  return 'No submission length limit';
};

type SegmentedOption = {
  value: string;
  label: string;
};

function SegmentedControl({
  ariaLabel,
  disabled,
  onValueChange,
  options,
  value,
}: {
  ariaLabel: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  options: SegmentedOption[];
  value: string;
}) {
  return (
    <RadioGroup
      aria-label={ariaLabel}
      className="inline-flex rounded-md border border-input bg-muted/30 p-0.5"
      value={value}
      onValueChange={onValueChange}
    >
      {options.map((option) => {
        const selected = value === option.value;
        const disabledSelected = disabled && selected;

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            className={cn(
              'inline-flex h-8 min-w-16 items-center justify-center gap-1.5 rounded-[5px] px-3 text-sm font-medium transition-colors',
              selected && !disabledSelected && 'bg-background text-foreground shadow-sm',
              !selected && 'text-muted-foreground hover:text-foreground',
              disabledSelected && 'border border-border bg-muted text-foreground shadow-sm',
              disabled && !selected && 'cursor-not-allowed opacity-45',
              disabledSelected && 'cursor-not-allowed opacity-100'
            )}
            onClick={() => onValueChange(option.value)}
          >
            {disabledSelected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
            {option.label}
          </button>
        );
      })}
    </RadioGroup>
  );
}

function SettingRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
      <FormLabel className="text-sm font-medium">{label}</FormLabel>
      <div className="sm:flex sm:min-w-[220px] sm:justify-end">
        {children}
      </div>
    </div>
  );
}

type TaskInstructionFile = {
  id: string;
  purpose: string;
  title: string;
};

interface SettingsPanelProps {
  taskId: string;
  onTaskUpdated?: (task: Task) => void;
}

const mergeEnvironmentConfig = (config?: WritingEnvironmentConfig | null): WritingEnvironmentConfig => ({
  ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
  ...(config || {}),
  aiAccess: normalizeWritingAiAccess(config?.aiAccess),
  resourceAccess: normalizeResourceAccessPolicy(config?.resourceAccess),
  copyPastePolicy: normalizeCopyPastePolicy(config?.copyPastePolicy),
  taskType: 'admin_assigned',
  preset: 'custom',
  instructions: {
    ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.instructions,
    ...(config?.instructions || {}),
  },
  aiUsageLimit: {
    mode: 'max_requests',
    maxRequests: config?.aiUsageLimit?.maxRequests || 100,
  },
  aiTokenBudget: {
    shortcutMaxTokens: config?.aiTokenBudget?.shortcutMaxTokens || AI_SHORTCUT_MAX_TOKENS_DEFAULT,
    chatMaxTokens: config?.aiTokenBudget?.chatMaxTokens || AI_CHAT_MAX_TOKENS_DEFAULT,
  },
  aiPolicy: normalizeWritingAiPolicy(config?.aiPolicy),
  time: {
    ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.time,
    ...(config?.time || {}),
  },
  submission: {
    ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.submission,
    ...(config?.submission || {}),
  },
  traceability: {
    ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.traceability,
    ...(config?.traceability || {}),
  },
});

export function SettingsPanel({ taskId }: SettingsPanelProps) {
  const { toast } = useToast();

  const [task, setTask] = useState<Task | null>(null);
  const [files, setFiles] = useState<TaskInstructionFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [environmentDialogOpen, setEnvironmentDialogOpen] = useState(false);

  const [environmentConfig, setEnvironmentConfig] = useState<WritingEnvironmentConfig>({
    ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
    taskType: 'admin_assigned',
    preset: 'custom',
    aiAccess: 'off',
    allowedModels: [],
    aiUsageLimit: {
      mode: 'max_requests',
      maxRequests: 100,
    },
  });
  const [aiAccess, setAiAccessState] = useState<WritingAiAccess>('off');
  const [aiBaseUrl, setAiBaseUrl] = useState(DEFAULT_AI_BASE_URL);
  const [aiModel, setAiModel] = useState('');
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(false);
  const [writingTimeLimitMinutesInput, setWritingTimeLimitMinutesInput] = useState('60');
  const [allowGuestSubmissions, setAllowGuestSubmissions] = useState(true);

  const form = useForm<TaskSettingsFormData>({
    resolver: zodResolver(taskSettingsSchema),
    defaultValues: {
      name: '',
      description: '',
      aiUsageLimit: 100,
      startDate: toLocalDateTimeInputValue(new Date()),
      endDate: toLocalDateTimeInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
    },
  });

  const currentInstructionFiles = files.filter((file) => file.purpose === 'task_instruction_pdf');
  const selectedAiModel = aiModel.trim();
  const shortcutTokensEnabled = isWritingAiPolishEnabled(aiAccess);
  const chatTokensEnabled = isWritingAiChatEnabled(aiAccess);
  const selectedAiProvider = AI_PROVIDER_OPTIONS.some((option) => option.value === aiBaseUrl)
    ? aiBaseUrl
    : DEFAULT_AI_BASE_URL;

  const aiModelOptions = useMemo(() => {
    const whitelist = getWhitelist(aiBaseUrl);
    const options = whitelist?.length ? whitelist : fallbackWritingModels();

    return !whitelist?.length && aiModel && !options.includes(aiModel)
      ? [aiModel, ...options]
      : options;
  }, [aiBaseUrl, aiModel]);

  const fetchInstructionFiles = useCallback(async () => {
    const response = await api.get<{
      success: boolean;
      data: TaskInstructionFile[];
    }>(`/api/v1/tasks/${taskId}/files`);
    setFiles(response.data);
  }, [taskId]);

  useEffect(() => {
    let cancelled = false;

    const fetchTask = async () => {
      try {
        setIsLoading(true);
        setError(null);

        const response = await api.get<{
          success: boolean;
          data: Task;
        }>(`/api/v1/tasks/${taskId}`);

        if (cancelled) return;

        const taskFromApi = response.data;
        const mergedConfig = mergeEnvironmentConfig(taskFromApi.environmentConfig);
        const existingModel = (
          mergedConfig.allowedModels?.[0] ||
          taskFromApi.allowedLlmModels?.[0] ||
          ''
        );
        const existingAiAccess = normalizeWritingAiAccess(mergedConfig.aiAccess);
        const hasTimeLimit = !!(mergedConfig.time.startTime || mergedConfig.time.endTime);
        const existingLimit = (
          mergedConfig.aiUsageLimit.maxRequests ||
          taskFromApi.aiUsageLimit ||
          100
        );
        const startDateInput = mergedConfig.time.startTime || taskFromApi.startDate
          ? toLocalDateTimeInputValue(mergedConfig.time.startTime || taskFromApi.startDate)
          : toLocalDateTimeInputValue(new Date());
        const endDateInput = mergedConfig.time.endTime || taskFromApi.endDate
          ? toLocalDateTimeInputValue(mergedConfig.time.endTime || taskFromApi.endDate)
          : toLocalDateTimeInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000));

        setTask(taskFromApi);
        setAllowGuestSubmissions(taskFromApi.allowGuestSubmissions !== false);
        if (mergedConfig.aiProvider?.baseUrl) {
          setAiBaseUrl(mergedConfig.aiProvider.baseUrl);
        }
        setEnvironmentConfig({
          ...mergedConfig,
          aiAccess: existingAiAccess,
          allowedModels: existingAiAccess === 'off' ? [] : existingModel ? [existingModel] : mergedConfig.allowedModels,
          aiUsageLimit: {
            mode: 'max_requests',
            maxRequests: existingLimit,
          },
        });
        setAiAccessState(existingAiAccess);
        setAiModel(existingModel);
        setTimeLimitEnabled(hasTimeLimit);
        setWritingTimeLimitMinutesInput(getTimeLimitMinutesValue(mergedConfig.time.timeLimitSeconds));

        form.reset({
          name: taskFromApi.name,
          description: taskFromApi.description || '',
          aiUsageLimit: existingLimit,
          startDate: startDateInput,
          endDate: endDateInput,
        });

        await fetchInstructionFiles();
      } catch (err: any) {
        if (!cancelled) {
          const message = err.message || 'Failed to load task settings';
          setError(message);
          toast({
            title: 'Error',
            description: message,
            variant: 'destructive',
          });
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    };

    if (taskId) {
      fetchTask();
    }

    return () => {
      cancelled = true;
    };
  }, [fetchInstructionFiles, form, taskId, toast]);

  const updateEnvironment = (patch: Partial<WritingEnvironmentConfig>) => {
    setEnvironmentConfig((current) => ({
      ...current,
      ...patch,
    }));
  };

  const setEnvironmentAiModel = (model: string) => {
    setEnvironmentConfig((current) => ({
      ...current,
      allowedModels: model ? [model] : [],
      customModels: [],
    }));
  };

  useEffect(() => {
    const whitelist = getWhitelist(aiBaseUrl);
    if (
      aiAccess !== 'off' &&
      whitelist?.length &&
      !whitelist.includes(aiModel)
    ) {
      setAiModel(whitelist[0]);
      setEnvironmentAiModel(whitelist[0]);
    }
  }, [aiAccess, aiBaseUrl, aiModel]);

  const setAiTokenBudget = (patch: NonNullable<WritingEnvironmentConfig['aiTokenBudget']>) => {
    setEnvironmentConfig((current) => ({
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
    setEnvironmentConfig((current) => ({
      ...current,
      submission: {
        ...current.submission,
        minCharacters,
      },
    }));
  };

  const setSubmissionMaximumCharacters = (value: string) => {
    const maxCharacters = parseOptionalMaxCharacters(value);
    setEnvironmentConfig((current) => ({
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

    setEnvironmentConfig((current) => {
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
    setEnvironmentConfig((current) => ({
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
    setEnvironmentConfig((current) => ({
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

    setEnvironmentConfig((current) => ({
      ...current,
      aiAccess: nextAccess,
      allowedModels: nextAccess === 'off'
        ? []
        : current.allowedModels.length
          ? current.allowedModels
          : [defaultModel],
      customModels: nextAccess === 'off' ? [] : current.customModels,
      aiPolicy: isWritingAiChatEnabled(nextAccess)
        ? normalizeWritingAiPolicy(current.aiPolicy)
        : { mode: 'off' },
      traceability: {
        ...current.traceability,
        trackAiUsage: nextAccess !== 'off',
      },
    }));
  };

  const setAiPolicyMode = (mode: WritingAiPolicyMode) => {
    setEnvironmentConfig((current) => ({
      ...current,
      aiPolicy: mode === 'guard'
        ? {
            mode: 'guard',
            rejectionRule: normalizeWritingAiPolicy(current.aiPolicy).rejectionRule || '',
          }
        : { mode: 'off' },
    }));
  };

  const setAiPolicyRejectionRule = (rejectionRule: string) => {
    setEnvironmentConfig((current) => ({
      ...current,
      aiPolicy: {
        mode: 'guard',
        rejectionRule,
      },
    }));
  };

  const buildCurrentEnvironmentConfig = (data: TaskSettingsFormData): WritingEnvironmentConfig => {
    const allowedModels = aiAccess === 'off' ? [] : selectedAiModel ? [selectedAiModel] : [];
    const resolvedAiProvider = aiAccess === 'off'
      ? undefined
      : resolveAiProviderConfig(selectedAiModel, aiBaseUrl, environmentConfig.aiProvider);
    const startTime = timeLimitEnabled && data.startDate
      ? localDateTimeInputToISOString(data.startDate)
      : undefined;
    const endTime = timeLimitEnabled && data.endDate
      ? localDateTimeInputToISOString(data.endDate)
      : undefined;
    const writingTimeLimitSeconds = environmentConfig.time.timeLimitSeconds
      ? parseTimeLimitMinutes(
          writingTimeLimitMinutesInput,
          Number(getTimeLimitMinutesValue(environmentConfig.time.timeLimitSeconds))
        ) * 60
      : undefined;
    const hasInstructionPdf = currentInstructionFiles.length > 0;
    const effectiveAiPolicy = isWritingAiChatEnabled(aiAccess)
      ? normalizeWritingAiPolicy(environmentConfig.aiPolicy)
      : { mode: 'off' as const };

    return {
      ...environmentConfig,
      taskType: 'admin_assigned',
      preset: 'custom',
      aiAccess,
      aiProvider: resolvedAiProvider,
      allowedModels,
      customModels: [],
      aiPolicy: effectiveAiPolicy,
      instructions: {
        ...environmentConfig.instructions,
        hasInstructionPdf,
      },
      aiUsageLimit: {
        mode: 'max_requests',
        maxRequests: Number(data.aiUsageLimit) || 100,
      },
      time: {
        ...environmentConfig.time,
        startTime,
        endTime,
        timeLimitSeconds: writingTimeLimitSeconds,
        lateSubmission: timeLimitEnabled ? 'not_allowed' : 'allowed',
      },
      traceability: {
        ...environmentConfig.traceability,
        trackAiUsage: aiAccess !== 'off',
        trackCopyPaste: normalizeCopyPastePolicy(environmentConfig.copyPastePolicy) === 'allowed',
      },
      resourceAccess: normalizeResourceAccessPolicy(environmentConfig.resourceAccess),
    };
  };

  const handleExportConfig = () => {
    const config = buildCurrentEnvironmentConfig(form.getValues());
    const blob = new Blob(
      [JSON.stringify(config, null, 2)],
      { type: 'application/json' }
    );

    downloadBlob(blob, buildConfigFilename(form.getValues('name') || task?.name));
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  if (!task) {
    return null;
  }

  const controlsDisabled = true;
  const localTimeZoneLabel = getLocalTimeZoneLabel();
  const watchedStartDate = form.watch('startDate');
  const watchedEndDate = form.watch('endDate');
  const writingSessionMinutes = getTimeLimitMinutesValue(environmentConfig.time.timeLimitSeconds);
  const environmentSummaryItems: AdminEnvironmentSummaryItem[] = [
    {
      label: 'AI',
      value: formatWritingAiAccess(aiAccess),
      detail: aiAccess === 'off'
        ? 'Assistant disabled'
        : selectedAiModel || 'Model not selected',
    },
    {
      label: 'Availability',
      value: timeLimitEnabled ? 'Window on' : 'Off',
      detail: timeLimitEnabled
        ? `${formatDateTimeSummary(watchedStartDate)} - ${formatDateTimeSummary(watchedEndDate)}`
        : 'No visible task window restriction',
    },
    {
      label: 'Writing Session',
      value: environmentConfig.time.timeLimitSeconds ? `${writingSessionMinutes} min` : 'No limit',
      detail: environmentConfig.time.timeLimitSeconds
        ? 'Countdown shown while writing'
        : 'No session countdown',
    },
    {
      label: 'Writing Rules',
      value: normalizeCopyPastePolicy(environmentConfig.copyPastePolicy) === 'blocked'
        ? 'Paste blocked'
        : 'Paste allowed',
      detail: formatCharacterBounds(environmentConfig.submission),
    },
    {
      label: 'Instruction PDF Access',
      value: normalizeResourceAccessPolicy(environmentConfig.resourceAccess) === 'view-only'
        ? 'View only'
        : 'View and download',
      detail: normalizeResourceAccessPolicy(environmentConfig.resourceAccess) === 'view-only'
        ? 'Writers can view instruction PDFs in the workspace.'
        : 'Writers can view and download instruction PDFs.',
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight">Task Settings</h2>
        </div>
        <Button type="button" variant="outline" size="sm" onClick={handleExportConfig}>
          <Download className="mr-2 h-4 w-4" />
          Export Config
        </Button>
      </div>

      <Form {...form}>
        <form className="space-y-6">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Task Details</CardTitle>
                <CardDescription>
                  Task settings are read-only after creation so submitted documents and certificates stay consistent.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <FormField
                  control={form.control}
                  name="name"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Task Name</FormLabel>
                      <FormControl>
                        <Input placeholder="Research Reflection Assignment" {...field} disabled />
                      </FormControl>
                      <FormDescription>
                        A user-facing title shown on the admin dashboard and enrolled user documents.
                      </FormDescription>
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
                          disabled
                        />
                      </FormControl>
                      <FormDescription>
                        This description is stored with the task and shown in task context.
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="rounded-md border border-dashed p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <FileText className="h-4 w-4 text-muted-foreground" />
                        Files
                      </div>
                      <p className="mt-1 text-sm text-muted-foreground">
                        Existing PDF instruction files attached when this task was created.
                      </p>
                    </div>
                  </div>

                  {currentInstructionFiles.length > 0 ? (
                    <div className="mt-3 space-y-2">
                      {currentInstructionFiles.map((file) => (
                        <div key={file.id} className="flex items-center gap-3 rounded-md border bg-muted/40 p-3">
                          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium" title={file.title}>
                              {file.title}
                            </p>
                            <p className="text-xs text-muted-foreground">
                              Existing PDF
                            </p>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-3 text-sm text-muted-foreground">No instruction PDFs attached.</p>
                  )}

                </div>

                <div className="rounded-md border border-border/80 bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="min-w-0">
                      <FormLabel htmlFor="settings-allow-guest-submissions" className="text-sm font-medium">
                        Allow guest submissions from public link
                      </FormLabel>
                      <FormDescription className="mt-1">
                        When off, visitors must sign in or create an account before writing from the share link.
                      </FormDescription>
                    </div>
                    <Checkbox
                      id="settings-allow-guest-submissions"
                      checked={allowGuestSubmissions}
                      onCheckedChange={(checked) => setAllowGuestSubmissions(checked === true)}
                      disabled
                    />
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <CardTitle>Environment</CardTitle>
                  <CardDescription>
                    Review the task controls captured for enrolled writers and certificate evidence.
                  </CardDescription>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setEnvironmentDialogOpen(true)}
                >
                  View Environment
                </Button>
              </CardHeader>
              <CardContent>
                <AdminEnvironmentSummary items={environmentSummaryItems} />
              </CardContent>
            </Card>
          </div>

        </form>

        <Dialog open={environmentDialogOpen} onOpenChange={setEnvironmentDialogOpen}>
          <DialogContent className="max-h-[85vh] w-[calc(100vw-2rem)] max-w-5xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>View Environment</DialogTitle>
              <DialogDescription>
                Review AI access, task availability, writing session timing, and submission rules.
              </DialogDescription>
            </DialogHeader>

            <div className="grid gap-4 lg:grid-cols-2">
              <AdminEnvironmentDialogSection
                className="lg:col-span-2"
                title="AI"
                description="Control whether this task can use assistant support."
              >
                <div className="grid gap-4 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
                  <div className="space-y-2">
                    <FormLabel htmlFor="ai-access">Access</FormLabel>
                    <select
                      id="ai-access"
                      aria-label="AI"
                      className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={aiAccess}
                      disabled={controlsDisabled}
                      onChange={(event) => setAiAccess(event.target.value as WritingAiAccess)}
                    >
                      {WRITING_AI_ACCESS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  {aiAccess === 'off' ? (
                    <div className="rounded-md border border-border/70 bg-muted/25 p-3 text-sm text-muted-foreground">
                      AI assistant access is disabled for enrolled users.
                    </div>
                  ) : (
                    <div className="space-y-5 rounded-md border border-border/70 bg-muted/10 p-4">
                      <div className="grid gap-4 md:grid-cols-2">
                        <div className="space-y-2">
                          <FormLabel htmlFor="ai-provider">Provider</FormLabel>
                          <select
                            id="ai-provider"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={selectedAiProvider}
                            disabled={controlsDisabled}
                            onChange={(event) => {
                              const nextBaseUrl = event.target.value;
                              setAiBaseUrl(nextBaseUrl);
                              const nextModel = getWhitelist(nextBaseUrl)?.[0] || '';
                              setAiModel(nextModel);
                              setEnvironmentAiModel(nextModel);
                            }}
                          >
                            {AI_PROVIDER_OPTIONS.map((option) => (
                              <option key={option.value} value={option.value}>
                                {option.label}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div className="space-y-2">
                          <FormLabel htmlFor="ai-model">Model</FormLabel>
                          <select
                            id="ai-model"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                            value={aiModel}
                            disabled={controlsDisabled}
                            onChange={(event) => {
                              const value = event.target.value;
                              setAiModel(value);
                              setEnvironmentAiModel(value);
                            }}
                          >
                            {aiModelOptions.map((model) => (
                              <option key={model} value={model}>
                                {model}
                              </option>
                            ))}
                          </select>
                        </div>

                        <FormField
                          control={form.control}
                          name="aiUsageLimit"
                          render={({ field }) => (
                            <FormItem>
                              <FormLabel>AI Usage Limit</FormLabel>
                              <FormControl>
                                <Input
                                  type="number"
                                  min={1}
                                  placeholder="100"
                                  {...field}
                                  disabled={controlsDisabled}
                                />
                              </FormControl>
                              <FormMessage />
                            </FormItem>
                          )}
                        />
                      </div>

                      {chatTokensEnabled && (
                        <div className="grid gap-4 rounded-md border border-border/70 bg-background p-4">
                          <div className="space-y-2">
                            <FormLabel htmlFor="ai-policy-enforcement">AI Policy Enforcement</FormLabel>
                            <select
                              id="ai-policy-enforcement"
                              aria-label="AI policy enforcement"
                              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                              value={normalizeWritingAiPolicy(environmentConfig.aiPolicy).mode}
                              disabled={controlsDisabled}
                              onChange={(event) => setAiPolicyMode(event.target.value as WritingAiPolicyMode)}
                            >
                              {WRITING_AI_POLICY_OPTIONS.map((option) => (
                                <option key={option.value} value={option.value}>
                                  {option.label}
                                </option>
                              ))}
                            </select>
                          </div>

                          {normalizeWritingAiPolicy(environmentConfig.aiPolicy).mode === 'guard' && (
                            <div className="space-y-2">
                              <FormLabel htmlFor="ai-policy-rejection-rule">Rejection Rule</FormLabel>
                              <Textarea
                                id="ai-policy-rejection-rule"
                                aria-label="AI rejection rule"
                                value={normalizeWritingAiPolicy(environmentConfig.aiPolicy).rejectionRule || ''}
                                onChange={(event) => setAiPolicyRejectionRule(event.target.value)}
                                placeholder="Example: Refuse to produce evaluative claims; only help with grammar, wording, or understanding references."
                                className="min-h-24"
                                disabled={controlsDisabled}
                              />
                              <FormDescription>
                                Applies only to agent chat in Chat or Full mode.
                              </FormDescription>
                            </div>
                          )}
                        </div>
                      )}

                      <details className="rounded-md border border-border/70 bg-background p-4">
                        <summary className="cursor-pointer text-sm font-medium">
                          Advanced AI
                        </summary>
                        <div className="mt-4 grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <FormLabel htmlFor="ai-shortcut-max-tokens">Shortcut Tokens</FormLabel>
                            <Input
                              id="ai-shortcut-max-tokens"
                              type="number"
                              min={AI_MAX_TOKENS_MIN}
                              max={AI_MAX_TOKENS_MAX}
                              value={shortcutTokensEnabled ? environmentConfig.aiTokenBudget?.shortcutMaxTokens || AI_SHORTCUT_MAX_TOKENS_DEFAULT : ''}
                              placeholder={shortcutTokensEnabled ? undefined : 'Not available in this mode'}
                              disabled={controlsDisabled || !shortcutTokensEnabled}
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

                          <div className="space-y-2">
                            <FormLabel htmlFor="ai-chat-max-tokens">Chat Tokens</FormLabel>
                            <Input
                              id="ai-chat-max-tokens"
                              type="number"
                              min={AI_MAX_TOKENS_MIN}
                              max={AI_MAX_TOKENS_MAX}
                              value={chatTokensEnabled ? environmentConfig.aiTokenBudget?.chatMaxTokens || AI_CHAT_MAX_TOKENS_DEFAULT : ''}
                              placeholder={chatTokensEnabled ? undefined : 'Not available in this mode'}
                              disabled={controlsDisabled || !chatTokensEnabled}
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
                      </details>
                    </div>
                  )}
                </div>
              </AdminEnvironmentDialogSection>

              <AdminEnvironmentDialogSection
                title="Task Availability"
                description={`Review the task availability window shown to enrolled users. Times are shown in your local timezone: ${localTimeZoneLabel}.`}
              >
                <SettingRow label="Time">
                  <SegmentedControl
                    ariaLabel="Time"
                    value={timeLimitEnabled ? 'on' : 'off'}
                    disabled={controlsDisabled}
                    options={[
                      { value: 'off', label: 'Off' },
                      { value: 'on', label: 'On' },
                    ]}
                    onValueChange={(value) => setTimeLimitEnabled(value === 'on')}
                  />
                </SettingRow>

                {timeLimitEnabled && (
                  <div className="grid gap-4">
                    <FormField
                      control={form.control}
                      name="startDate"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Task Start Date</FormLabel>
                          <FormControl>
                            <Input
                              type="datetime-local"
                              {...field}
                              disabled={controlsDisabled}
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
                          <FormLabel>Task End Date</FormLabel>
                          <FormControl>
                            <Input type="datetime-local" {...field} disabled={controlsDisabled} />
                          </FormControl>
                          <FormDescription>
                            Shown in your local timezone: {localTimeZoneLabel}.
                          </FormDescription>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </AdminEnvironmentDialogSection>

              <AdminEnvironmentDialogSection
                title="Writing Session"
                description="Review whether the writing session has a time limit."
              >
                <div className="grid gap-2">
                  <FormLabel htmlFor="writing-session-time-mode">Time</FormLabel>
                  <select
                    id="writing-session-time-mode"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={environmentConfig.time.timeLimitSeconds ? 'time_limited' : 'unlimited'}
                    disabled={controlsDisabled}
                    onChange={(event) => setWritingSessionTimerEnabled(event.target.value === 'time_limited')}
                  >
                    <option value="unlimited">No limitations</option>
                    <option value="time_limited">Time limited</option>
                  </select>
                </div>

                {environmentConfig.time.timeLimitSeconds && (
                  <div className="grid gap-2">
                    <FormLabel htmlFor="writing-time-limit-minutes">Time Limit (minutes)</FormLabel>
                    <Input
                      id="writing-time-limit-minutes"
                      type="number"
                      min={1}
                      value={writingTimeLimitMinutesInput}
                      onChange={(event) => setWritingSessionTimerMinutes(event.target.value)}
                      onBlur={commitWritingSessionTimerMinutes}
                      disabled={controlsDisabled}
                    />
                  </div>
                )}
              </AdminEnvironmentDialogSection>

              <AdminEnvironmentDialogSection
                className="lg:col-span-2"
                title="Writing Rules"
                description="Review paste behavior and final submission length rules."
              >
                <div className="grid gap-5 lg:grid-cols-[minmax(0,0.7fr)_minmax(0,1.3fr)]">
                  <SettingRow label="Copy-Paste Policy">
                    <SegmentedControl
                      ariaLabel="Copy-Paste Policy"
                      value={normalizeCopyPastePolicy(environmentConfig.copyPastePolicy)}
                      disabled={controlsDisabled}
                      options={[
                        { value: 'allowed', label: 'Allowed' },
                        { value: 'blocked', label: 'Blocked' },
                      ]}
                      onValueChange={(value) => updateEnvironment({
                        copyPastePolicy: normalizeCopyPastePolicy(value),
                      })}
                    />
                  </SettingRow>

                  <SettingRow label="Instruction PDF Access">
                    <SegmentedControl
                      ariaLabel="Instruction PDF Access"
                      value={normalizeResourceAccessPolicy(environmentConfig.resourceAccess)}
                      disabled={controlsDisabled}
                      options={[
                        { value: 'downloadable', label: 'View and download' },
                        { value: 'view-only', label: 'View only' },
                      ]}
                      onValueChange={(value) => updateEnvironment({
                        resourceAccess: normalizeResourceAccessPolicy(value),
                      })}
                    />
                  </SettingRow>

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
                        disabled={controlsDisabled}
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
                        disabled={controlsDisabled}
                      />
                    </div>
                    <FormDescription className="sm:col-span-2">
                      These limits apply to the final submitted document, not copy-paste length.
                    </FormDescription>
                  </div>
                </div>
              </AdminEnvironmentDialogSection>
            </div>

            <DialogFooter>
              <Button
                type="button"
                onClick={() => setEnvironmentDialogOpen(false)}
              >
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </Form>
    </div>
  );
}

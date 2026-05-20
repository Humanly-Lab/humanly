'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent, type ReactNode } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  CheckCircle,
  ChevronDown,
  Download,
  FileText,
  Key,
  Loader2,
  RefreshCcw,
  Trash2,
  Upload,
  X,
  XCircle,
} from 'lucide-react';
import {
  AI_CHAT_MAX_TOKENS_DEFAULT,
  AI_MAX_TOKENS_MAX,
  AI_MAX_TOKENS_MIN,
  AI_SHORTCUT_MAX_TOKENS_DEFAULT,
  DEFAULT_WRITING_ENVIRONMENT_CONFIG,
  SUBMISSION_MAX_CHARACTERS_MAX,
  SUBMISSION_MIN_CHARACTERS_MAX,
  WRITING_AI_MODELS,
  normalizeCopyPastePolicy,
  type Task,
  type UserAISettings,
  type WritingAiAccess,
  type WritingEnvironmentConfig,
} from '@humanly/shared';

import { api } from '@/lib/api-client';
import { getWhitelist } from '@/lib/ai-models';
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
import { useToast } from '@/components/ui/use-toast';

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
const CUSTOM_MODEL_VALUE = '__custom_model__';
const USE_EXISTING_AI_KEY = '__use_existing__';
const UNLIMITED_TASK_WINDOW_YEARS = 100;

const getTimeLimitMinutesValue = (seconds?: number): string => (
  String(Math.max(1, Math.round((seconds || 3600) / 60)))
);

const parseTimeLimitMinutes = (value: string, fallback = 1): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  return Math.max(1, Math.round(parsed));
};

const fallbackWritingModels = () => (
  WRITING_AI_MODELS.filter((model) => model !== 'Custom models')
);

const modelBelongsToOptions = (model: string, options: string[]) => (
  !!model && model !== CUSTOM_MODEL_VALUE && options.includes(model)
);

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

type AiConnectionResult = {
  success: boolean;
  message: string;
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

        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            className={cn(
              'h-8 min-w-16 rounded-[5px] px-3 text-sm font-medium transition-colors',
              selected
                ? 'bg-background text-foreground shadow-sm'
                : 'text-muted-foreground hover:text-foreground',
              disabled && 'cursor-not-allowed opacity-50'
            )}
            onClick={() => onValueChange(option.value)}
          >
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

export function SettingsPanel({ taskId, onTaskUpdated }: SettingsPanelProps) {
  const router = useRouter();
  const { toast } = useToast();

  const [task, setTask] = useState<Task | null>(null);
  const [files, setFiles] = useState<TaskInstructionFile[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isUploadingFiles, setIsUploadingFiles] = useState(false);
  const [isRegenerating, setIsRegenerating] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [instructionFiles, setInstructionFiles] = useState<File[]>([]);

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
  const [aiApiKey, setAiApiKey] = useState('');
  const [aiModel, setAiModel] = useState('');
  const [customAiModel, setCustomAiModel] = useState('');
  const [hasExistingAiKey, setHasExistingAiKey] = useState(false);
  const [maskedAiKey, setMaskedAiKey] = useState('');
  const [isTestingAiConnection, setIsTestingAiConnection] = useState(false);
  const [aiConnectionResult, setAiConnectionResult] = useState<AiConnectionResult | null>(null);
  const [testedAiModels, setTestedAiModels] = useState<string[]>([]);
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(false);
  const [writingTimeLimitMinutesInput, setWritingTimeLimitMinutesInput] = useState('60');
  const [advancedAiSettingsOpen, setAdvancedAiSettingsOpen] = useState(false);
  const [advancedAiSettingsTouched, setAdvancedAiSettingsTouched] = useState(false);

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
  const selectedAiModel = aiModel === CUSTOM_MODEL_VALUE ? customAiModel.trim() : aiModel.trim();

  const aiModelOptions = useMemo(() => {
    const whitelist = getWhitelist(aiBaseUrl);
    let options: string[];
    if (whitelist?.length) {
      options = whitelist;
    } else if (testedAiModels.length) {
      options = testedAiModels;
    } else {
      options = fallbackWritingModels();
    }

    return !whitelist?.length && aiModel && aiModel !== CUSTOM_MODEL_VALUE && !options.includes(aiModel)
      ? [aiModel, ...options]
      : options;
  }, [aiBaseUrl, aiModel, testedAiModels]);

  useEffect(() => {
    if (advancedAiSettingsTouched) return;

    setAdvancedAiSettingsOpen(aiAccess !== 'off' && !hasExistingAiKey);
  }, [advancedAiSettingsTouched, aiAccess, hasExistingAiKey]);

  const fetchInstructionFiles = useCallback(async () => {
    const response = await api.get<{
      success: boolean;
      data: TaskInstructionFile[];
    }>(`/api/v1/tasks/${taskId}/files`);
    setFiles(response.data);
  }, [taskId]);

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
        const existingAiAccess = mergedConfig.aiAccess === 'off' ? 'off' : 'full';
        const hasTimeLimit = !!(mergedConfig.time.startTime || mergedConfig.time.endTime);
        const existingLimit = (
          mergedConfig.aiUsageLimit.maxRequests ||
          taskFromApi.aiUsageLimit ||
          100
        );

        setTask(taskFromApi);
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
          startDate: mergedConfig.time.startTime || taskFromApi.startDate
            ? toLocalDateTimeInputValue(mergedConfig.time.startTime || taskFromApi.startDate)
            : toLocalDateTimeInputValue(new Date()),
          endDate: mergedConfig.time.endTime || taskFromApi.endDate
            ? toLocalDateTimeInputValue(mergedConfig.time.endTime || taskFromApi.endDate)
            : toLocalDateTimeInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
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

  const setEnvironmentAiModel = (model: string, isCustomModel = false) => {
    setEnvironmentConfig((current) => ({
      ...current,
      allowedModels: model ? [model] : [],
      customModels: isCustomModel && model ? [model] : [],
    }));
  };

  useEffect(() => {
    const whitelist = getWhitelist(aiBaseUrl);
    if (
      aiAccess !== 'off' &&
      whitelist?.length &&
      aiModel !== CUSTOM_MODEL_VALUE &&
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
      : aiModelOptions[0] || 'gpt-4.1';

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
      traceability: {
        ...current.traceability,
        trackAiUsage: nextAccess !== 'off',
      },
    }));
  };

  const handleTestAiConnection = async () => {
    if (!aiApiKey.trim() && !hasExistingAiKey) {
      setAdvancedAiSettingsTouched(true);
      setAdvancedAiSettingsOpen(true);
      setAiConnectionResult({
        success: false,
        message: 'Enter an AI API key before testing the connection.',
      });
      return;
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
        const fallbackModels = getWhitelist(aiBaseUrl.trim() || DEFAULT_AI_BASE_URL) || [];
        const modelsFromApi = Array.isArray(result.models) ? result.models.filter(Boolean) : [];
        const nextModels = fallbackModels.length ? fallbackModels : modelsFromApi;

        setTestedAiModels(nextModels);

        if (nextModels.length > 0 && (!aiModel || !nextModels.includes(aiModel))) {
          setAiModel(nextModels[0]);
          setEnvironmentAiModel(nextModels[0]);
        }
      }
    } catch (err: any) {
      setAdvancedAiSettingsTouched(true);
      setAdvancedAiSettingsOpen(true);
      setAiConnectionResult({
        success: false,
        message: err.message || 'Connection test failed.',
      });
    } finally {
      setIsTestingAiConnection(false);
    }
  };

  const handleInstructionFilesChange = (event: ChangeEvent<HTMLInputElement>) => {
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

  const uploadInstructionFiles = async () => {
    if (!instructionFiles.length) return false;

    let failed = false;
    setIsUploadingFiles(true);

    try {
      for (const file of instructionFiles) {
        const formData = new FormData();
        formData.append('pdf', file);
        formData.append('title', file.name.replace(/\.pdf$/i, ''));

        try {
          await api.post(`/api/v1/tasks/${taskId}/files`, formData);
        } catch {
          failed = true;
        }
      }

      if (!failed) {
        setInstructionFiles([]);
      }

      await fetchInstructionFiles();
    } finally {
      setIsUploadingFiles(false);
    }

    return failed;
  };

  const buildCurrentEnvironmentConfig = (data: TaskSettingsFormData): WritingEnvironmentConfig => {
    const allowedModels = aiAccess === 'off' ? [] : selectedAiModel ? [selectedAiModel] : [];
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
    const hasInstructionPdf = currentInstructionFiles.length > 0 || instructionFiles.length > 0;

    return {
      ...environmentConfig,
      taskType: 'admin_assigned',
      preset: 'custom',
      aiAccess,
      allowedModels,
      customModels: aiModel === CUSTOM_MODEL_VALUE && selectedAiModel ? [selectedAiModel] : [],
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

  const onSubmit = async (data: TaskSettingsFormData) => {
    try {
      setIsSaving(true);
      setError(null);

      if (aiAccess !== 'off') {
        if (!aiApiKey.trim() && !hasExistingAiKey) {
          setAdvancedAiSettingsTouched(true);
          setAdvancedAiSettingsOpen(true);
          throw new Error('Enter an AI API key before saving an AI-enabled task.');
        }

        if (!selectedAiModel) {
          throw new Error('Select or enter the AI model for this task.');
        }

        await api.put('/api/v1/ai/settings', {
          apiKey: aiApiKey.trim() || USE_EXISTING_AI_KEY,
          baseUrl: aiBaseUrl.trim() || DEFAULT_AI_BASE_URL,
          model: selectedAiModel,
          shortcutMaxTokens: environmentConfig.aiTokenBudget?.shortcutMaxTokens || AI_SHORTCUT_MAX_TOKENS_DEFAULT,
          chatMaxTokens: environmentConfig.aiTokenBudget?.chatMaxTokens || AI_CHAT_MAX_TOKENS_DEFAULT,
        });
      }

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
      const allowedModels = aiAccess === 'off' ? [] : [selectedAiModel];
      const currentEnvironmentConfig = buildCurrentEnvironmentConfig(data);
      const nextEnvironmentConfig: WritingEnvironmentConfig = {
        ...currentEnvironmentConfig,
        time: {
          ...currentEnvironmentConfig.time,
          startTime: configStartTime,
          endTime: configEndTime,
          lateSubmission: timeLimitEnabled ? 'not_allowed' : 'allowed',
        },
      };

      const response = await api.put<{
        success: boolean;
        data: Task;
        message: string;
      }>(`/api/v1/tasks/${taskId}`, {
        name: data.name,
        description: data.description ?? '',
        userIdKey: task?.userIdKey || 'userId',
        externalServiceType: task?.externalServiceType || undefined,
        allowedLlmModels: allowedModels,
        aiUsageLimit: data.aiUsageLimit,
        startDate: startTime,
        endDate: endTime,
        environmentConfig: nextEnvironmentConfig,
      });

      const uploadFailed = await uploadInstructionFiles();

      setTask(response.data);
      setEnvironmentConfig(nextEnvironmentConfig);
      onTaskUpdated?.(response.data);
      toast({
        title: uploadFailed ? 'Task settings saved' : 'Success',
        description: uploadFailed
          ? 'Settings were updated, but one or more PDF uploads failed.'
          : 'Task settings updated successfully.',
        variant: uploadFailed ? 'destructive' : 'default',
      });
    } catch (err: any) {
      const message = err.message || 'Failed to update task settings';
      setError(message);
      toast({
        title: 'Error',
        description: message,
        variant: 'destructive',
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleRegenerateToken = async () => {
    try {
      setIsRegenerating(true);
      const response = await api.post<{
        success: boolean;
        data: Task;
        message: string;
      }>(`/api/v1/tasks/${taskId}/regenerate-token`);

      setNewToken(response.data.taskToken);
      setTask((current) => current ? { ...current, taskToken: response.data.taskToken } : current);
      toast({
        title: 'Success',
        description: 'Task token regenerated successfully',
      });
      setShowRegenerateDialog(false);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to regenerate token',
        variant: 'destructive',
      });
    } finally {
      setIsRegenerating(false);
    }
  };

  const handleDeleteTask = async () => {
    try {
      setIsDeleting(true);
      await api.delete(`/api/v1/tasks/${taskId}`);
      toast({
        title: 'Success',
        description: 'Task deleted successfully',
      });
      router.push('/tasks');
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to delete task',
        variant: 'destructive',
      });
      setShowDeleteDialog(false);
      setIsDeleting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast({
      title: 'Copied',
      description: 'Token copied to clipboard',
    });
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

  const isSubmitting = isSaving || isUploadingFiles;

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
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6 pb-24">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Task Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Task Name</FormLabel>
                    <FormControl>
                      <Input placeholder="Research Reflection Assignment" {...field} disabled={isSaving} />
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
                        disabled={isSaving}
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
                      <Upload className="h-4 w-4 text-muted-foreground" />
                      Files
                    </div>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Current and newly uploaded PDF instruction files for this task.
                    </p>
                  </div>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={fetchInstructionFiles}
                    disabled={isSaving || isUploadingFiles}
                  >
                    <RefreshCcw className="mr-2 h-4 w-4" />
                    Refresh
                  </Button>
                </div>

                {currentInstructionFiles.length > 0 && (
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
                )}

                <Input
                  type="file"
                  accept="application/pdf"
                  multiple
                  className="mt-3"
                  onChange={handleInstructionFilesChange}
                  disabled={isSaving || isUploadingFiles}
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
                            New upload · {(file.size / 1024 / 1024).toFixed(2)} MB
                          </p>
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          onClick={() => setInstructionFiles((current) => current.filter((item) => item !== file))}
                          disabled={isSaving || isUploadingFiles}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>AI</CardTitle>
            </CardHeader>
            <CardContent className="space-y-5">
              <SettingRow label="Access">
                <SegmentedControl
                  ariaLabel="AI"
                  value={aiAccess}
                  disabled={isSaving}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'full', label: 'On' },
                  ]}
                  onValueChange={(value) => setAiAccess(value as WritingAiAccess)}
                />
              </SettingRow>

              {aiAccess !== 'off' && (
                <div className="space-y-5 border-t pt-5">
                  <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                    <div className="space-y-2">
                      <FormLabel>Model</FormLabel>
                      <select
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={aiModel}
                        disabled={isSaving}
                        onChange={(event) => {
                          const value = event.target.value;
                          setAiModel(value);
                          if (value !== CUSTOM_MODEL_VALUE) {
                            setCustomAiModel('');
                            setEnvironmentAiModel(value);
                          } else {
                            setEnvironmentAiModel(customAiModel.trim(), true);
                          }
                        }}
                      >
                        <option value="">Select model</option>
                        {aiModelOptions.map((model) => (
                          <option key={model} value={model}>
                            {model}
                          </option>
                        ))}
                        <option value={CUSTOM_MODEL_VALUE}>Custom model</option>
                      </select>
                    </div>

                    <Button
                      type="button"
                      variant="outline"
                      onClick={handleTestAiConnection}
                      disabled={isSaving || isTestingAiConnection || (!aiApiKey.trim() && !hasExistingAiKey)}
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
                  </div>

                  {aiModel === CUSTOM_MODEL_VALUE && (
                    <div className="space-y-2">
                      <FormLabel htmlFor="custom-ai-model">Custom Model</FormLabel>
                      <Input
                        id="custom-ai-model"
                        value={customAiModel}
                        disabled={isSaving}
                        onChange={(event) => {
                          setCustomAiModel(event.target.value);
                          setEnvironmentAiModel(event.target.value.trim(), true);
                        }}
                        placeholder="provider/model-name"
                      />
                    </div>
                  )}

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

                  <div className="rounded-md border">
                    <div className="flex items-center justify-between gap-4 p-4">
                      <h3 className="text-sm font-semibold">Advanced AI Settings</h3>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        aria-expanded={advancedAiSettingsOpen}
                        onClick={() => {
                          setAdvancedAiSettingsTouched(true);
                          setAdvancedAiSettingsOpen((open) => !open);
                        }}
                      >
                        {advancedAiSettingsOpen ? 'Hide' : 'Show'}
                        <ChevronDown
                          className={cn(
                            'ml-2 h-4 w-4 transition-transform',
                            advancedAiSettingsOpen && 'rotate-180'
                          )}
                        />
                      </Button>
                    </div>

                    {advancedAiSettingsOpen && (
                      <div className="space-y-4 border-t p-4">
                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <FormLabel htmlFor="ai-api-key">AI API Key</FormLabel>
                            <Input
                              id="ai-api-key"
                              type="password"
                              value={aiApiKey}
                              disabled={isSaving}
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

                          <div className="space-y-2">
                            <FormLabel htmlFor="ai-base-url">Base URL</FormLabel>
                            <Input
                              id="ai-base-url"
                              value={aiBaseUrl}
                              disabled={isSaving}
                              onChange={(event) => {
                                setAiBaseUrl(event.target.value);
                                setAiConnectionResult(null);
                                setTestedAiModels([]);
                              }}
                              placeholder={DEFAULT_AI_BASE_URL}
                            />
                          </div>
                        </div>

                        <div className="grid gap-4 sm:grid-cols-2">
                          <div className="space-y-2">
                            <FormLabel htmlFor="ai-shortcut-max-tokens">Shortcut Tokens</FormLabel>
                            <Input
                              id="ai-shortcut-max-tokens"
                              type="number"
                              min={AI_MAX_TOKENS_MIN}
                              max={AI_MAX_TOKENS_MAX}
                              value={environmentConfig.aiTokenBudget?.shortcutMaxTokens || AI_SHORTCUT_MAX_TOKENS_DEFAULT}
                              disabled={isSaving}
                              onChange={(event) => setAiTokenBudget({
                                shortcutMaxTokens: Number(event.target.value) || AI_SHORTCUT_MAX_TOKENS_DEFAULT,
                              })}
                            />
                            <FormDescription>Shortcut actions and fallback answers.</FormDescription>
                          </div>

                          <div className="space-y-2">
                            <FormLabel htmlFor="ai-chat-max-tokens">Chat Tokens</FormLabel>
                            <Input
                              id="ai-chat-max-tokens"
                              type="number"
                              min={AI_MAX_TOKENS_MIN}
                              max={AI_MAX_TOKENS_MAX}
                              value={environmentConfig.aiTokenBudget?.chatMaxTokens || AI_CHAT_MAX_TOKENS_DEFAULT}
                              disabled={isSaving}
                              onChange={(event) => setAiTokenBudget({
                                chatMaxTokens: Number(event.target.value) || AI_CHAT_MAX_TOKENS_DEFAULT,
                              })}
                            />
                            <FormDescription>Chat and retrieval tool turns, per model call.</FormDescription>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Environment</CardTitle>
            </CardHeader>
            <CardContent className="space-y-6">
              <SettingRow label="Time">
                <SegmentedControl
                  ariaLabel="Time"
                  value={timeLimitEnabled ? 'on' : 'off'}
                  disabled={isSaving}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'on', label: 'On' },
                  ]}
                  onValueChange={(value) => setTimeLimitEnabled(value === 'on')}
                />
              </SettingRow>

              {timeLimitEnabled && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="startDate"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Task Start Date</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} disabled={isSaving} />
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
                        <FormLabel>Task End Date</FormLabel>
                        <FormControl>
                          <Input type="datetime-local" {...field} disabled={isSaving} />
                        </FormControl>
                        <FormDescription>
                          Saved as one absolute deadline and localized for each user.
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              <SettingRow label="Writing Session Timer">
                <SegmentedControl
                  ariaLabel="Writing Session Timer"
                  value={environmentConfig.time.timeLimitSeconds ? 'on' : 'off'}
                  disabled={isSaving}
                  options={[
                    { value: 'off', label: 'Off' },
                    { value: 'on', label: 'On' },
                  ]}
                  onValueChange={(value) => setWritingSessionTimerEnabled(value === 'on')}
                />
              </SettingRow>

              {environmentConfig.time.timeLimitSeconds && (
                <div className="grid gap-2 sm:max-w-[360px]">
                  <FormLabel htmlFor="writing-time-limit-minutes">Time Limit (minutes)</FormLabel>
                  <Input
                    id="writing-time-limit-minutes"
                    type="number"
                    min={1}
                    value={writingTimeLimitMinutesInput}
                    onChange={(event) => setWritingSessionTimerMinutes(event.target.value)}
                    onBlur={commitWritingSessionTimerMinutes}
                    disabled={isSaving}
                  />
                  <FormDescription>
                    The editor shows this countdown while each enrolled user writes.
                  </FormDescription>
                </div>
              )}

              <FormField
                control={form.control}
                name="aiUsageLimit"
                render={({ field }) => (
                  <FormItem className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-1">
                      <FormLabel>AI Usage Limit</FormLabel>
                      <FormDescription>
                        Maximum AI requests allowed per enrolled user for this task.
                      </FormDescription>
                      <FormMessage />
                    </div>
                    <FormControl>
                      <Input
                        className="sm:w-[220px]"
                        type="number"
                        min={1}
                        placeholder="100"
                        {...field}
                        disabled={isSaving}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <SettingRow label="Copy-Paste Policy">
                <SegmentedControl
                  ariaLabel="Copy-Paste Policy"
                  value={normalizeCopyPastePolicy(environmentConfig.copyPastePolicy)}
                  disabled={isSaving}
                  options={[
                    { value: 'allowed', label: 'Allowed' },
                    { value: 'blocked', label: 'Blocked' },
                  ]}
                  onValueChange={(value) => updateEnvironment({
                    copyPastePolicy: normalizeCopyPastePolicy(value),
                  })}
                />
              </SettingRow>

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
                    disabled={isSaving}
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
                    disabled={isSaving}
                  />
                </div>

                <FormDescription className="sm:col-span-2">
                  Leave either field blank when submissions do not need that length bound.
                </FormDescription>
              </div>
            </CardContent>
          </Card>

          <div
            data-testid="settings-sticky-actions"
            className="sticky bottom-0 z-20 border-t bg-background/95 py-4 backdrop-blur supports-[backdrop-filter]:bg-background/80"
          >
            <div className="flex justify-between gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/tasks/${taskId}`)}
                disabled={isSubmitting}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isSubmitting ? 'Saving...' : 'Save Settings'}
              </Button>
            </div>
          </div>
        </form>
      </Form>

      <Card>
        <CardHeader>
          <CardTitle>Task Token</CardTitle>
          <CardDescription>
            Your task token is used for API authentication.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {newToken && (
            <div className="rounded-md border border-yellow-200 bg-yellow-50 p-4">
              <p className="mb-2 text-sm font-medium text-yellow-800">
                New Token Generated
              </p>
              <p className="mb-3 text-xs text-yellow-700">
                Make sure to copy your new token now. You will not be able to see it again.
              </p>
              <div className="flex gap-2">
                <Input value={newToken} readOnly className="bg-white font-mono text-sm" />
                <Button variant="outline" onClick={() => copyToClipboard(newToken)}>
                  Copy
                </Button>
              </div>
            </div>
          )}

          <div className="flex gap-2">
            <Input value={task.taskToken} readOnly className="font-mono text-sm" type="password" />
            <Button variant="outline" onClick={() => copyToClipboard(task.taskToken)}>
              Copy
            </Button>
          </div>

          <Button variant="outline" onClick={() => setShowRegenerateDialog(true)}>
            <Key className="mr-2 h-4 w-4" />
            Regenerate Token
          </Button>
        </CardContent>
      </Card>

      <Card className="border-destructive">
        <CardHeader>
          <CardTitle className="text-destructive">Danger Zone</CardTitle>
          <CardDescription>
            Irreversible and destructive actions.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="font-medium">Delete Task</p>
              <p className="text-sm text-muted-foreground">
                Once you delete a task, there is no going back. All associated task data is removed.
              </p>
            </div>
            <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
              <Trash2 className="mr-2 h-4 w-4" />
              Delete Task
            </Button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showRegenerateDialog} onOpenChange={setShowRegenerateDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Regenerate Task Token?</DialogTitle>
            <DialogDescription>
              This will invalidate your current token. Any integrations using the old token must be updated.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowRegenerateDialog(false)}
              disabled={isRegenerating}
            >
              Cancel
            </Button>
            <Button onClick={handleRegenerateToken} disabled={isRegenerating}>
              {isRegenerating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Regenerate Token
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Task?</DialogTitle>
            <DialogDescription>
              This action cannot be undone. This will permanently delete &quot;{task.name}&quot; and associated data.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleDeleteTask} disabled={isDeleting}>
              {isDeleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              Delete Task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

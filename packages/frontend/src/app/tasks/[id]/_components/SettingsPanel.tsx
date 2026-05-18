'use client';

import { useCallback, useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
  CheckCircle,
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
  AI_AGENT_MAX_TOKENS_DEFAULT,
  AI_MAX_TOKENS_MAX,
  AI_MAX_TOKENS_MIN,
  AI_RESPONSE_MAX_TOKENS_DEFAULT,
  DEFAULT_WRITING_ENVIRONMENT_CONFIG,
  WRITING_AI_MODELS,
  normalizeCopyPastePolicy,
  type Task,
  type UserAISettings,
  type WritingAiAccess,
  type WritingEnvironmentConfig,
} from '@humanly/shared';

import { api } from '@/lib/api-client';
import { getWhitelist } from '@/lib/ai-models';
import {
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

type AiConnectionResult = {
  success: boolean;
  message: string;
};

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
    responseMaxTokens: config?.aiTokenBudget?.responseMaxTokens || AI_RESPONSE_MAX_TOKENS_DEFAULT,
    agentMaxTokens: config?.aiTokenBudget?.agentMaxTokens || AI_AGENT_MAX_TOKENS_DEFAULT,
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
    if (testedAiModels.length) {
      options = testedAiModels;
    } else if (whitelist?.length) {
      options = whitelist;
    } else {
      options = WRITING_AI_MODELS.filter((model) => model !== 'Custom models');
    }

    return aiModel && aiModel !== CUSTOM_MODEL_VALUE && !options.includes(aiModel)
      ? [aiModel, ...options]
      : options;
  }, [aiBaseUrl, aiModel, testedAiModels]);

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

  const setAiTokenBudget = (patch: NonNullable<WritingEnvironmentConfig['aiTokenBudget']>) => {
    setEnvironmentConfig((current) => ({
      ...current,
      aiTokenBudget: {
        responseMaxTokens: current.aiTokenBudget?.responseMaxTokens || AI_RESPONSE_MAX_TOKENS_DEFAULT,
        agentMaxTokens: current.aiTokenBudget?.agentMaxTokens || AI_AGENT_MAX_TOKENS_DEFAULT,
        ...patch,
      },
    }));
  };

  const setAiAccess = (nextAccess: WritingAiAccess) => {
    const defaultModel = aiModel || aiModelOptions[0] || 'gpt-4.1';

    setAiAccessState(nextAccess);
    if (nextAccess !== 'off' && !aiModel) {
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
        const nextModels = modelsFromApi.length ? modelsFromApi : fallbackModels;

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

  const onSubmit = async (data: TaskSettingsFormData) => {
    try {
      setIsSaving(true);
      setError(null);

      if (aiAccess !== 'off') {
        if (!aiApiKey.trim() && !hasExistingAiKey) {
          throw new Error('Enter an AI API key before saving an AI-enabled task.');
        }

        if (!selectedAiModel) {
          throw new Error('Select or enter the AI model for this task.');
        }

        await api.put('/api/v1/ai/settings', {
          apiKey: aiApiKey.trim() || USE_EXISTING_AI_KEY,
          baseUrl: aiBaseUrl.trim() || DEFAULT_AI_BASE_URL,
          model: selectedAiModel,
          responseMaxTokens: environmentConfig.aiTokenBudget?.responseMaxTokens || AI_RESPONSE_MAX_TOKENS_DEFAULT,
          agentMaxTokens: environmentConfig.aiTokenBudget?.agentMaxTokens || AI_AGENT_MAX_TOKENS_DEFAULT,
        });
      }

      const allowedModels = aiAccess === 'off' ? [] : [selectedAiModel];
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
      const hasInstructionPdf = currentInstructionFiles.length > 0 || instructionFiles.length > 0;
      const nextEnvironmentConfig: WritingEnvironmentConfig = {
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
          maxRequests: data.aiUsageLimit,
        },
        time: {
          ...environmentConfig.time,
          startTime: configStartTime,
          endTime: configEndTime,
          lateSubmission: timeLimitEnabled ? 'not_allowed' : 'allowed',
        },
        traceability: {
          ...environmentConfig.traceability,
          trackAiUsage: aiAccess !== 'off',
          trackCopyPaste: normalizeCopyPastePolicy(environmentConfig.copyPastePolicy) === 'allowed',
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

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Task Settings</h2>
        <p className="mt-2 text-muted-foreground">
          Inspect and edit the same configuration used when this task was created.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Writing Task Configuration</CardTitle>
          <CardDescription>
            Changes here update the task config imported by future enrolled documents.
          </CardDescription>
        </CardHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <CardContent className="space-y-6">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}

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

              <div className="space-y-4 rounded-md border p-4">
                <div>
                  <h3 className="font-semibold">AI Access</h3>
                  <p className="text-sm text-muted-foreground">
                    The same AI access setting from task creation. API keys are saved to the admin AI settings, not task JSON.
                  </p>
                </div>

                <div className="space-y-2">
                  <FormLabel>AI</FormLabel>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={aiAccess}
                    disabled={isSaving}
                    onChange={(event) => setAiAccess(event.target.value as WritingAiAccess)}
                  >
                    <option value="off">Off</option>
                    <option value="full">On</option>
                  </select>
                </div>

                {aiAccess !== 'off' && (
                  <div className="space-y-4 rounded-md border bg-muted/30 p-3">
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

                    <div className="grid gap-4 sm:grid-cols-2">
                      <div className="space-y-2">
                        <FormLabel htmlFor="ai-response-max-tokens">Response Tokens</FormLabel>
                        <Input
                          id="ai-response-max-tokens"
                          type="number"
                          min={AI_MAX_TOKENS_MIN}
                          max={AI_MAX_TOKENS_MAX}
                          value={environmentConfig.aiTokenBudget?.responseMaxTokens || AI_RESPONSE_MAX_TOKENS_DEFAULT}
                          disabled={isSaving}
                          onChange={(event) => setAiTokenBudget({
                            responseMaxTokens: Number(event.target.value) || AI_RESPONSE_MAX_TOKENS_DEFAULT,
                          })}
                        />
                        <FormDescription>Quick actions and fallback answers.</FormDescription>
                      </div>

                      <div className="space-y-2">
                        <FormLabel htmlFor="ai-agent-max-tokens">Agent Tokens</FormLabel>
                        <Input
                          id="ai-agent-max-tokens"
                          type="number"
                          min={AI_MAX_TOKENS_MIN}
                          max={AI_MAX_TOKENS_MAX}
                          value={environmentConfig.aiTokenBudget?.agentMaxTokens || AI_AGENT_MAX_TOKENS_DEFAULT}
                          disabled={isSaving}
                          onChange={(event) => setAiTokenBudget({
                            agentMaxTokens: Number(event.target.value) || AI_AGENT_MAX_TOKENS_DEFAULT,
                          })}
                        />
                        <FormDescription>Chat turns with retrieval tools.</FormDescription>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              <div className="space-y-4 rounded-md border p-4">
                <div>
                  <h3 className="font-semibold">Time</h3>
                  <p className="text-sm text-muted-foreground">
                    Turn time on only when this task needs a start window and deadline.
                  </p>
                </div>

                <div className="space-y-2">
                  <FormLabel>Time</FormLabel>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={timeLimitEnabled ? 'on' : 'off'}
                    disabled={isSaving}
                    onChange={(event) => setTimeLimitEnabled(event.target.value === 'on')}
                  >
                    <option value="off">Off</option>
                    <option value="on">On</option>
                  </select>
                </div>

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
                        disabled={isSaving}
                      />
                    </FormControl>
                    <FormDescription>
                      Maximum AI requests allowed per enrolled user for this task.
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <div className="space-y-2">
                <FormLabel>Copy-Paste Policy</FormLabel>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={normalizeCopyPastePolicy(environmentConfig.copyPastePolicy)}
                  disabled={isSaving}
                  onChange={(event) => updateEnvironment({
                    copyPastePolicy: normalizeCopyPastePolicy(event.target.value),
                  })}
                >
                  <option value="allowed">Allowed</option>
                  <option value="blocked">Blocked</option>
                </select>
              </div>
            </CardContent>
            <CardFooter className="flex justify-between">
              <Button
                type="button"
                variant="outline"
                onClick={() => router.push(`/tasks/${taskId}`)}
                disabled={isSaving || isUploadingFiles}
              >
                Cancel
              </Button>
              <Button type="submit" disabled={isSaving || isUploadingFiles}>
                {(isSaving || isUploadingFiles) && (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                )}
                {isSaving || isUploadingFiles ? 'Saving...' : 'Save Settings'}
              </Button>
            </CardFooter>
          </form>
        </Form>
      </Card>

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

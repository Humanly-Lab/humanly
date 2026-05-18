'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import {
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
import { useToast } from '@/components/ui/use-toast';
import { api } from '@/lib/api-client';
import { getWhitelist } from '@/lib/ai-models';
import {
  getLocalTimeZoneLabel,
  localDateTimeInputToISOString,
  toLocalDateTimeInputValue,
} from '@/lib/utils';
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
const UNLIMITED_TASK_WINDOW_YEARS = 100;

type AiConnectionResult = {
  success: boolean;
  message: string;
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
  const [customAiModel, setCustomAiModel] = useState('');
  const [hasExistingAiKey, setHasExistingAiKey] = useState(false);
  const [maskedAiKey, setMaskedAiKey] = useState('');
  const [isTestingAiConnection, setIsTestingAiConnection] = useState(false);
  const [aiConnectionResult, setAiConnectionResult] = useState<AiConnectionResult | null>(null);
  const [testedAiModels, setTestedAiModels] = useState<string[]>([]);
  const [timeLimitEnabled, setTimeLimitEnabled] = useState(false);
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

  const form = useForm<TaskFormValues>({
    resolver: zodResolver(taskFormSchema),
    defaultValues: {
      name: '',
      description: '',
      aiUsageLimit: 100,
      startDate: toLocalDateTimeInputValue(new Date()),
      endDate: toLocalDateTimeInputValue(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)),
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
            responseMaxTokens: settings.responseMaxTokens || AI_RESPONSE_MAX_TOKENS_DEFAULT,
            agentMaxTokens: settings.agentMaxTokens || AI_AGENT_MAX_TOKENS_DEFAULT,
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

    return aiModel && aiModel !== CUSTOM_MODEL_VALUE && !options.includes(aiModel)
      ? [aiModel, ...options]
      : options;
  }, [aiBaseUrl, aiModel, testedAiModels]);

  const selectedAiModel = aiModel === CUSTOM_MODEL_VALUE ? customAiModel.trim() : aiModel.trim();

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

  return (
    <div className="container max-w-2xl py-8">
      <Card>
        <CardHeader>
          <CardTitle>Create Writing Task</CardTitle>
          <CardDescription>
            Set up an admin-managed writing task with invite-code enrollment, AI permissions, and optional instruction files.
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
                    <FormDescription>
                      A user-facing title shown on the admin dashboard and task detail pages.
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
                        disabled={isSubmitting}
                      />
                    </FormControl>
                    <FormDescription>
                      This description is visible to admins and can be reused for user-facing instructions.
                    </FormDescription>
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

              <div className="space-y-4 rounded-md border p-4">
                <div>
                  <h3 className="font-semibold">AI Access</h3>
                  <p className="text-sm text-muted-foreground">
                    When AI is on, save a provider key and choose the model allowed for this task.
                  </p>
                </div>

                <div className="space-y-2">
                  <FormLabel>AI</FormLabel>
                  <select
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={aiAccess}
                    disabled={isSubmitting}
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
                      <div className="space-y-2">
                        <FormLabel>Model</FormLabel>
                        <select
                          className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={aiModel}
                          disabled={isSubmitting}
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
                      <div className="space-y-2">
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
                      <div className="space-y-2">
                        <FormLabel htmlFor="ai-response-max-tokens">Response Tokens</FormLabel>
                        <Input
                          id="ai-response-max-tokens"
                          type="number"
                          min={AI_MAX_TOKENS_MIN}
                          max={AI_MAX_TOKENS_MAX}
                          value={environmentConfig.aiTokenBudget?.responseMaxTokens || AI_RESPONSE_MAX_TOKENS_DEFAULT}
                          disabled={isSubmitting}
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
                          disabled={isSubmitting}
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
                    disabled={isSubmitting}
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

              <div className="space-y-2">
                <FormLabel>Copy-Paste Policy</FormLabel>
                <select
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={normalizeCopyPastePolicy(environmentConfig.copyPastePolicy)}
                  disabled={isSubmitting}
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

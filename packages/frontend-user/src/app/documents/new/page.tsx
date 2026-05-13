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
import { getWhitelist } from '@/lib/ai-models';

const DEFAULT_AI_BASE_URL = 'https://api.together.xyz/v1';
const CUSTOM_MODEL_VALUE = '__custom_model__';
const USE_EXISTING_AI_KEY = '__use_existing__';

type AiConnectionResult = {
  success: boolean;
  message: string;
};

const getPresetConfig = (preset: WritingEnvironmentPreset): WritingEnvironmentConfig => ({
  ...WRITING_ENVIRONMENT_PRESETS[preset],
  taskType: 'personal',
  copyPastePolicy: normalizeCopyPastePolicy(WRITING_ENVIRONMENT_PRESETS[preset].copyPastePolicy),
});

export default function NewDocumentPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { createDocument } = useDocuments();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [pdfFile, setPdfFile] = useState<File | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [environmentPreset, setEnvironmentPreset] = useState<WritingEnvironmentPreset>('default_writing');
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

  const markCustom = (updater: (current: WritingEnvironmentConfig) => WritingEnvironmentConfig) => {
    setEnvironmentPreset('custom');
    setEnvironmentConfig((current) => ({
      ...updater(current),
      preset: 'custom',
    }));
  };

  const applyEnvironmentPreset = (preset: WritingEnvironmentPreset) => {
    setEnvironmentPreset(preset);
    setEnvironmentConfig(getPresetConfig(preset));
  };

  const setEnvironmentAiModel = (model: string, isCustomModel = false) => {
    markCustom((current) => ({
      ...current,
      allowedModels: model ? [model] : [],
      customModels: isCustomModel && model ? [model] : [],
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

    setIsTestingAiConnection(true);
    setAiConnectionResult(null);
    setTestedAiModels([]);

    try {
      const response = await apiClient.post('/ai/settings/test', {
        apiKey: aiApiKey.trim() || USE_EXISTING_AI_KEY,
        baseUrl: aiBaseUrl.trim() || DEFAULT_AI_BASE_URL,
      });
      const result = response.data || {};

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

        await apiClient.put('/ai/settings', {
          apiKey: aiApiKey.trim() || USE_EXISTING_AI_KEY,
          baseUrl: aiBaseUrl.trim() || DEFAULT_AI_BASE_URL,
          model: selectedAiModel,
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
        description: pdfFile ? 'Document created with PDF for review' : 'Document created successfully',
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
    aiApiKey,
    aiBaseUrl,
    aiModel,
    hasExistingAiKey,
    selectedAiModel,
    createDocument,
    toast,
    router,
  ]);

  const timeMode = environmentConfig.aiUsageLimit.mode === 'time_restricted' ? 'time_restricted' : 'unlimited';

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
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
            A document includes both the content and the environment where it is written.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
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

          <div className="space-y-4 rounded-md border p-4">
            <div>
              <h3 className="font-semibold">Writing Environment</h3>
              <p className="text-sm text-muted-foreground">
                Defaults are visible below. Changing any setting switches the environment to Custom.
              </p>
            </div>

            <div className="grid gap-2">
              <Label>Preset</Label>
              <Select value={environmentPreset} onValueChange={(value) => applyEnvironmentPreset(value as WritingEnvironmentPreset)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select preset" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="default_writing">Default Writing</SelectItem>
                  <SelectItem value="custom">Custom</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-4 sm:grid-cols-3">
              <div className="grid gap-2">
                <Label>AI</Label>
                <Select value={environmentConfig.aiAccess} onValueChange={(value) => setAiAccess(value as WritingAiAccess)}>
                  <SelectTrigger>
                    <SelectValue placeholder="AI access" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="off">Off</SelectItem>
                    <SelectItem value="full">On</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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
                  }}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Time policy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="unlimited">No limitations</SelectItem>
                    <SelectItem value="time_restricted">Time limited</SelectItem>
                  </SelectContent>
                </Select>
              </div>

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
            </div>

            {environmentConfig.aiAccess !== 'off' && (
              <div className="grid gap-4 rounded-md border bg-muted/30 p-4">
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
                    <Label htmlFor="ai-base-url">Base URL</Label>
                    <Input
                      id="ai-base-url"
                      value={aiBaseUrl}
                      onChange={(event) => {
                        setAiBaseUrl(event.target.value);
                        setAiConnectionResult(null);
                        setTestedAiModels([]);
                      }}
                      placeholder={DEFAULT_AI_BASE_URL}
                      disabled={isCreating}
                    />
                  </div>
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
              </div>
            )}

            {timeMode === 'time_restricted' && (
              <div className="grid gap-2">
                <Label>Time Limit (minutes)</Label>
                <Input
                  type="number"
                  min={1}
                  value={Math.round((environmentConfig.time.timeLimitSeconds || 3600) / 60)}
                  disabled={isCreating}
                  onChange={(event) => {
                    const minutes = Number(event.target.value) || 1;
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
        </CardContent>
        <CardFooter className="flex justify-between">
          <Button variant="outline" onClick={() => router.push('/documents')} disabled={isCreating}>
            Cancel
          </Button>
          <Button onClick={handleCreateDocument} disabled={isCreating}>
            {isCreating && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {isCreating ? 'Creating...' : pdfFile ? 'Create & Upload PDF' : 'Create Document'}
          </Button>
        </CardFooter>
      </Card>
    </div>
  );
}

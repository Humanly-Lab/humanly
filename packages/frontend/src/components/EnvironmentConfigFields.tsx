'use client';

import {
  AI_AGENT_MAX_TOKENS_DEFAULT,
  AI_MAX_TOKENS_MAX,
  AI_MAX_TOKENS_MIN,
  AI_RESPONSE_MAX_TOKENS_DEFAULT,
  DEFAULT_WRITING_ENVIRONMENT_CONFIG,
  WRITING_AI_MODELS,
  normalizeCopyPastePolicy,
  WritingEnvironmentConfig,
} from '@humanly/shared';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface EnvironmentConfigFieldsProps {
  value: WritingEnvironmentConfig;
  onChange: (value: WritingEnvironmentConfig) => void;
  disabled?: boolean;
  taskTypeLocked?: boolean;
}

const setNested = (
  config: WritingEnvironmentConfig,
  patch: Partial<WritingEnvironmentConfig>
): WritingEnvironmentConfig => ({
  ...config,
  ...patch,
});

export default function EnvironmentConfigFields({
  value,
  onChange,
  disabled = false,
  taskTypeLocked = false,
}: EnvironmentConfigFieldsProps) {
  const config: WritingEnvironmentConfig = {
    ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
    ...value,
    instructions: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.instructions,
      ...value.instructions,
    },
    aiUsageLimit: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.aiUsageLimit,
      ...value.aiUsageLimit,
    },
    time: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.time,
      ...(value.time || {}),
    },
    submission: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.submission,
      ...(value.submission || {}),
    },
    traceability: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.traceability,
      ...value.traceability,
    },
    copyPastePolicy: normalizeCopyPastePolicy(value.copyPastePolicy),
  };

  const toggleModel = (model: string, checked: boolean) => {
    onChange(setNested(config, {
      allowedModels: checked
        ? Array.from(new Set([...config.allowedModels, model]))
        : config.allowedModels.filter((item) => item !== model),
    }));
  };

  return (
    <div className="space-y-6 rounded-md border p-4">
      <div>
        <h3 className="font-semibold">Writing Environment</h3>
        <p className="text-sm text-muted-foreground">
          Configure how this task can be written, assisted, submitted, and traced.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Task Type</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={config.taskType}
            disabled={disabled || taskTypeLocked}
            onChange={(event) => onChange(setNested(config, { taskType: event.target.value as WritingEnvironmentConfig['taskType'] }))}
          >
            <option value="personal">Personal Task</option>
            <option value="admin_assigned">Admin Assigned Task</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label>Editable After Submission</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={config.instructions.editableAfterSubmission ? 'yes' : 'no'}
            disabled={disabled}
            onChange={(event) => onChange(setNested(config, {
              instructions: {
                ...config.instructions,
                editableAfterSubmission: event.target.value === 'yes',
              },
            }))}
          >
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>AI Access</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={config.aiAccess}
            disabled={disabled}
            onChange={(event) => onChange(setNested(config, { aiAccess: event.target.value as WritingEnvironmentConfig['aiAccess'] }))}
          >
            <option value="off">Off</option>
            <option value="readonly">Read-only</option>
            <option value="full">Full Access</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label>AI Usage Limit</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={config.aiUsageLimit.mode}
            disabled={disabled}
            onChange={(event) => onChange(setNested(config, {
              aiUsageLimit: {
                ...config.aiUsageLimit,
                mode: event.target.value as WritingEnvironmentConfig['aiUsageLimit']['mode'],
              },
            }))}
          >
            <option value="unlimited">Unlimited</option>
            <option value="max_requests">Max requests</option>
            <option value="max_tokens">Max tokens</option>
            <option value="time_restricted">Time restricted</option>
          </select>
        </div>
      </div>

      {config.aiUsageLimit.mode === 'max_requests' && (
        <div className="space-y-2">
          <Label>Max Requests</Label>
          <Input
            type="number"
            min={1}
            value={config.aiUsageLimit.maxRequests || 100}
            disabled={disabled}
            onChange={(event) => onChange(setNested(config, {
              aiUsageLimit: {
                ...config.aiUsageLimit,
                maxRequests: Number(event.target.value) || 1,
              },
            }))}
          />
        </div>
      )}

      {config.aiUsageLimit.mode === 'max_tokens' && (
        <div className="space-y-2">
          <Label>Max Tokens</Label>
          <Input
            type="number"
            min={1}
            value={config.aiUsageLimit.maxTokens || 10000}
            disabled={disabled}
            onChange={(event) => onChange(setNested(config, {
              aiUsageLimit: {
                ...config.aiUsageLimit,
                maxTokens: Number(event.target.value) || 1,
              },
            }))}
          />
        </div>
      )}

      <div className="space-y-2">
        <Label>AI Models Allowed</Label>
        <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
          {WRITING_AI_MODELS.map((model) => (
            <label key={model} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={config.allowedModels.includes(model)}
                disabled={disabled || config.aiAccess === 'off'}
                onCheckedChange={(checked) => toggleModel(model, checked === true)}
              />
              {model}
            </label>
          ))}
        </div>
      </div>

      {config.allowedModels.includes('Custom models') && (
        <div className="space-y-2">
          <Label>Custom Models</Label>
          <Input
            value={(config.customModels || []).join(', ')}
            disabled={disabled}
            placeholder="model-a, model-b"
            onChange={(event) => onChange(setNested(config, {
              customModels: event.target.value
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean),
            }))}
          />
        </div>
      )}

      {config.aiAccess !== 'off' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Response Tokens</Label>
            <Input
              type="number"
              min={AI_MAX_TOKENS_MIN}
              max={AI_MAX_TOKENS_MAX}
              value={config.aiTokenBudget?.responseMaxTokens || AI_RESPONSE_MAX_TOKENS_DEFAULT}
              disabled={disabled}
              onChange={(event) => onChange(setNested(config, {
                aiTokenBudget: {
                  responseMaxTokens: Number(event.target.value) || AI_RESPONSE_MAX_TOKENS_DEFAULT,
                  agentMaxTokens: config.aiTokenBudget?.agentMaxTokens || AI_AGENT_MAX_TOKENS_DEFAULT,
                },
              }))}
            />
          </div>

          <div className="space-y-2">
            <Label>Agent Tokens</Label>
            <Input
              type="number"
              min={AI_MAX_TOKENS_MIN}
              max={AI_MAX_TOKENS_MAX}
              value={config.aiTokenBudget?.agentMaxTokens || AI_AGENT_MAX_TOKENS_DEFAULT}
              disabled={disabled}
              onChange={(event) => onChange(setNested(config, {
                aiTokenBudget: {
                  responseMaxTokens: config.aiTokenBudget?.responseMaxTokens || AI_RESPONSE_MAX_TOKENS_DEFAULT,
                  agentMaxTokens: Number(event.target.value) || AI_AGENT_MAX_TOKENS_DEFAULT,
                },
              }))}
            />
          </div>
        </div>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Late Submission</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={config.time.lateSubmission}
            disabled={disabled}
            onChange={(event) => onChange(setNested(config, {
              time: {
                ...config.time,
                lateSubmission: event.target.value as WritingEnvironmentConfig['time']['lateSubmission'],
              },
            }))}
          >
            <option value="allowed">Allowed</option>
            <option value="not_allowed">Not allowed</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label>Copy-Paste Policy</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={normalizeCopyPastePolicy(config.copyPastePolicy)}
            disabled={disabled}
            onChange={(event) => onChange(setNested(config, { copyPastePolicy: normalizeCopyPastePolicy(event.target.value) }))}
          >
            <option value="allowed">Allowed</option>
            <option value="blocked">Blocked</option>
          </select>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Traceability</Label>
        <div className="grid gap-2 rounded-md border p-3 sm:grid-cols-2">
          {[
            ['trackAiUsage', 'Track AI usage'],
            ['trackTyping', 'Track typing behavior'],
            ['trackCopyPaste', 'Track copy-paste behavior'],
            ['trackFocusBlur', 'Track focus/blur events'],
          ].map(([key, label]) => (
            <label key={key} className="flex items-center gap-2 text-sm">
              <Checkbox
                checked={config.traceability[key as keyof WritingEnvironmentConfig['traceability']]}
                disabled={disabled}
                onCheckedChange={(checked) => onChange(setNested(config, {
                  traceability: {
                    ...config.traceability,
                    [key]: checked === true,
                  },
                }))}
              />
              {label}
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}

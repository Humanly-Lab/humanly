'use client';

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
  isWritingAiChatEnabled,
  isWritingAiPolishEnabled,
  normalizeWritingAiAccess,
  normalizeWritingAiPolicy,
  normalizeCopyPastePolicy,
  normalizeResourceAccessPolicy,
  WritingEnvironmentConfig,
  WritingAiPolicyMode,
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
    aiAccess: normalizeWritingAiAccess(value.aiAccess),
    aiPolicy: normalizeWritingAiPolicy(value.aiPolicy),
    resourceAccess: normalizeResourceAccessPolicy(value.resourceAccess),
    copyPastePolicy: normalizeCopyPastePolicy(value.copyPastePolicy),
  };
  const shortcutTokensEnabled = isWritingAiPolishEnabled(config.aiAccess);
  const chatTokensEnabled = isWritingAiChatEnabled(config.aiAccess);
  const aiPolicy = normalizeWritingAiPolicy(config.aiPolicy);

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
            onChange={(event) => {
              const aiAccess = event.target.value as WritingEnvironmentConfig['aiAccess'];
              onChange(setNested(config, {
                aiAccess,
                aiPolicy: isWritingAiChatEnabled(aiAccess) ? aiPolicy : { mode: 'off' },
              }));
            }}
          >
            {WRITING_AI_ACCESS_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
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

      {config.aiAccess !== 'off' && (
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-2">
            <Label>Shortcut Tokens</Label>
            <Input
              aria-label="Shortcut Tokens"
              type="number"
              min={AI_MAX_TOKENS_MIN}
              max={AI_MAX_TOKENS_MAX}
              value={shortcutTokensEnabled ? config.aiTokenBudget?.shortcutMaxTokens || AI_SHORTCUT_MAX_TOKENS_DEFAULT : ''}
              placeholder={shortcutTokensEnabled ? undefined : 'Not available in this mode'}
              disabled={disabled || !shortcutTokensEnabled}
              onChange={(event) => onChange(setNested(config, {
                aiTokenBudget: {
                  shortcutMaxTokens: Number(event.target.value) || AI_SHORTCUT_MAX_TOKENS_DEFAULT,
                  chatMaxTokens: config.aiTokenBudget?.chatMaxTokens || AI_CHAT_MAX_TOKENS_DEFAULT,
                },
              }))}
            />
            <p className="text-xs text-muted-foreground">
              {shortcutTokensEnabled
                ? 'Shortcut actions and fallback answers.'
                : 'Not available when AI access is chat only.'}
            </p>
          </div>

          <div className="space-y-2">
            <Label>Chat Tokens</Label>
            <Input
              aria-label="Chat Tokens"
              type="number"
              min={AI_MAX_TOKENS_MIN}
              max={AI_MAX_TOKENS_MAX}
              value={chatTokensEnabled ? config.aiTokenBudget?.chatMaxTokens || AI_CHAT_MAX_TOKENS_DEFAULT : ''}
              placeholder={chatTokensEnabled ? undefined : 'Not available in this mode'}
              disabled={disabled || !chatTokensEnabled}
              onChange={(event) => onChange(setNested(config, {
                aiTokenBudget: {
                  shortcutMaxTokens: config.aiTokenBudget?.shortcutMaxTokens || AI_SHORTCUT_MAX_TOKENS_DEFAULT,
                  chatMaxTokens: Number(event.target.value) || AI_CHAT_MAX_TOKENS_DEFAULT,
                },
              }))}
            />
            <p className="text-xs text-muted-foreground">
              {chatTokensEnabled
                ? 'Chat and retrieval tool turns, per model call.'
                : 'Not available when AI access is polish only.'}
            </p>
          </div>
        </div>
      )}

      {chatTokensEnabled && (
        <div className="grid gap-4 rounded-md border bg-muted/30 p-3">
          <div className="space-y-2">
            <Label>AI Policy Enforcement</Label>
            <select
              aria-label="AI policy enforcement"
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={aiPolicy.mode}
              disabled={disabled}
              onChange={(event) => onChange(setNested(config, {
                aiPolicy: event.target.value === 'guard'
                  ? {
                      mode: 'guard',
                      rejectionRule: aiPolicy.rejectionRule || '',
                    }
                  : { mode: 'off' },
              }))}
            >
              {WRITING_AI_POLICY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {aiPolicy.mode === 'guard' && (
            <div className="space-y-2">
              <Label htmlFor="ai-policy-rejection-rule">Rejection Rule</Label>
              <textarea
                id="ai-policy-rejection-rule"
                aria-label="AI rejection rule"
                className="min-h-24 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={aiPolicy.rejectionRule || ''}
                disabled={disabled}
                onChange={(event) => onChange(setNested(config, {
                  aiPolicy: {
                    mode: 'guard' as WritingAiPolicyMode,
                    rejectionRule: event.target.value,
                  },
                }))}
                placeholder="Example: Refuse to produce evaluative claims; only help with grammar, wording, or understanding references."
              />
              <p className="text-xs text-muted-foreground">
                Applies only to agent chat in Chat or Full mode.
              </p>
            </div>
          )}
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

        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-2">
            <Label htmlFor="minimum-characters">Minimum Characters</Label>
            <Input
              id="minimum-characters"
              type="number"
              min={1}
              max={SUBMISSION_MIN_CHARACTERS_MAX}
              value={config.submission.minCharacters ?? ''}
              disabled={disabled}
              placeholder="No minimum"
              onChange={(event) => onChange(setNested(config, {
                submission: {
                  ...config.submission,
                  minCharacters: parseOptionalMinCharacters(event.target.value),
                },
              }))}
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="maximum-characters">Maximum Characters</Label>
            <Input
              id="maximum-characters"
              type="number"
              min={1}
              max={SUBMISSION_MAX_CHARACTERS_MAX}
              value={config.submission.maxCharacters ?? ''}
              disabled={disabled}
              placeholder="No maximum"
              onChange={(event) => onChange(setNested(config, {
                submission: {
                  ...config.submission,
                  maxCharacters: parseOptionalMaxCharacters(event.target.value),
                },
              }))}
            />
          </div>
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

        <div className="space-y-2">
          <Label>PDF Resource Access</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={normalizeResourceAccessPolicy(config.resourceAccess)}
            disabled={disabled}
            onChange={(event) => onChange(setNested(config, {
              resourceAccess: normalizeResourceAccessPolicy(event.target.value),
            }))}
          >
            <option value="downloadable">Downloadable</option>
            <option value="view-only">View-only</option>
          </select>
          <p className="text-xs text-muted-foreground">
            View-only PDFs load through short-lived in-workspace access.
          </p>
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

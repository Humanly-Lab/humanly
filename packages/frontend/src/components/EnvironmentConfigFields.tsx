'use client';

import { HelpCircle } from 'lucide-react';
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
  normalizeWritingAttemptPolicy,
  normalizeWritingAiPolicy,
  normalizeCopyPastePolicy,
  normalizeWritingDetectorConfig,
  normalizeResourceAccessPolicy,
  WritingEnvironmentConfig,
  WritingAiPolicyMode,
  WritingAttemptPolicyMode,
} from '@humanly/shared';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';

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

const parseMaxAttempts = (value: string, fallback = 2): number => {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(2, Math.min(20, Math.floor(parsed)));
};
const DETECTOR_HELP_TEXT = 'Anomaly Pattern uses deterministic event rules such as typing bursts, untracked text sources, workspace exits, policy refusals, and blocked copy-paste attempts. Humanly Typing Detector uses a model over writing behavior and may be inconclusive or unavailable if there is not enough usable typing data.';

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
      attemptPolicy: normalizeWritingAttemptPolicy(value.submission?.attemptPolicy),
    },
    traceability: {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.traceability,
      ...value.traceability,
    },
    detectors: normalizeWritingDetectorConfig(value.detectors),
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
            <option value="admin_assigned">Publisher Assigned Task</option>
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
            <Label>AI Guard policy</Label>
            <select
              aria-label="AI Guard policy"
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
            <option value="allowed">Copy-paste allowed</option>
            <option value="blocked">Copy-paste blocked</option>
          </select>
        </div>

        {config.taskType === 'admin_assigned' && (
          <div className="space-y-2">
            <Label>Task Attempts</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={normalizeWritingAttemptPolicy(config.submission.attemptPolicy).mode}
              disabled={disabled}
              onChange={(event) => onChange(setNested(config, {
                submission: {
                  ...config.submission,
                  attemptPolicy: normalizeWritingAttemptPolicy({
                    ...config.submission.attemptPolicy,
                    mode: event.target.value as WritingAttemptPolicyMode,
                  }),
                },
              }))}
            >
              <option value="single">Single durable attempt</option>
              <option value="restart_allowed">Allow writers to restart</option>
            </select>
            <p className="text-xs text-muted-foreground">
              Single attempt restores the same submission if a writer rejoins.
            </p>
          </div>
        )}

        {config.taskType === 'admin_assigned'
          && normalizeWritingAttemptPolicy(config.submission.attemptPolicy).mode === 'restart_allowed' && (
            <div className="space-y-2">
              <Label htmlFor="max-task-attempts">Maximum Attempts</Label>
              <Input
                id="max-task-attempts"
                type="number"
                min={2}
                max={20}
                value={normalizeWritingAttemptPolicy(config.submission.attemptPolicy).maxAttempts || 2}
                disabled={disabled}
                onChange={(event) => onChange(setNested(config, {
                  submission: {
                    ...config.submission,
                    attemptPolicy: normalizeWritingAttemptPolicy({
                      mode: 'restart_allowed',
                      maxAttempts: parseMaxAttempts(
                        event.target.value,
                        normalizeWritingAttemptPolicy(config.submission.attemptPolicy).maxAttempts || 2
                      ),
                    }),
                  },
                }))}
              />
              <p className="text-xs text-muted-foreground">
                Previous attempts and certificates remain saved.
              </p>
            </div>
          )}

        <div className="space-y-2">
          <Label>Instruction PDF Access</Label>
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={normalizeResourceAccessPolicy(config.resourceAccess)}
            disabled={disabled}
            onChange={(event) => onChange(setNested(config, {
              resourceAccess: normalizeResourceAccessPolicy(event.target.value),
            }))}
          >
            <option value="downloadable">View and download</option>
            <option value="view-only">View only</option>
          </select>
          <p className="text-xs text-muted-foreground">
            View-only instruction PDFs load through short-lived workspace access.
          </p>
        </div>
      </div>

      <div className="space-y-3 rounded-md border bg-muted/30 p-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <Label>Anomaly behavior review</Label>
            <p className="text-xs text-muted-foreground">
              Choose which detector results are generated for the certificate.
            </p>
          </div>
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Explain detector types"
                className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <HelpCircle className="h-4 w-4" aria-hidden="true" />
              </button>
            </PopoverTrigger>
            <PopoverContent align="start" className="space-y-2 text-sm">
              <p className="font-medium text-foreground">Detector types</p>
              <p className="leading-relaxed text-muted-foreground">{DETECTOR_HELP_TEXT}</p>
            </PopoverContent>
          </Popover>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex items-start justify-between gap-3 rounded-md border bg-background p-3 text-sm">
            <span>
              <span className="font-medium">Anomaly Pattern</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                Deterministic review signals from typing bursts, untracked text sources, workspace exits, policy refusals, and blocked copy-paste attempts.
              </span>
            </span>
            <Checkbox
              checked={config.detectors.anomalyPattern.enabled}
              disabled={disabled}
              onCheckedChange={(checked) => onChange(setNested(config, {
                detectors: {
                  ...config.detectors,
                  anomalyPattern: { enabled: checked === true },
                },
              }))}
            />
          </label>

          <label className="flex items-start justify-between gap-3 rounded-md border bg-background p-3 text-sm">
            <span>
              <span className="font-medium">Humanly Typing Detector</span>
              <span className="mt-1 block text-xs leading-relaxed text-muted-foreground">
                Model-based typing analysis that estimates whether the trajectory looks human-written.
              </span>
            </span>
            <Checkbox
              checked={config.detectors.humanTyping.enabled}
              disabled={disabled}
              onCheckedChange={(checked) => onChange(setNested(config, {
                detectors: {
                  ...config.detectors,
                  humanTyping: { enabled: checked === true },
                },
              }))}
            />
          </label>
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

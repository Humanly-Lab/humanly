'use client';

import {
  formatCompactDuration,
  formatWritingAiAccess,
  formatWritingAiPolicy,
  isWritingAiChatEnabled,
  normalizeCopyPastePolicy,
  normalizeResourceAccessPolicy,
  type WritingEnvironmentConfig,
} from '@humanly/shared';

import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { formatDateTime } from '@/lib/utils';

interface TaskRulesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  config: WritingEnvironmentConfig;
  taskName?: string | null;
  taskStartDate?: string | null;
  taskEndDate?: string | null;
}

interface RuleItem {
  id: string;
  text: string;
}

function formatCharacterRequirement(config: WritingEnvironmentConfig) {
  const min = config.submission?.minCharacters;
  const max = config.submission?.maxCharacters;

  if (min && max) return `${min.toLocaleString()}-${max.toLocaleString()} characters`;
  if (min) return `At least ${min.toLocaleString()} characters`;
  if (max) return `At most ${max.toLocaleString()} characters`;
  return 'No length requirement';
}

function formatWritingTime(config: WritingEnvironmentConfig) {
  const seconds = config.time?.timeLimitSeconds;
  return seconds ? formatCompactDuration(seconds) : 'No session time limit';
}

function formatLengthRule(config: WritingEnvironmentConfig) {
  const requirement = formatCharacterRequirement(config);
  return requirement === 'No length requirement'
    ? 'No length requirement.'
    : `Final text must be ${requirement}.`;
}

function formatWritingTimeRule(config: WritingEnvironmentConfig) {
  const writingTime = formatWritingTime(config);
  return writingTime === 'No session time limit'
    ? 'No session time limit.'
    : `Writing time limit is ${writingTime}.`;
}

function formatAiAccessRule(config: WritingEnvironmentConfig, guardText: string | null) {
  const access = formatWritingAiAccess(config.aiAccess);
  const base = access === 'Off'
    ? 'AI is off.'
    : access === 'Only polish'
      ? 'AI is limited to polish actions.'
      : access === 'Only agent chat'
        ? 'AI is limited to agent chat.'
        : 'Full AI assistance is allowed.';

  return guardText ? `${base} ${guardText}` : base;
}

function formatTaskWindow(
  config: WritingEnvironmentConfig,
  taskStartDate?: string | null,
  taskEndDate?: string | null
) {
  const start = taskStartDate || config.time?.startTime || null;
  const end = taskEndDate || config.time?.endTime || null;

  if (start && end) return `${formatDateTime(start)} - ${formatDateTime(end)}`;
  if (start) return `Opens ${formatDateTime(start)}`;
  if (end) return `Due ${formatDateTime(end)}`;
  return 'No scheduled task window';
}

function formatTraceability(config: WritingEnvironmentConfig) {
  const traceability = config.traceability || {};
  const enabled = [
    traceability.trackTyping ? 'typing' : null,
    traceability.trackCopyPaste ? 'copy-paste' : null,
    traceability.trackFocusBlur ? 'workspace focus' : null,
    traceability.trackAiUsage ? 'AI assistance' : null,
  ].filter(Boolean);

  return enabled.length > 0 ? enabled.join(', ') : 'No activity tracking configured';
}

function buildRuleItems(
  config: WritingEnvironmentConfig,
  taskStartDate?: string | null,
  taskEndDate?: string | null
): RuleItem[] {
  const aiPolicy = formatWritingAiPolicy(config);
  const isChatEnabled = isWritingAiChatEnabled(config.aiAccess);
  const aiGuardText = isChatEnabled
    ? (aiPolicy === 'Guard'
        ? 'Agent chat follows the owner policy guard.'
        : 'Agent chat is not policy-guarded.')
    : null;
  const copyPaste = normalizeCopyPastePolicy(config.copyPastePolicy) === 'blocked'
    ? 'Copy-paste is blocked.'
    : 'Copy-paste is allowed.';
  const resourceAccess = normalizeResourceAccessPolicy(config.resourceAccess) === 'view-only'
    ? 'PDF resources are view-only.'
    : 'PDF resources can be downloaded.';
  const traceability = formatTraceability(config);

  return [
    {
      id: 'ai-access',
      text: formatAiAccessRule(config, aiGuardText),
    },
    {
      id: 'copy-paste',
      text: copyPaste,
    },
    {
      id: 'length',
      text: formatLengthRule(config),
    },
    {
      id: 'writing-time',
      text: formatWritingTimeRule(config),
    },
    {
      id: 'task-window',
      text: `Task window: ${formatTaskWindow(config, taskStartDate, taskEndDate)}.`,
    },
    {
      id: 'resource-access',
      text: resourceAccess,
    },
    {
      id: 'recorded-activity',
      text: `Humanly records ${traceability} for logs, replay, and certificate evidence.`,
    },
  ];
}

export function TaskRulesDialog({
  open,
  onOpenChange,
  config,
  taskName,
  taskStartDate,
  taskEndDate,
}: TaskRulesDialogProps) {
  const ruleItems = buildRuleItems(config, taskStartDate, taskEndDate);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Writing task rules</DialogTitle>
          <DialogDescription>
            {taskName ? `${taskName} uses these writing rules.` : 'This task uses these writing rules.'}
          </DialogDescription>
        </DialogHeader>

        <ul className="space-y-2 rounded-lg border border-border/70 bg-muted/20 px-5 py-4 text-sm leading-6 text-foreground">
          {ruleItems.map((item) => (
            <li key={item.id} className="ml-3 list-disc pl-1">
              {item.text}
            </li>
          ))}
        </ul>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

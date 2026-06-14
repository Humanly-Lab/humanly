'use client';

import type { ReactNode } from 'react';

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
  content: ReactNode;
}

function formatCharacterRequirement(config: WritingEnvironmentConfig): string | null {
  const min = config.submission?.minCharacters;
  const max = config.submission?.maxCharacters;

  if (min && max) return `${min.toLocaleString()}-${max.toLocaleString()} characters`;
  if (min) return `At least ${min.toLocaleString()} characters`;
  if (max) return `At most ${max.toLocaleString()} characters`;
  return null;
}

function formatWritingTime(config: WritingEnvironmentConfig) {
  const seconds = config.time?.timeLimitSeconds;
  return seconds ? formatCompactDuration(seconds) : 'No session time limit';
}

function formatLengthRule(config: WritingEnvironmentConfig): string | null {
  const requirement = formatCharacterRequirement(config);
  return requirement ? `Final text must be ${requirement} before submission.` : null;
}

function formatWritingTimeRule(config: WritingEnvironmentConfig): string | null {
  const writingTime = formatWritingTime(config);
  return writingTime === 'No session time limit'
    ? null
    : `The writing timer is ${writingTime} once you start this session.`;
}

function formatAiAccessRule(config: WritingEnvironmentConfig): ReactNode {
  const access = formatWritingAiAccess(config.aiAccess);
  const base = access === 'Off'
    ? 'Internal AI is off for this task.'
    : access === 'Only polish'
      ? 'Internal AI is limited to polish actions on selected text.'
      : access === 'Only agent chat'
        ? 'Internal AI is limited to agent chat.'
        : 'Internal AI assistance is allowed inside Humanly.';

  return (
    <>
      {base}{' '}
      <strong>External AI tool use is strictly prohibited.</strong>
    </>
  );
}

function formatTaskWindowRule(
  config: WritingEnvironmentConfig,
  taskStartDate?: string | null,
  taskEndDate?: string | null
): string | null {
  const start = taskStartDate || config.time?.startTime || null;
  const end = taskEndDate || config.time?.endTime || null;

  if (start && end) {
    return `Task window: ${formatDateTime(start)} - ${formatDateTime(end)}. Submissions follow this availability window.`;
  }
  if (start) return `Task window: Opens ${formatDateTime(start)}. Submissions follow this availability window.`;
  if (end) return `Task window: Due ${formatDateTime(end)}. Submissions follow this availability window.`;
  return null;
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
  const showAiGuard = isWritingAiChatEnabled(config.aiAccess) && aiPolicy === 'Guard';
  const copyPaste = normalizeCopyPastePolicy(config.copyPastePolicy) === 'blocked'
    ? 'Copy-paste is blocked, so pasted content is prevented in the editor.'
    : 'Copy-paste is allowed, and paste events are still recorded in the activity log.';
  const resourceAccess = normalizeResourceAccessPolicy(config.resourceAccess) === 'view-only'
    ? 'PDF resources are view-only; they can be read in the workspace but not downloaded.'
    : 'PDF resources can be downloaded when attached to this task.';
  const traceability = formatTraceability(config);

  const items: RuleItem[] = [
    {
      id: 'ai-access',
      content: formatAiAccessRule(config),
    },
  ];

  if (showAiGuard) {
    items.push({
      id: 'ai-policy-guard',
      content: 'The owner policy guard may refuse requests that conflict with the task rules.',
    });
  }

  items.push({
    id: 'copy-paste',
    content: copyPaste,
  });

  const lengthRule = formatLengthRule(config);
  if (lengthRule) {
    items.push({
      id: 'length',
      content: lengthRule,
    });
  }

  const writingTimeRule = formatWritingTimeRule(config);
  if (writingTimeRule) {
    items.push({
      id: 'writing-time',
      content: writingTimeRule,
    });
  }

  const taskWindowRule = formatTaskWindowRule(config, taskStartDate, taskEndDate);
  if (taskWindowRule) {
    items.push({
      id: 'task-window',
      content: taskWindowRule,
    });
  }

  items.push(
    {
      id: 'resource-access',
      content: resourceAccess,
    },
    {
      id: 'recorded-activity',
      content: `Humanly records ${traceability} to build the activity log, replay, and certificate evidence.`,
    }
  );

  return items;
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
              {item.content}
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

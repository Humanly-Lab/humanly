'use client';

import { useState } from 'react';
import { Activity, BrainCircuit, Calendar, Clock, Copy, FileText, Link, Loader2, Users } from 'lucide-react';
import { normalizeCopyPastePolicy, type Task } from '@humanly/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { buildTaskShareUrl } from '@/lib/certificate-url';
import { formatDateTime, getLocalTimeZoneLabel } from '@/lib/utils';

import type { AdminSubmission, TaskStats } from './types';

interface OverviewPanelProps {
  task: Task;
  stats: TaskStats | null;
  submissions: AdminSubmission[];
  isLoadingStats: boolean;
  isLoadingSubmissions: boolean;
}

const formatCharacterBounds = (submission?: NonNullable<Task['environmentConfig']>['submission']) => {
  const min = submission?.minCharacters;
  const max = submission?.maxCharacters;

  if (min && max) return `${min.toLocaleString()}-${max.toLocaleString()} characters`;
  if (min) return `At least ${min.toLocaleString()} characters`;
  if (max) return `Up to ${max.toLocaleString()} characters`;
  return 'No limit';
};

const formatWritingSessionLimit = (timeLimitSeconds?: number) => {
  if (!timeLimitSeconds) return 'No limit';

  const totalMinutes = Math.max(1, Math.round(timeLimitSeconds / 60));
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;

  if (hours && minutes) {
    return `${hours.toLocaleString()} ${hours === 1 ? 'hour' : 'hours'} ${minutes.toLocaleString()} ${minutes === 1 ? 'minute' : 'minutes'}`;
  }

  if (hours) {
    return `${hours.toLocaleString()} ${hours === 1 ? 'hour' : 'hours'}`;
  }

  return `${minutes.toLocaleString()} ${minutes === 1 ? 'minute' : 'minutes'}`;
};

const formatAiProvider = (provider?: NonNullable<Task['environmentConfig']>['aiProvider']) => {
  if (!provider?.baseUrl) return null;

  if (provider.provider === 'together') return 'Together AI';
  if (provider.provider === 'openrouter') return 'OpenRouter';
  if (provider.provider === 'openai') return 'OpenAI';
  if (provider.provider === 'claude') return 'Anthropic';

  try {
    return new URL(provider.baseUrl).hostname;
  } catch {
    return provider.baseUrl;
  }
};

export function OverviewPanel({
  task,
  stats,
  submissions,
  isLoadingStats,
  isLoadingSubmissions,
}: OverviewPanelProps) {
  const [copyFeedback, setCopyFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const inviteCode = task.taskToken?.slice(0, 6).toUpperCase() || 'PENDING';
  const enrolledUserCount = task.enrolledUserCount ?? 0;
  const totalEvents = stats?.totalEvents ?? 0;
  const totalSubmissions = submissions.length;
  const submittedUserCount = new Set(submissions.map((submission) => submission.userId)).size;
  const completionRate = enrolledUserCount > 0 ? (submittedUserCount / enrolledUserCount) * 100 : 0;
  const environmentAiAccess = task.environmentConfig?.aiAccess;
  const isAiEnabled = environmentAiAccess ? environmentAiAccess !== 'off' : !!task.allowedLlmModels?.length;
  const allowedLlmModels = isAiEnabled
    ? (task.environmentConfig?.allowedModels?.length ? task.environmentConfig.allowedModels : task.allowedLlmModels || [])
    : [];
  const aiProviderLabel = isAiEnabled ? formatAiProvider(task.environmentConfig?.aiProvider) : null;
  const aiUsageLimit = isAiEnabled
    ? (task.environmentConfig?.aiUsageLimit?.maxRequests ?? task.aiUsageLimit ?? null)
    : null;
  const aiUsageLimitSummary = isAiEnabled
    ? (aiUsageLimit === null ? 'No request limit configured' : `${aiUsageLimit.toLocaleString()} requests per user`)
    : 'AI disabled';
  const copyPasteSummary = normalizeCopyPastePolicy(task.environmentConfig?.copyPastePolicy) === 'blocked'
    ? 'Blocked'
    : 'Allowed';
  const writingSessionSummary = formatWritingSessionLimit(task.environmentConfig?.time?.timeLimitSeconds);
  const characterBoundsSummary = formatCharacterBounds(task.environmentConfig?.submission);
  const localTimeZoneLabel = getLocalTimeZoneLabel();

  const copyInviteCode = async () => {
    setCopyFeedback(null);

    if (!navigator.clipboard?.writeText) {
      setCopyFeedback({
        type: 'error',
        message: 'Clipboard copy is not available in this browser. Select the invite code and copy it manually.',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(inviteCode);
      setCopyFeedback({
        type: 'success',
        message: 'Invite code copied to clipboard.',
      });
    } catch (err) {
      console.warn('Failed to copy invite code:', err);
      setCopyFeedback({
        type: 'error',
        message: 'Could not copy the invite code. Select the code and copy it manually.',
      });
    }
  };

  const copyShareLink = async () => {
    setCopyFeedback(null);
    const shareLink = buildTaskShareUrl(task.taskToken);

    if (!navigator.clipboard?.writeText) {
      setCopyFeedback({
        type: 'error',
        message: 'Clipboard copy is not available in this browser. Select the share link and copy it manually.',
      });
      return;
    }

    try {
      await navigator.clipboard.writeText(shareLink);
      setCopyFeedback({
        type: 'success',
        message: 'Share link copied to clipboard.',
      });
    } catch (err) {
      console.warn('Failed to copy share link:', err);
      setCopyFeedback({
        type: 'error',
        message: 'Could not copy the share link. Select the link and copy it manually.',
      });
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Task Overview</CardTitle>
          <CardDescription>Admin metadata, invite code, and writing-task settings</CardDescription>
          <p className="text-xs text-muted-foreground">
            Times shown in your local timezone: {localTimeZoneLabel}
          </p>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Task ID</dt>
              <dd className="mt-1 text-sm">{task.id}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Created</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {formatDateTime(task.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Task Begin Date</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {formatDateTime(task.startDate)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Task End Date</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {formatDateTime(task.endDate)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Copy & Paste</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm">
                <Copy className="h-4 w-4 text-muted-foreground" />
                {copyPasteSummary}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Writing Session</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-muted-foreground" />
                {writingSessionSummary}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Final Submission Length</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                {characterBoundsSummary}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Invite Code</dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className="rounded-md border bg-muted/40 px-2 py-1 text-sm font-semibold tracking-wider">
                  {inviteCode}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={copyInviteCode}
                  title="Copy invite code"
                  aria-label="Copy invite code"
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Public Share Link</dt>
              <dd className="mt-1 flex items-center gap-2">
                <span
                  className="min-w-0 truncate rounded-md border bg-muted/40 px-2 py-1 text-sm"
                  title={buildTaskShareUrl(task.taskToken)}
                >
                  {buildTaskShareUrl(task.taskToken)}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={copyShareLink}
                  title="Copy public share link"
                  aria-label="Copy public share link"
                >
                  <Link className="h-4 w-4" />
                </Button>
              </dd>
              <p className="mt-1 text-xs text-muted-foreground">
                {task.allowGuestSubmissions === false
                  ? 'Visitors must sign in or create an account before writing from this link.'
                  : 'Anyone with this link can write and submit without registering.'}
              </p>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">AI Access</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                {isAiEnabled ? 'Enabled' : 'Disabled'}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">AI Model</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm">
                <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                {isAiEnabled && allowedLlmModels.length ? (
                  <span className="flex flex-wrap items-center gap-2">
                    {aiProviderLabel && (
                      <span className="rounded-md border border-border/70 bg-muted/40 px-2 py-0.5 text-xs text-muted-foreground">
                        {aiProviderLabel}
                      </span>
                    )}
                    {allowedLlmModels.map((model) => (
                      <span key={model} className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                        {model}
                      </span>
                    ))}
                  </span>
                ) : (
                  <span>{isAiEnabled ? 'No model configured' : 'AI is off for this task'}</span>
                )}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">AI Usage Limit</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm">
                <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                {aiUsageLimitSummary}
              </dd>
            </div>
          </div>
          {copyFeedback && (
            <p
              role={copyFeedback.type === 'error' ? 'alert' : 'status'}
              className={`text-sm ${
                copyFeedback.type === 'error' ? 'text-destructive' : 'text-green-700 dark:text-green-400'
              }`}
            >
              {copyFeedback.message}
            </p>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Events</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalEvents.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Recorded task activity</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingSubmissions ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold">{totalSubmissions.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Across enrolled users</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold">{enrolledUserCount.toLocaleString()}</div>
                <p className="text-xs text-muted-foreground">Users enrolled in this task</p>
              </>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Completion Rate</CardTitle>
            <Activity className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoadingStats ? (
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            ) : (
              <>
                <div className="text-2xl font-bold">{completionRate.toFixed(1)}%</div>
                <p className="text-xs text-muted-foreground">of enrolled users submitted</p>
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

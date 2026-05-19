'use client';

import { useState } from 'react';
import { Activity, BrainCircuit, Calendar, Copy, FileText, Loader2, Users } from 'lucide-react';
import type { Task } from '@humanly/shared';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { formatDateTime } from '@/lib/utils';

import type { AdminSubmission, TaskStats } from './types';

interface OverviewPanelProps {
  task: Task;
  stats: TaskStats | null;
  submissions: AdminSubmission[];
  isLoadingStats: boolean;
  isLoadingSubmissions: boolean;
}

const getServiceTypeLabel = (type: string | null | undefined) => {
  if (!type) return 'Not specified';
  const labels: Record<string, string> = {
    qualtrics: 'Qualtrics',
    'google-forms': 'Google Forms',
    custom: 'Custom',
    other: 'Other',
  };
  return labels[type] || type;
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
  const allowedLlmModels = task.allowedLlmModels?.length ? task.allowedLlmModels : ['GPT-4o mini'];
  const aiUsageLimit = task.aiUsageLimit ?? 100;

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

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Task Overview</CardTitle>
          <CardDescription>Admin metadata, invite code, and writing-task settings</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Task ID</dt>
              <dd className="mt-1 font-mono text-sm">{task.id}</dd>
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
              <dt className="text-sm font-medium text-muted-foreground">Invite Code</dt>
              <dd className="mt-1 flex items-center gap-2">
                <span className="rounded-md border bg-muted/40 px-2 py-1 font-mono text-sm font-semibold tracking-wider">
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
              {copyFeedback && (
                <p
                  role={copyFeedback.type === 'error' ? 'alert' : 'status'}
                  className={`mt-2 text-sm ${
                    copyFeedback.type === 'error' ? 'text-destructive' : 'text-green-700 dark:text-green-400'
                  }`}
                >
                  {copyFeedback.message}
                </p>
              )}
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Instruction Files</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-muted-foreground" />
                Ready for task files API
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Status</dt>
              <dd className="mt-1 text-sm">
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    task.isActive
                      ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                      : 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200'
                  }`}
                >
                  {task.isActive ? 'Active' : 'Inactive'}
                </span>
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Allowed AI Models</dt>
              <dd className="mt-1 flex flex-wrap items-center gap-2 text-sm">
                <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                {allowedLlmModels.map((model) => (
                  <span key={model} className="rounded-md bg-secondary px-2 py-0.5 text-xs text-secondary-foreground">
                    {model}
                  </span>
                ))}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">AI Usage Limit</dt>
              <dd className="mt-1 flex items-center gap-2 text-sm">
                <BrainCircuit className="h-4 w-4 text-muted-foreground" />
                {aiUsageLimit.toLocaleString()} requests per user
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">External Service</dt>
              <dd className="mt-1 text-sm">{getServiceTypeLabel(task.externalServiceType)}</dd>
            </div>
          </div>
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

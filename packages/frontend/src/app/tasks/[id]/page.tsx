'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import {
  BarChart3,
  Eye,
  Download,
  Settings,
  Users,
  Activity,
  Calendar,
  AlertCircle,
  Loader2,
  List,
  Copy,
  FileText,
  BrainCircuit
} from 'lucide-react';
import { Task, AnalyticsSummary } from '@humanly/shared';
import api, { ApiError } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import SubmissionsTable, { AdminSubmission } from '@/components/SubmissionsTable';

interface TaskStats extends AnalyticsSummary {
  lastActivity?: Date;
}

export default function TaskOverviewPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;

  const [task, setTask] = useState<Task | null>(null);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [isLoadingTask, setIsLoadingTask] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  const fetchTask = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoadingTask(true);
      setError(null);
      const response = await api.get<{
        success: boolean;
        data: Task;
      }>(`/api/v1/tasks/${taskId}`);
      setTask(response.data);
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.statusCode === 404) {
        setError('Task not found. It may have been deleted or you may not have permission to view it.');
      } else if (apiError.statusCode === 403) {
        setError('You do not have permission to view this task.');
      } else {
        setError(apiError.message || 'Failed to load task details.');
      }
    } finally {
      if (showLoading) setIsLoadingTask(false);
    }
  }, [taskId]);

  const fetchStats = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoadingStats(true);
      const response = await api.get<{
        success: boolean;
        data: AnalyticsSummary;
      }>(`/api/v1/tasks/${taskId}/analytics/summary`);
      setStats(response.data);
    } catch (err) {
      // Stats are optional, don't show error if they fail
      console.error('Failed to load task stats:', err);
      setStats({
          totalEvents: 0,
          totalSessions: 0,
          uniqueUsers: 0,
          totalUsers: 0,
          avgEventsPerSession: 0,
          avgSessionDuration: 0,
          completionRate: 0,
          activeUsers24h: 0,
        });
    } finally {
      if (showLoading) setIsLoadingStats(false);
    }
  }, [taskId]);

  const fetchSubmissions = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoadingSubmissions(true);
      const response = await api.get<{
        success: boolean;
        data: {
          submissions: AdminSubmission[];
        };
      }>(`/api/v1/tasks/${taskId}/submissions`);
      setSubmissions(response.data.submissions);
    } catch (err) {
      console.error('Failed to load task submissions:', err);
      setSubmissions([]);
    } finally {
      if (showLoading) setIsLoadingSubmissions(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (taskId) {
      fetchTask();
      fetchStats();
      fetchSubmissions();
    }
  }, [fetchTask, fetchStats, fetchSubmissions, taskId]);

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

  const inviteCode = task?.taskToken?.slice(0, 6).toUpperCase() || 'PENDING';
  const enrolledUserCount = task?.enrolledUserCount ?? 0;
  const totalEvents = stats?.totalEvents ?? 0;
  const totalSubmissions = submissions.length;
  const submittedUserCount = new Set(submissions.map((submission) => submission.userId)).size;
  const completionRate = enrolledUserCount > 0 ? (submittedUserCount / enrolledUserCount) * 100 : 0;
  const allowedLlmModels = task?.allowedLlmModels?.length ? task.allowedLlmModels : ['GPT-4o mini'];
  const aiUsageLimit = task?.aiUsageLimit ?? 100;

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

  if (isLoadingTask) {
    return (
      <div className="min-h-[calc(100vh-200px)] flex items-center justify-center">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="text-muted-foreground">Loading task...</p>
        </div>
      </div>
    );
  }

  if (error || !task) {
    return (
      <div className="max-w-4xl mx-auto">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{error || 'Task not found'}</AlertDescription>
        </Alert>
        <div className="mt-6">
          <Button onClick={() => router.push('/tasks')} variant="outline">
            Back to Tasks
          </Button>
        </div>
      </div>
    );
  }

  const navigationItems = [
    {
      icon: BarChart3,
      label: 'View Analytics',
      href: `/tasks/${taskId}/analytics`,
      description: 'Inspect AI usage, activity, and writing telemetry',
    },
    {
      icon: List,
      label: 'Enrolled Users',
      href: `/tasks/${taskId}/enrollments`,
      description: 'Review enrolled users and their task submissions',
    },
    {
      icon: Eye,
      label: 'Live Monitoring',
      href: `/tasks/${taskId}/live-preview`,
      description: 'Monitor writing activity in real time',
    },
    {
      icon: FileText,
      label: 'Instruction Files',
      href: `/tasks/${taskId}/instructions`,
      description: 'Manage shared PDFs and task instructions',
    },
    {
      icon: Download,
      label: 'User Documents',
      href: `/tasks/${taskId}/export`,
      description: 'Export or review task submissions',
    },
    {
      icon: Settings,
      label: 'Task Settings',
      href: `/tasks/${taskId}/settings`,
      description: 'Configure task metadata, models, and usage limits',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">{task.name}</h1>
          {task.description && (
            <p className="text-muted-foreground mt-2 whitespace-pre-line">{task.description}</p>
          )}
        </div>
        <Button
          variant="outline"
          onClick={() => router.push('/tasks')}
        >
          Back to Tasks
        </Button>
      </div>

      {/* Task Details Card */}
      <Card>
        <CardHeader>
          <CardTitle>Task Overview</CardTitle>
          <CardDescription>Admin metadata, invite code, and writing-task settings</CardDescription>
        </CardHeader>
        <CardContent className="grid gap-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Task ID</dt>
              <dd className="text-sm font-mono mt-1">{task.id}</dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Created</dt>
              <dd className="text-sm mt-1 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {formatDate(task.createdAt)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Task Begin Date</dt>
              <dd className="text-sm mt-1 flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                {formatDateTime(task.startDate)}
              </dd>
            </div>
            <div>
              <dt className="text-sm font-medium text-muted-foreground">Task End Date</dt>
              <dd className="text-sm mt-1 flex items-center gap-2">
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
              <dd className="text-sm mt-1">
                <span
                  className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
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
              <dd className="text-sm mt-1">{getServiceTypeLabel(task.externalServiceType)}</dd>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Stats Cards */}
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
            {isLoadingTask || isLoadingStats ? (
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

      <SubmissionsTable
        taskId={taskId}
        submissions={submissions}
        isLoading={isLoadingSubmissions}
        onRefresh={() => fetchSubmissions()}
      />

      {/* Navigation Cards */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <Link key={item.href} href={item.href}>
                <Card className="hover:bg-accent/50 transition-colors cursor-pointer h-full">
                  <CardHeader>
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/10 rounded-lg">
                        <Icon className="h-5 w-5 text-primary" />
                      </div>
                      <CardTitle className="text-base">{item.label}</CardTitle>
                    </div>
                  </CardHeader>
                  <CardContent>
                    <CardDescription>{item.description}</CardDescription>
                  </CardContent>
                </Card>
              </Link>
            );
          })}
        </div>
      </div>
    </div>
  );
}

'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Loader2 } from 'lucide-react';
import type { AnalyticsSummary, Task } from '@humanly/shared';

import api, { ApiError } from '@/lib/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

import { AnalyticsPanel } from './_components/AnalyticsPanel';
import { OverviewPanel } from './_components/OverviewPanel';
import { SettingsPanel } from './_components/SettingsPanel';
import { SubmissionPanel } from './_components/SubmissionPanel';
import { UsersPanel } from './_components/UsersPanel';
import {
  TASK_DETAIL_TABS,
  parseTaskDetailTab,
  taskDetailTabHref,
  type AdminSubmission,
  type TaskEnrollment,
  type TaskStats,
} from './_components/types';

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = params.id as string;
  const activeTab = useMemo(
    () => parseTaskDetailTab(searchParams.get('tab')),
    [searchParams]
  );

  const [task, setTask] = useState<Task | null>(null);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [enrollments, setEnrollments] = useState<TaskEnrollment[]>([]);
  const [isLoadingTask, setIsLoadingTask] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(true);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(true);
  const [isLoadingEnrollments, setIsLoadingEnrollments] = useState(true);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [enrollmentsError, setEnrollmentsError] = useState<string | null>(null);

  const fetchTask = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoadingTask(true);
      setTaskError(null);
      const response = await api.get<{
        success: boolean;
        data: Task;
      }>(`/api/v1/tasks/${taskId}`);
      setTask(response.data);
    } catch (err) {
      const apiError = err as ApiError;
      if (apiError.statusCode === 404) {
        setTaskError('Task not found. It may have been deleted or you may not have permission to view it.');
      } else if (apiError.statusCode === 403) {
        setTaskError('You do not have permission to view this task.');
      } else {
        setTaskError(apiError.message || 'Failed to load task details.');
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

  const fetchEnrollments = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) setIsLoadingEnrollments(true);
      setEnrollmentsError(null);
      const response = await api.get<{
        success: boolean;
        data: {
          enrollments: TaskEnrollment[];
        };
      }>(`/api/v1/tasks/${taskId}/enrollments`);
      setEnrollments(response.data.enrollments);
    } catch (err) {
      const apiError = err as ApiError;
      setEnrollmentsError(apiError.message || 'Failed to load enrolled users');
      setEnrollments([]);
    } finally {
      if (showLoading) setIsLoadingEnrollments(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (taskId) {
      fetchTask();
      fetchStats();
      fetchSubmissions();
      fetchEnrollments();
    }
  }, [fetchEnrollments, fetchStats, fetchSubmissions, fetchTask, taskId]);

  if (isLoadingTask) {
    return (
      <div className="flex min-h-[calc(100vh-200px)] items-center justify-center">
        <div className="text-center">
          <Loader2 className="mx-auto mb-4 h-12 w-12 animate-spin text-primary" />
          <p className="text-muted-foreground">Loading task...</p>
        </div>
      </div>
    );
  }

  if (taskError || !task) {
    return (
      <div className="mx-auto max-w-4xl">
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>{taskError || 'Task not found'}</AlertDescription>
        </Alert>
        <div className="mt-6">
          <Button onClick={() => router.push('/tasks')} variant="outline">
            Back to Tasks
          </Button>
        </div>
      </div>
    );
  }

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'submission':
        return (
          <SubmissionPanel
            taskId={taskId}
            enrollments={enrollments}
            submissions={submissions}
            isLoadingEnrollments={isLoadingEnrollments}
            isLoadingSubmissions={isLoadingSubmissions}
            enrollmentsError={enrollmentsError}
            onRefresh={() => {
              fetchEnrollments();
              fetchSubmissions();
            }}
          />
        );
      case 'users':
        return (
          <UsersPanel
            enrollments={enrollments}
            isLoading={isLoadingEnrollments}
            error={enrollmentsError}
            onRefresh={() => fetchEnrollments()}
          />
        );
      case 'analytics':
        return (
          <AnalyticsPanel
            taskId={taskId}
            taskStartDate={task.startDate}
            taskEndDate={task.endDate}
            enrollments={enrollments}
            submissions={submissions}
            isLoadingEnrollments={isLoadingEnrollments}
            isLoadingSubmissions={isLoadingSubmissions}
          />
        );
      case 'setting':
        return <SettingsPanel taskId={taskId} onTaskUpdated={setTask} />;
      case 'overview':
      default:
        return (
          <OverviewPanel
            task={task}
            stats={stats}
            submissions={submissions}
            isLoadingStats={isLoadingStats}
            isLoadingSubmissions={isLoadingSubmissions}
          />
        );
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="line-clamp-2 break-words text-3xl font-bold tracking-normal" title={task.name}>
            {task.name}
          </h1>
          {task.description && (
            <p className="mt-2 whitespace-pre-line text-muted-foreground">{task.description}</p>
          )}
        </div>
        <Button variant="ghost" className="px-0 hover:bg-transparent" onClick={() => router.push('/tasks')}>
          Back to Tasks
        </Button>
      </div>

      <div className="border-b border-border/70">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Task sections">
          {TASK_DETAIL_TABS.map((tab) => (
            <button
              key={tab.value}
              type="button"
              className={cn(
                'whitespace-nowrap border-b-2 px-0 pb-3 pt-1 text-sm font-medium transition-colors',
                activeTab === tab.value
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:border-border hover:text-foreground'
              )}
              onClick={() => router.replace(taskDetailTabHref(taskId, tab.value), { scroll: false })}
            >
              {tab.label}
            </button>
          ))}
        </nav>
      </div>

      {renderActivePanel()}
    </div>
  );
}

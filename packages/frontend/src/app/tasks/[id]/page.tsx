'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { AlertCircle, Archive, Link as LinkIcon, Loader2, Pause, Play, Square } from 'lucide-react';
import type { AnalyticsSummary, Task } from '@humanly/shared';

import api, { ApiError } from '@/lib/api-client';
import { buildTaskShareUrl } from '@/lib/certificate-url';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { cn } from '@/lib/utils';

import { AnalyticsPanel } from './_components/AnalyticsPanel';
import { OverviewPanel } from './_components/OverviewPanel';
import { SettingsPanel } from './_components/SettingsPanel';
import { SubmissionPanel } from './_components/SubmissionPanel';
import { UsersPanel } from './_components/UsersPanel';
import {
  getTaskDetailTabs,
  parseTaskDetailTab,
  taskDetailTabHref,
  type AdminSubmission,
  type SubmissionPagination,
  type TaskEnrollment,
  type TaskDetailTab,
  type TaskStats,
} from './_components/types';

const SUBMISSION_PAGE_SIZE = 100;
const ANALYTICS_SUBMISSION_PAGE_SIZE = 500;

export default function TaskDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const taskId = params.id as string;
  const requestedTab = useMemo(
    () => parseTaskDetailTab(searchParams.get('tab')),
    [searchParams]
  );

  const [task, setTask] = useState<Task | null>(null);
  const [stats, setStats] = useState<TaskStats | null>(null);
  const [submissions, setSubmissions] = useState<AdminSubmission[]>([]);
  const [submissionPagination, setSubmissionPagination] = useState<SubmissionPagination | null>(null);
  const [submissionScope, setSubmissionScope] = useState<'all' | string>('all');
  const [enrollments, setEnrollments] = useState<TaskEnrollment[]>([]);
  const [isLoadingTask, setIsLoadingTask] = useState(true);
  const [isLoadingStats, setIsLoadingStats] = useState(false);
  const [isLoadingSubmissions, setIsLoadingSubmissions] = useState(false);
  const [isLoadingMoreSubmissions, setIsLoadingMoreSubmissions] = useState(false);
  const [isLoadingEnrollments, setIsLoadingEnrollments] = useState(false);
  const [hasLoadedStats, setHasLoadedStats] = useState(false);
  const [hasLoadedSubmissions, setHasLoadedSubmissions] = useState(false);
  const [hasLoadedEnrollments, setHasLoadedEnrollments] = useState(false);
  const [taskError, setTaskError] = useState<string | null>(null);
  const [enrollmentsError, setEnrollmentsError] = useState<string | null>(null);
  const [isChangingLifecycle, setIsChangingLifecycle] = useState(false);

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
      setHasLoadedStats(true);
      if (showLoading) setIsLoadingStats(false);
    }
  }, [taskId]);

  const activeTab: TaskDetailTab = requestedTab;

  const fetchSubmissions = useCallback(async (
    showLoading = true,
    options: {
      append?: boolean;
      offset?: number;
      scope?: 'all' | string;
      limit?: number;
    } = {}
  ) => {
    const append = options.append === true;
    const scope = options.scope ?? submissionScope;
    const limit = options.limit ?? (activeTab === 'analytics' ? ANALYTICS_SUBMISSION_PAGE_SIZE : SUBMISSION_PAGE_SIZE);
    const offset = options.offset ?? 0;

    try {
      if (append) {
        setIsLoadingMoreSubmissions(true);
      } else if (showLoading) {
        setIsLoadingSubmissions(true);
      }
      const response = await api.get<{
        success: boolean;
        data: {
          submissions: AdminSubmission[];
          pagination?: SubmissionPagination;
        };
      }>(`/api/v1/tasks/${taskId}/submissions`, {
        params: {
          limit,
          offset,
          ...(scope !== 'all' ? { userId: scope } : {}),
        },
      });
      setSubmissions((current) => (
        append ? [...current, ...response.data.submissions] : response.data.submissions
      ));
      setSubmissionPagination(response.data.pagination || {
        total: response.data.submissions.length,
        limit,
        offset,
        hasMore: false,
      });
    } catch (err) {
      console.error('Failed to load assigned tasks:', err);
      if (!append) {
        setSubmissions([]);
        setSubmissionPagination(null);
      }
    } finally {
      setHasLoadedSubmissions(true);
      if (append) {
        setIsLoadingMoreSubmissions(false);
      } else if (showLoading) {
        setIsLoadingSubmissions(false);
      }
    }
  }, [activeTab, submissionScope, taskId]);

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
      setHasLoadedEnrollments(true);
      if (showLoading) setIsLoadingEnrollments(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (!taskId) return;

    setTask(null);
    setStats(null);
    setSubmissions([]);
    setSubmissionPagination(null);
    setSubmissionScope('all');
    setEnrollments([]);
    setHasLoadedStats(false);
    setHasLoadedSubmissions(false);
    setHasLoadedEnrollments(false);
    setEnrollmentsError(null);
    fetchTask();
  }, [fetchTask, taskId]);

  const visibleTabs = useMemo(() => getTaskDetailTabs(), []);

  useEffect(() => {
    if (activeTab !== 'submission' && submissionScope !== 'all') {
      setSubmissionScope('all');
    }
  }, [activeTab, submissionScope]);

  useEffect(() => {
    setSubmissions([]);
    setSubmissionPagination(null);
    setHasLoadedSubmissions(false);
  }, [activeTab, submissionScope, taskId]);

  useEffect(() => {
    if (!taskId || !task) return;

    if (activeTab === 'overview' && !hasLoadedStats && !isLoadingStats) {
      fetchStats();
    }

    if ((activeTab === 'submission' || activeTab === 'analytics') && !hasLoadedSubmissions && !isLoadingSubmissions) {
      fetchSubmissions();
    }

    if ((activeTab === 'submission' || activeTab === 'users' || activeTab === 'analytics') && !hasLoadedEnrollments && !isLoadingEnrollments) {
      fetchEnrollments();
    }
  }, [
    activeTab,
    fetchEnrollments,
    fetchStats,
    fetchSubmissions,
    hasLoadedEnrollments,
    hasLoadedStats,
    hasLoadedSubmissions,
    isLoadingEnrollments,
    isLoadingStats,
    isLoadingSubmissions,
    task,
    taskId,
  ]);

  const handleTaskLifecycleAction = async (action: 'launch' | 'pause' | 'resume' | 'end') => {
    if (!task) return;
    if (action === 'end' && !confirm('End this task? Writers will no longer be able to start or submit work. This cannot be undone.')) {
      return;
    }

    try {
      setIsChangingLifecycle(true);
      const response = await api.post<{
        success: boolean;
        data: Task;
        message: string;
      }>(`/api/v1/tasks/${task.id}/${action}`);
      setTask(response.data);
      toast({
        title: 'Task updated',
        description: response.message,
      });
    } catch (err) {
      const errorMessage = err instanceof ApiError
        ? err.message
        : `Failed to ${action} task`;
      toast({
        title: 'Task update failed',
        description: errorMessage,
        variant: 'destructive',
      });
    } finally {
      setIsChangingLifecycle(false);
    }
  };

  const handleSubmissionScopeChange = useCallback((scope: 'all' | string) => {
    setSubmissionScope(scope);
  }, []);

  const handleLoadMoreSubmissions = useCallback(() => {
    if (!submissionPagination || isLoadingMoreSubmissions || isLoadingSubmissions) return;

    fetchSubmissions(false, {
      append: true,
      offset: submissionPagination.offset + submissionPagination.limit,
      scope: submissionScope,
      limit: submissionPagination.limit,
    });
  }, [fetchSubmissions, isLoadingMoreSubmissions, isLoadingSubmissions, submissionPagination, submissionScope]);

  const handleCopyShareLink = async () => {
    if (!task) return;
    const shareLink = buildTaskShareUrl(task.taskToken);
    try {
      await navigator.clipboard.writeText(shareLink);
      toast({
        title: 'Sharing link copied',
        description: shareLink,
      });
    } catch {
      alert(`Copy failed. Sharing link: ${shareLink}`);
    }
  };

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

  const isArchived = task.isActive === false;

  const renderActivePanel = () => {
    switch (activeTab) {
      case 'submission':
        return (
          <SubmissionPanel
            taskId={taskId}
            enrollments={enrollments}
            submissions={submissions}
            submissionPagination={submissionPagination}
            selectedUserId={submissionScope}
            isLoadingEnrollments={isLoadingEnrollments}
            isLoadingSubmissions={isLoadingSubmissions}
            isLoadingMoreSubmissions={isLoadingMoreSubmissions}
            enrollmentsError={enrollmentsError}
            onSelectedUserChange={handleSubmissionScopeChange}
            onLoadMoreSubmissions={handleLoadMoreSubmissions}
            onRefresh={() => {
              fetchEnrollments();
              fetchSubmissions(true, { scope: submissionScope });
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
            isLoadingStats={isLoadingStats}
          />
        );
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="min-w-0">
          <h1 className="line-clamp-2 break-words [overflow-wrap:anywhere] text-3xl font-bold tracking-normal" title={task.name}>
            {task.name}
          </h1>
          {task.description && (
            <p className="mt-2 max-w-full whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-muted-foreground">
              {task.description}
            </p>
          )}
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {isArchived && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled
            >
              <Archive className="mr-2 h-4 w-4" />
              Archived
            </Button>
          )}
          {!isArchived && task.lifecycleStatus === 'draft' && (
            <Button
              type="button"
              size="sm"
              onClick={() => handleTaskLifecycleAction('launch')}
              disabled={isChangingLifecycle}
            >
              {isChangingLifecycle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Launch
            </Button>
          )}
          {!isArchived && task.lifecycleStatus === 'active' && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => handleTaskLifecycleAction('pause')}
              disabled={isChangingLifecycle}
            >
              {isChangingLifecycle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Pause className="mr-2 h-4 w-4" />}
              Pause
            </Button>
          )}
          {!isArchived && task.lifecycleStatus === 'paused' && (
            <Button
              type="button"
              size="sm"
              onClick={() => handleTaskLifecycleAction('resume')}
              disabled={isChangingLifecycle}
            >
              {isChangingLifecycle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Play className="mr-2 h-4 w-4" />}
              Resume
            </Button>
          )}
          {!isArchived && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="border-[#b99791] text-[#8d5e57] hover:bg-[#f3e9e7] hover:text-[#704942]"
              onClick={() => handleTaskLifecycleAction('end')}
              disabled={isChangingLifecycle || task.lifecycleStatus === 'ended'}
            >
              {isChangingLifecycle ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Square className="mr-2 h-4 w-4" />}
              End Study
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            size="icon"
            aria-label="Copy sharing link"
            title="Copy sharing link"
            onClick={handleCopyShareLink}
          >
            <LinkIcon className="h-4 w-4" />
          </Button>
          <Button variant="outline" size="sm" onClick={() => router.push('/tasks')}>
            Back to Tasks
          </Button>
        </div>
      </div>

      <div className="border-b border-border/70">
        <nav className="-mb-px flex gap-6 overflow-x-auto" aria-label="Task sections">
          {visibleTabs.map((tab) => (
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

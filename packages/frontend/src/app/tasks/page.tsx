'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api, { ApiError } from '@/lib/api-client';
import { buildTaskShareUrl } from '@/lib/certificate-url';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  ArrowDownAZ,
  Check,
  Plus,
  Search,
  AlertCircle,
  Folder,
  LayoutGrid,
  List,
} from 'lucide-react';
import type {
  AdminTaskDashboardResponse,
  TaskDashboardSort,
} from '@humanly/shared';
import { useToast } from '@/components/ui/use-toast';
import { TaskCard, TASK_LIST_GRID_CLASS } from './_components/task-card';
import {
  getTaskDashboardTabCountText,
  getTaskActiveStateAction,
  type TaskDashboardItem,
  type TaskDashboardTab,
} from './_components/task-dashboard-lifecycle';

type TaskViewMode = 'cards' | 'list';
type TaskSortOption = 'createdAt' | 'name';

const TASK_VIEW_MODE_STORAGE_KEY = 'humanly:admin-tasks:view-mode';

const TASK_SORT_LABELS: Record<TaskSortOption, string> = {
  createdAt: 'Created date',
  name: 'Task name',
};

const TASK_SORT_API_VALUES: Record<TaskSortOption, TaskDashboardSort> = {
  createdAt: 'createdAt:desc',
  name: 'name:asc',
};

const isTaskViewMode = (value: string | null): value is TaskViewMode =>
  value === 'cards' || value === 'list';

/**
 * Tasks list page component
 * Displays all user tasks with search, filtering, and actions
 */
export default function TasksPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [tasks, setTasks] = useState<TaskDashboardItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [hasLoadedDashboard, setHasLoadedDashboard] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TaskDashboardTab>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [dashboardPagination, setDashboardPagination] = useState({
    page: 1,
    limit: 9,
    total: 0,
    totalPages: 0,
  });
  const [dashboardCounts, setDashboardCounts] = useState({
    open: 0,
    archived: 0,
  });
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [changingActiveStateTaskId, setChangingActiveStateTaskId] = useState<
    string | null
  >(null);
  const [changingLifecycleTaskId, setChangingLifecycleTaskId] = useState<
    string | null
  >(null);
  const [duplicatingTaskId, setDuplicatingTaskId] = useState<string | null>(
    null
  );
  const [openOptionsTaskId, setOpenOptionsTaskId] = useState<string | null>(
    null
  );
  const [dashboardNowMs, setDashboardNowMs] = useState(() => Date.now());
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>('cards');
  const [taskSortBy, setTaskSortBy] = useState<TaskSortOption>('createdAt');
  const [isTaskSortMenuOpen, setIsTaskSortMenuOpen] = useState(false);

  const itemsPerPage = 9; // 3x3 grid

  useEffect(() => {
    const storedViewMode = window.localStorage.getItem(
      TASK_VIEW_MODE_STORAGE_KEY
    );
    if (isTaskViewMode(storedViewMode)) {
      setTaskViewMode(storedViewMode);
    }
  }, []);

  const handleTaskViewModeChange = useCallback((nextViewMode: TaskViewMode) => {
    setTaskViewMode(nextViewMode);
    window.localStorage.setItem(TASK_VIEW_MODE_STORAGE_KEY, nextViewMode);
  }, []);

  const fetchTasks = useCallback(
    async (
      overrides: {
        page?: number;
        status?: TaskDashboardTab;
        search?: string;
        sortBy?: TaskSortOption;
      } = {}
    ) => {
      const pageToFetch = overrides.page ?? currentPage;
      const statusToFetch = overrides.status ?? activeTab;
      const searchToFetch = overrides.search ?? debouncedSearchQuery;
      const sortByToFetch = overrides.sortBy ?? taskSortBy;

      try {
        setIsLoading(true);
        setError(null);

        const response = await api.get<{
          success: boolean;
          data: AdminTaskDashboardResponse;
        }>('/api/v1/tasks/dashboard', {
          params: {
            status: statusToFetch,
            page: pageToFetch,
            limit: itemsPerPage,
            search: searchToFetch || undefined,
            sort: TASK_SORT_API_VALUES[sortByToFetch],
          },
        });
        setTasks(response.data.items);
        setDashboardPagination(response.data.pagination);
        setDashboardCounts(response.data.counts);
        setHasLoadedDashboard(true);
      } catch (err) {
        const errorMessage =
          err instanceof ApiError ? err.message : 'Failed to load tasks';
        setError(errorMessage);
      } finally {
        setIsLoading(false);
      }
    },
    [activeTab, currentPage, debouncedSearchQuery, itemsPerPage, taskSortBy]
  );

  /**
   * Delete a task
   */
  const handleDeleteTask = async (task: TaskDashboardItem) => {
    if (
      !confirm(
        `Are you sure you want to delete "${task.name}"? This action cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setDeletingTaskId(task.id);
      await api.delete(`/api/v1/tasks/${task.id}`);

      const remainingTasks = Math.max(0, dashboardPagination.total - 1);
      const nextPage = Math.max(1, Math.ceil(remainingTasks / itemsPerPage));
      if (currentPage > nextPage) {
        setCurrentPage(nextPage);
      } else {
        await fetchTasks();
      }
    } catch (err) {
      const errorMessage =
        err instanceof ApiError ? err.message : 'Failed to delete task';
      alert(errorMessage);
    } finally {
      setDeletingTaskId(null);
    }
  };

  const handleTaskActiveStateChange = async (
    task: TaskDashboardItem,
    nextIsActive: boolean
  ) => {
    const action = getTaskActiveStateAction(nextIsActive);
    if (!confirm(action.confirmMessage)) {
      return;
    }

    try {
      setChangingActiveStateTaskId(task.id);
      const response = await api.put<{
        success: boolean;
        data: TaskDashboardItem;
        message: string;
      }>(`/api/v1/tasks/${task.id}`, {
        isActive: nextIsActive,
      });

      setTasks((prev) =>
        prev.map((currentTask) =>
          currentTask.id === task.id
            ? { ...currentTask, ...response.data }
            : currentTask
        )
      );
      setOpenOptionsTaskId(null);

      const remainingTasks = Math.max(0, dashboardPagination.total - 1);
      const nextPage = Math.max(1, Math.ceil(remainingTasks / itemsPerPage));
      if (currentPage > nextPage) {
        setCurrentPage(nextPage);
      } else {
        await fetchTasks();
      }
    } catch (err) {
      const errorMessage =
        err instanceof ApiError
          ? err.message
          : `Failed to ${nextIsActive ? 'restore' : 'archive'} task`;
      alert(errorMessage);
    } finally {
      setChangingActiveStateTaskId(null);
    }
  };

  const handleTaskLifecycleAction = async (
    task: TaskDashboardItem,
    action: 'launch' | 'pause' | 'resume'
  ) => {
    try {
      setChangingLifecycleTaskId(task.id);
      const response = await api.post<{
        success: boolean;
        data: TaskDashboardItem;
        message: string;
      }>(`/api/v1/tasks/${task.id}/${action}`);

      setTasks((prev) =>
        prev.map((currentTask) =>
          currentTask.id === task.id
            ? { ...currentTask, ...response.data }
            : currentTask
        )
      );
      setOpenOptionsTaskId(null);
    } catch (err) {
      const errorMessage =
        err instanceof ApiError ? err.message : `Failed to ${action} task`;
      alert(errorMessage);
    } finally {
      setChangingLifecycleTaskId(null);
    }
  };

  const copyText = async (value: string, label: string) => {
    try {
      await navigator.clipboard.writeText(value);
      toast({
        title: `${label} copied`,
        description: value,
      });
    } catch {
      alert(`Copy failed. ${label}: ${value}`);
    }
  };

  const handleCopyShareLink = (task: TaskDashboardItem) => {
    copyText(buildTaskShareUrl(task.taskToken), 'Sharing link');
    setOpenOptionsTaskId(null);
  };

  const handleCopyInviteCode = (task: TaskDashboardItem) => {
    copyText(task.taskToken.slice(0, 6).toUpperCase(), 'Invite code');
    setOpenOptionsTaskId(null);
  };

  const handleDuplicateTask = async (task: TaskDashboardItem) => {
    try {
      setDuplicatingTaskId(task.id);
      const response = await api.post<{
        success: boolean;
        data: TaskDashboardItem;
        message: string;
      }>(`/api/v1/tasks/${task.id}/duplicate`);

      setActiveTab('open');
      setCurrentPage(1);
      await fetchTasks({ status: 'open', page: 1 });
      setOpenOptionsTaskId(null);
      toast({
        title: 'Task duplicated',
        description: `${response.data.name} was created as a draft.`,
      });
    } catch (err) {
      const errorMessage =
        err instanceof ApiError ? err.message : 'Failed to duplicate task';
      alert(errorMessage);
    } finally {
      setDuplicatingTaskId(null);
    }
  };

  const paginatedTasks = tasks;
  const openTaskCount = dashboardCounts.open;
  const archivedTaskCount = dashboardCounts.archived;
  const totalPages = dashboardPagination.totalPages;
  const hasAnyTasks = dashboardCounts.open + dashboardCounts.archived > 0;

  /**
   * Load tasks on mount
   */
  useEffect(() => {
    fetchTasks();
  }, [fetchTasks]);

  useEffect(() => {
    const timeoutId = window.setTimeout(() => {
      setCurrentPage(1);
      setDebouncedSearchQuery(searchQuery.trim());
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [searchQuery]);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setDashboardNowMs(Date.now());
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, []);

  const hasSearchQuery = debouncedSearchQuery.length > 0;
  const tabCountText = getTaskDashboardTabCountText(
    dashboardPagination.total,
    activeTab,
    hasSearchQuery
  );

  const renderDashboardHeader = (description: string) => (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <h1 className="text-2xl font-medium sm:text-3xl">
          Publisher Dashboard
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          {description}
        </p>
      </div>
      <Button asChild className="w-full sm:w-auto">
        <Link href="/tasks/new">
          <Plus className="mr-2 h-4 w-4" />
          Create Task
        </Link>
      </Button>
    </div>
  );

  const renderTaskTabs = () => (
    <Tabs
      value={activeTab}
      onValueChange={(value) => {
        setCurrentPage(1);
        setActiveTab(value as TaskDashboardTab);
      }}
    >
      <TabsList className="grid w-full grid-cols-2 border border-border/70 bg-muted/60 sm:w-[310px]">
        <TabsTrigger value="open">Open ({openTaskCount})</TabsTrigger>
        <TabsTrigger value="archived">
          Archived ({archivedTaskCount})
        </TabsTrigger>
      </TabsList>
    </Tabs>
  );

  const renderTaskViewAndSortControls = () => (
    <TooltipProvider delayDuration={0}>
      <div className="flex items-center justify-end gap-2">
        <Tooltip>
          <TooltipTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-muted-foreground hover:text-foreground"
              aria-label={taskViewMode === 'cards' ? 'List view' : 'Card view'}
              onClick={() =>
                handleTaskViewModeChange(
                  taskViewMode === 'cards' ? 'list' : 'cards'
                )
              }
            >
              {taskViewMode === 'cards' ? (
                <List className="h-6 w-6" />
              ) : (
                <LayoutGrid className="h-6 w-6" />
              )}
            </Button>
          </TooltipTrigger>
          <TooltipContent>
            {taskViewMode === 'cards' ? 'List view' : 'Card view'}
          </TooltipContent>
        </Tooltip>

        <DropdownMenu
          open={isTaskSortMenuOpen}
          onOpenChange={setIsTaskSortMenuOpen}
        >
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-10 w-10 text-muted-foreground hover:text-foreground"
              aria-label={`Sort by ${TASK_SORT_LABELS[taskSortBy]}`}
              title="Sort tasks"
              onPointerDown={(event) => event.preventDefault()}
              onClick={(event) => {
                if (event.detail === 0) return;
                setIsTaskSortMenuOpen((open) => !open);
              }}
            >
              <ArrowDownAZ className="h-6 w-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(TASK_SORT_LABELS) as TaskSortOption[]).map(
              (option) => (
                <DropdownMenuItem
                  key={option}
                  onClick={() => {
                    setCurrentPage(1);
                    setTaskSortBy(option);
                    setIsTaskSortMenuOpen(false);
                  }}
                >
                  <Check
                    className={
                      taskSortBy === option
                        ? 'mr-2 h-4 w-4 opacity-100'
                        : 'mr-2 h-4 w-4 opacity-0'
                    }
                  />
                  {TASK_SORT_LABELS[option]}
                </DropdownMenuItem>
              )
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </TooltipProvider>
  );

  const renderDashboardControls = () => (
    <div className="mb-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
      <div className="relative w-full sm:max-w-sm">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Search tasks..."
          className="pl-10"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
        />
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between xl:justify-end">
        {renderTaskTabs()}
        {renderTaskViewAndSortControls()}
      </div>
    </div>
  );

  /**
   * Loading state
   */
  if (isLoading && !hasLoadedDashboard) {
    return (
      <div className="space-y-7">
        <div className="mb-8 space-y-3">
          <div className="h-3 w-32 rounded bg-muted" />
          <div className="h-8 w-64 rounded bg-muted" />
          <div className="h-4 w-96 max-w-full rounded bg-muted" />
        </div>

        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse shadow-none">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-3/4 mb-2" />
                <div className="h-4 bg-muted rounded w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded" />
                  <div className="h-4 bg-muted rounded w-5/6" />
                </div>
              </CardContent>
              <CardFooter>
                <div className="h-10 bg-muted rounded w-full" />
              </CardFooter>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  /**
   * Error state
   */
  if (error) {
    return (
      <div className="space-y-7">
        {renderDashboardHeader(
          'Manage invite-code writing tasks, enrollments, submissions, and analytics.'
        )}

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={() => fetchTasks()}
            >
              Try Again
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  /**
   * Empty state - no tasks
   */
  if (!hasAnyTasks && !hasSearchQuery) {
    return (
      <div className="space-y-7">
        {renderDashboardHeader(
          'Create a writing task, configure its environment, and share its invite code with users.'
        )}

        <Card className="humanly-surface border-dashed bg-card/80">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center">
              <Folder className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="font-medium">
              No publisher tasks yet
            </CardTitle>
            <CardDescription>
              Create your first writing task, configure AI access, and invite
              users with a code.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pb-6">
            <Button asChild size="lg">
              <Link href="/tasks/new">
                <Plus className="mr-2 h-4 w-4" />
                Create Task
              </Link>
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /**
   * Empty state - no search results
   */
  if (tasks.length === 0) {
    const activeTabLabel = activeTab === 'open' ? 'open' : 'archived';

    return (
      <div className="space-y-7">
        {renderDashboardHeader(tabCountText)}
        {renderDashboardControls()}

        <Card className="humanly-surface border-dashed bg-card/80">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle className="font-medium">
              {hasSearchQuery ? 'No tasks found' : `No ${activeTabLabel} tasks`}
            </CardTitle>
            <CardDescription>
              {hasSearchQuery
                ? `No ${activeTabLabel} tasks match your search query ${searchQuery}`
                : activeTab === 'open'
                  ? 'Open tasks will appear here until you archive them.'
                  : 'Archived tasks will appear here when you close tasks from the dashboard.'}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pb-6">
            {hasSearchQuery ? (
              <Button variant="outline" onClick={() => setSearchQuery('')}>
                Clear Search
              </Button>
            ) : activeTab === 'open' ? (
              <Button asChild>
                <Link href="/tasks/new">
                  <Plus className="mr-2 h-4 w-4" />
                  Create Task
                </Link>
              </Button>
            ) : null}
          </CardContent>
        </Card>
      </div>
    );
  }

  /**
   * Main content - task grid
   */
  return (
    <div className="space-y-7">
      {renderDashboardHeader(tabCountText)}
      {renderDashboardControls()}

      {taskViewMode === 'cards' ? (
        <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {paginatedTasks.map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              activeTab={activeTab}
              nowMs={dashboardNowMs}
              isDeleting={deletingTaskId === task.id}
              isChangingActiveState={changingActiveStateTaskId === task.id}
              isChangingLifecycleState={changingLifecycleTaskId === task.id}
              isDuplicating={duplicatingTaskId === task.id}
              isOptionsOpen={openOptionsTaskId === task.id}
              onOptionsOpenChange={(open) =>
                setOpenOptionsTaskId(open ? task.id : null)
              }
              onView={(selectedTask) =>
                router.push(`/tasks/${selectedTask.id}`)
              }
              onEditSetting={(selectedTask) =>
                router.push(`/tasks/${selectedTask.id}?tab=setting`)
              }
              onDelete={handleDeleteTask}
              onActiveStateChange={handleTaskActiveStateChange}
              onLifecycleAction={handleTaskLifecycleAction}
              onCopyShareLink={handleCopyShareLink}
              onCopyInviteCode={handleCopyInviteCode}
              onDuplicate={handleDuplicateTask}
              variant="card"
            />
          ))}
        </div>
      ) : (
        <div>
          <div
            className={`hidden gap-3 border-b border-border/70 px-2 pb-2 text-xs font-medium uppercase tracking-normal text-muted-foreground md:grid ${TASK_LIST_GRID_CLASS}`}
          >
            <span>Task name</span>
            <span>Status</span>
            <span>Completions</span>
            <span>Created</span>
            <span className="sr-only">Actions</span>
          </div>
          <div>
            {paginatedTasks.map((task) => (
              <TaskCard
                key={task.id}
                task={task}
                activeTab={activeTab}
                nowMs={dashboardNowMs}
                isDeleting={deletingTaskId === task.id}
                isChangingActiveState={changingActiveStateTaskId === task.id}
                isChangingLifecycleState={changingLifecycleTaskId === task.id}
                isDuplicating={duplicatingTaskId === task.id}
                isOptionsOpen={openOptionsTaskId === task.id}
                onOptionsOpenChange={(open) =>
                  setOpenOptionsTaskId(open ? task.id : null)
                }
                onView={(selectedTask) =>
                  router.push(`/tasks/${selectedTask.id}`)
                }
                onEditSetting={(selectedTask) =>
                  router.push(`/tasks/${selectedTask.id}?tab=setting`)
                }
                onDelete={handleDeleteTask}
                onActiveStateChange={handleTaskActiveStateChange}
                onLifecycleAction={handleTaskLifecycleAction}
                onCopyShareLink={handleCopyShareLink}
                onCopyInviteCode={handleCopyInviteCode}
                onDuplicate={handleDuplicateTask}
                variant="list"
              />
            ))}
          </div>
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === 1}
            onClick={() => setCurrentPage((prev) => prev - 1)}
          >
            Previous
          </Button>

          <div className="flex items-center gap-1">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((page) => {
              // Show first page, last page, current page, and pages around current
              const showPage =
                page === 1 ||
                page === totalPages ||
                (page >= currentPage - 1 && page <= currentPage + 1);

              // Show ellipsis
              const showEllipsisBefore =
                page === currentPage - 2 && currentPage > 3;
              const showEllipsisAfter =
                page === currentPage + 2 && currentPage < totalPages - 2;

              if (!showPage && !showEllipsisBefore && !showEllipsisAfter) {
                return null;
              }

              if (showEllipsisBefore || showEllipsisAfter) {
                return (
                  <span key={page} className="px-2 text-muted-foreground">
                    ...
                  </span>
                );
              }

              return (
                <Button
                  key={page}
                  variant={currentPage === page ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setCurrentPage(page)}
                >
                  {page}
                </Button>
              );
            })}
          </div>

          <Button
            variant="outline"
            size="sm"
            disabled={currentPage === totalPages}
            onClick={() => setCurrentPage((prev) => prev + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

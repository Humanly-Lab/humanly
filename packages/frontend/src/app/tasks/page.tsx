'use client';

import { useCallback, useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import api, { ApiError } from '@/lib/api-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
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
import { TaskCard } from './_components/task-card';
import {
  filterTasksForDashboard,
  getTaskActiveStateAction,
  getTaskDashboardTabCountText,
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

const isTaskViewMode = (value: string | null): value is TaskViewMode => (
  value === 'cards' || value === 'list'
);

const getTaskCreatedAtMs = (task: TaskDashboardItem) => {
  const timestamp = new Date(task.createdAt).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

/**
 * Tasks list page component
 * Displays all user tasks with search, filtering, and actions
 */
export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskDashboardItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<TaskDashboardTab>('open');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);
  const [changingActiveStateTaskId, setChangingActiveStateTaskId] = useState<string | null>(null);
  const [openOptionsTaskId, setOpenOptionsTaskId] = useState<string | null>(null);
  const [dashboardNowMs, setDashboardNowMs] = useState(() => Date.now());
  const [taskViewMode, setTaskViewMode] = useState<TaskViewMode>('cards');
  const [taskSortBy, setTaskSortBy] = useState<TaskSortOption>('createdAt');
  const [isTaskSortMenuOpen, setIsTaskSortMenuOpen] = useState(false);

  const itemsPerPage = 9; // 3x3 grid

  useEffect(() => {
    const storedViewMode = window.localStorage.getItem(TASK_VIEW_MODE_STORAGE_KEY);
    if (isTaskViewMode(storedViewMode)) {
      setTaskViewMode(storedViewMode);
    }
  }, []);

  const handleTaskViewModeChange = useCallback((nextViewMode: TaskViewMode) => {
    setTaskViewMode(nextViewMode);
    window.localStorage.setItem(TASK_VIEW_MODE_STORAGE_KEY, nextViewMode);
  }, []);

  /**
   * Fetch all tasks for the current user
   */
  const fetchTasks = async () => {
    try {
      setIsLoading(true);
      setError(null);

      // Fetch tasks from API
      const response = await api.get<{
        success: boolean;
        data: TaskDashboardItem[];
      }>('/api/v1/tasks');
      setTasks(response.data);
    } catch (err) {
      const errorMessage = err instanceof ApiError
        ? err.message
        : 'Failed to load tasks';
      setError(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  /**
   * Delete a task
   */
  const handleDeleteTask = async (task: TaskDashboardItem) => {
    if (!confirm(`Are you sure you want to delete "${task.name}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingTaskId(task.id);
      await api.delete(`/api/v1/tasks/${task.id}`);

      // Remove task from state
      setTasks(prev => prev.filter(p => p.id !== task.id));

      // Reset to page 1 if current page is now empty
      const remainingTasks = filteredTasks.length - 1;
      const maxPage = Math.ceil(remainingTasks / itemsPerPage);
      if (currentPage > maxPage && maxPage > 0) {
        setCurrentPage(maxPage);
      }
    } catch (err) {
      const errorMessage = err instanceof ApiError
        ? err.message
        : 'Failed to delete task';
      alert(errorMessage);
    } finally {
      setDeletingTaskId(null);
    }
  };

  const handleTaskActiveStateChange = async (task: TaskDashboardItem, nextIsActive: boolean) => {
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

      setTasks(prev => prev.map(currentTask => (
        currentTask.id === task.id ? { ...currentTask, ...response.data } : currentTask
      )));
      setOpenOptionsTaskId(null);

      const remainingTasks = filteredTasks.length - 1;
      const maxPage = Math.ceil(remainingTasks / itemsPerPage);
      if (currentPage > maxPage && maxPage > 0) {
        setCurrentPage(maxPage);
      }
    } catch (err) {
      const errorMessage = err instanceof ApiError
        ? err.message
        : `Failed to ${nextIsActive ? 'restore' : 'archive'} task`;
      alert(errorMessage);
    } finally {
      setChangingActiveStateTaskId(null);
    }
  };

  /**
   * Filter tasks based on lifecycle tab and search query
   */
  const filteredTasks = useMemo(() => {
    return filterTasksForDashboard(tasks, activeTab, searchQuery);
  }, [tasks, activeTab, searchQuery]);

  const sortedTasks = useMemo(() => {
    const tasksToSort = [...filteredTasks];

    if (taskSortBy === 'name') {
      return tasksToSort.sort((a, b) => a.name.localeCompare(b.name));
    }

    return tasksToSort.sort((a, b) => getTaskCreatedAtMs(b) - getTaskCreatedAtMs(a));
  }, [filteredTasks, taskSortBy]);

  const openTaskCount = useMemo(() => (
    tasks.filter(task => task.isActive).length
  ), [tasks]);

  const archivedTaskCount = useMemo(() => (
    tasks.filter(task => !task.isActive).length
  ), [tasks]);

  /**
   * Paginate filtered tasks
   */
  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return sortedTasks.slice(startIndex, endIndex);
  }, [sortedTasks, currentPage, itemsPerPage]);

  /**
   * Calculate total pages
   */
  const totalPages = Math.ceil(filteredTasks.length / itemsPerPage);

  /**
   * Load tasks on mount
   */
  useEffect(() => {
    fetchTasks();
  }, []);

  useEffect(() => {
    const intervalId = window.setInterval(() => {
      setDashboardNowMs(Date.now());
    }, 15_000);

    return () => window.clearInterval(intervalId);
  }, []);

  /**
   * Reset to page 1 when filters change
   */
  useEffect(() => {
    setCurrentPage(1);
  }, [activeTab, searchQuery, taskSortBy]);

  const hasSearchQuery = searchQuery.trim().length > 0;
  const tabCountText = getTaskDashboardTabCountText(filteredTasks.length, activeTab, hasSearchQuery);

  const renderDashboardHeader = (description: string) => (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
      <div className="space-y-2">
        <p className="humanly-eyebrow">Admin workspace</p>
        <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">Admin Tasks</h1>
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
    <Tabs value={activeTab} onValueChange={(value) => setActiveTab(value as TaskDashboardTab)}>
      <TabsList className="grid w-full grid-cols-2 border border-border/70 bg-muted/60 sm:w-[310px]">
        <TabsTrigger value="open" onClick={() => setActiveTab('open')}>
          Open ({openTaskCount})
        </TabsTrigger>
        <TabsTrigger value="archived" onClick={() => setActiveTab('archived')}>
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
              onClick={() => handleTaskViewModeChange(taskViewMode === 'cards' ? 'list' : 'cards')}
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

        <DropdownMenu open={isTaskSortMenuOpen} onOpenChange={setIsTaskSortMenuOpen}>
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
                setIsTaskSortMenuOpen(open => !open);
              }}
            >
              <ArrowDownAZ className="h-6 w-6" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {(Object.keys(TASK_SORT_LABELS) as TaskSortOption[]).map((option) => (
              <DropdownMenuItem
                key={option}
                onClick={() => {
                  setTaskSortBy(option);
                  setIsTaskSortMenuOpen(false);
                }}
              >
                <Check className={taskSortBy === option ? 'mr-2 h-4 w-4 opacity-100' : 'mr-2 h-4 w-4 opacity-0'} />
                {TASK_SORT_LABELS[option]}
              </DropdownMenuItem>
            ))}
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
  if (isLoading) {
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
        {renderDashboardHeader('Manage invite-code writing tasks, enrollments, submissions, and analytics.')}

        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error}
            <Button
              variant="outline"
              size="sm"
              className="mt-2"
              onClick={fetchTasks}
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
  if (tasks.length === 0) {
    return (
      <div className="space-y-7">
        {renderDashboardHeader('Create a writing task, configure its environment, and share its invite code with users.')}

        <Card className="humanly-surface border-dashed bg-card/80">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted/60 flex items-center justify-center">
              <Folder className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>No admin tasks yet</CardTitle>
            <CardDescription>
              Create your first writing task, configure AI access, and invite users with a code.
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
  if (filteredTasks.length === 0) {
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
            <CardTitle>{hasSearchQuery ? 'No tasks found' : `No ${activeTabLabel} tasks`}</CardTitle>
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
              <Button
                variant="outline"
                onClick={() => setSearchQuery('')}
              >
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
              isOptionsOpen={openOptionsTaskId === task.id}
              onOptionsOpenChange={(open) => setOpenOptionsTaskId(open ? task.id : null)}
              onView={(selectedTask) => router.push(`/tasks/${selectedTask.id}`)}
              onEditSetting={(selectedTask) => router.push(`/tasks/${selectedTask.id}?tab=setting`)}
              onDelete={handleDeleteTask}
              onActiveStateChange={handleTaskActiveStateChange}
              variant="card"
            />
          ))}
        </div>
      ) : (
        <div>
          <div className="hidden grid-cols-[minmax(0,1.4fr)_8.5rem_10rem_11rem_8rem] border-b border-border/70 px-2 pb-2 text-xs font-medium uppercase tracking-normal text-muted-foreground md:grid">
            <span>Task name</span>
            <span>Status</span>
            <span>Completions</span>
            <span>Created</span>
            <span />
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
                isOptionsOpen={openOptionsTaskId === task.id}
                onOptionsOpenChange={(open) => setOpenOptionsTaskId(open ? task.id : null)}
                onView={(selectedTask) => router.push(`/tasks/${selectedTask.id}`)}
                onEditSetting={(selectedTask) => router.push(`/tasks/${selectedTask.id}?tab=setting`)}
                onDelete={handleDeleteTask}
                onActiveStateChange={handleTaskActiveStateChange}
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
            onClick={() => setCurrentPage(prev => prev - 1)}
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
              const showEllipsisBefore = page === currentPage - 2 && currentPage > 3;
              const showEllipsisAfter = page === currentPage + 2 && currentPage < totalPages - 2;

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
            onClick={() => setCurrentPage(prev => prev + 1)}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}

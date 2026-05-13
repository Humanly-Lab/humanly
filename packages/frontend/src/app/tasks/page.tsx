'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Task } from '@humanly/shared';
import api, { ApiError } from '@/lib/api-client';
import { formatDate, formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Plus,
  Search,
  Eye,
  Settings,
  Trash2,
  Calendar,
  Activity,
  Users,
  AlertCircle,
  Folder,
  Copy,
  BrainCircuit,
  FileText
} from 'lucide-react';

/**
 * Extended task interface with stats
 */
interface TaskWithStats extends Task {
  eventCount?: number;
  sessionCount?: number;
  enrolledUserCount?: number;
  documentCount?: number;
  aiUsageLimit?: number;
  allowedAiModels?: string[];
  allowedLlmModels?: string[];
  inviteCode?: string;
}

/**
 * Tasks list page component
 * Displays all user tasks with search, filtering, and actions
 */
export default function TasksPage() {
  const router = useRouter();
  const [tasks, setTasks] = useState<TaskWithStats[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(1);
  const [deletingTaskId, setDeletingTaskId] = useState<string | null>(null);

  const itemsPerPage = 9; // 3x3 grid

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
        data: TaskWithStats[];
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
  const handleDeleteTask = async (taskId: string, taskName: string) => {
    if (!confirm(`Are you sure you want to delete "${taskName}"? This action cannot be undone.`)) {
      return;
    }

    try {
      setDeletingTaskId(taskId);
      await api.delete(`/api/v1/tasks/${taskId}`);

      // Remove task from state
      setTasks(prev => prev.filter(p => p.id !== taskId));

      // Reset to page 1 if current page is now empty
      const remainingTasks = tasks.length - 1;
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

  /**
   * Filter tasks based on search query
   */
  const filteredTasks = useMemo(() => {
    if (!searchQuery.trim()) {
      return tasks;
    }

    const query = searchQuery.toLowerCase();
    return tasks.filter(task =>
      task.name.toLowerCase().includes(query) ||
      task.description?.toLowerCase().includes(query)
    );
  }, [tasks, searchQuery]);

  /**
   * Paginate filtered tasks
   */
  const paginatedTasks = useMemo(() => {
    const startIndex = (currentPage - 1) * itemsPerPage;
    const endIndex = startIndex + itemsPerPage;
    return filteredTasks.slice(startIndex, endIndex);
  }, [filteredTasks, currentPage, itemsPerPage]);

  /**
   * Calculate total pages
   */
  const totalPages = Math.ceil(filteredTasks.length / itemsPerPage);

  const getInviteCode = (task: TaskWithStats) => (
    task.inviteCode || task.taskToken?.slice(0, 6).toUpperCase() || 'PENDING'
  );

  const getAllowedModels = (task: TaskWithStats) => (
    task.allowedLlmModels?.length
      ? task.allowedLlmModels
      : task.allowedAiModels?.length
        ? task.allowedAiModels
        : ['GPT-4o mini']
  );

  const copyInviteCode = async (task: TaskWithStats) => {
    const inviteCode = getInviteCode(task);
    await navigator.clipboard.writeText(inviteCode);
  };

  /**
   * Load tasks on mount
   */
  useEffect(() => {
    fetchTasks();
  }, []);

  /**
   * Reset to page 1 when search query changes
   */
  useEffect(() => {
    setCurrentPage(1);
  }, [searchQuery]);

  /**
   * Loading state
   */
  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Tasks</h1>
            <p className="text-muted-foreground">Loading task dashboard...</p>
          </div>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <Card key={i} className="animate-pulse">
              <CardHeader>
                <div className="h-6 bg-muted rounded w-3/4 mb-2"></div>
                <div className="h-4 bg-muted rounded w-1/2"></div>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="h-4 bg-muted rounded"></div>
                  <div className="h-4 bg-muted rounded w-5/6"></div>
                </div>
              </CardContent>
              <CardFooter>
                <div className="h-10 bg-muted rounded w-full"></div>
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Tasks</h1>
            <p className="text-muted-foreground">Manage invite-code writing tasks</p>
          </div>
          <Button asChild>
            <Link href="/tasks/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Task
            </Link>
          </Button>
        </div>

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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Tasks</h1>
            <p className="text-muted-foreground">Create a writing task and share its invite code with users</p>
          </div>
        </div>

        <Card className="border-dashed">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
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
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">Admin Tasks</h1>
            <p className="text-muted-foreground">
              {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'} total
            </p>
          </div>
          <Button asChild>
            <Link href="/tasks/new">
              <Plus className="mr-2 h-4 w-4" />
              Create Task
            </Link>
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              type="search"
              placeholder="Search tasks..."
              className="pl-10"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <Card className="border-dashed">
          <CardHeader className="text-center pb-4">
            <div className="mx-auto mb-4 h-12 w-12 rounded-full bg-muted flex items-center justify-center">
              <Search className="h-6 w-6 text-muted-foreground" />
            </div>
            <CardTitle>No tasks found</CardTitle>
            <CardDescription>
              No tasks match your search query {searchQuery}
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center pb-6">
            <Button
              variant="outline"
              onClick={() => setSearchQuery('')}
            >
              Clear Search
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  /**
   * Main content - task grid
   */
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Admin Tasks</h1>
          <p className="text-muted-foreground">
            {filteredTasks.length} {filteredTasks.length === 1 ? 'task' : 'tasks'}
            {searchQuery && ' found'}
          </p>
        </div>
        <Button asChild>
          <Link href="/tasks/new">
            <Plus className="mr-2 h-4 w-4" />
            Create Task
          </Link>
        </Button>
      </div>

      {/* Search */}
      <div className="flex items-center gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Search tasks or invite codes..."
            className="pl-10"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      </div>

      {/* Task Grid */}
      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {paginatedTasks.map((task) => (
          <Card key={task.id} className="flex flex-col hover:shadow-lg transition-shadow">
            <CardHeader>
              <CardTitle className="flex items-start justify-between">
                <span className="truncate" title={task.name}>
                  {task.name}
                </span>
                <span className={`ml-2 px-2 py-1 text-xs rounded-full flex-shrink-0 ${
                  task.isActive
                    ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                    : 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300'
                }`}>
                  {task.isActive ? 'Active' : 'Inactive'}
                </span>
              </CardTitle>
              {task.description && (
                <CardDescription className="line-clamp-2" title={task.description}>
                  {task.description}
                </CardDescription>
              )}
            </CardHeader>

            <CardContent className="flex-1 space-y-3">
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Calendar className="h-4 w-4" />
                <span>Created {formatDate(task.createdAt)}</span>
              </div>

              <div className="grid grid-cols-2 gap-3 text-sm text-muted-foreground">
                <div>
                  <div className="font-medium text-foreground">Begin</div>
                  <div>{formatDateTime(task.startDate)}</div>
                </div>
                <div>
                  <div className="font-medium text-foreground">Deadline</div>
                  <div>{formatDateTime(task.endDate)}</div>
                </div>
              </div>

              <button
                type="button"
                className="flex w-full items-center justify-between rounded-md border bg-muted/30 px-3 py-2 text-left text-sm transition-colors hover:bg-muted"
                onClick={() => copyInviteCode(task)}
                title="Copy invite code"
              >
                <span className="font-mono font-semibold tracking-wider">{getInviteCode(task)}</span>
                <Copy className="h-4 w-4 text-muted-foreground" />
              </button>

              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-4 w-4" />
                  <span>{task.enrolledUserCount ?? task.sessionCount ?? 0} users</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <FileText className="h-4 w-4" />
                  <span>{task.documentCount ?? 0} docs</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <Activity className="h-4 w-4" />
                  <span>{task.eventCount ?? 0} logs</span>
                </div>
                <div className="flex items-center gap-1.5 text-muted-foreground">
                  <BrainCircuit className="h-4 w-4" />
                  <span>{task.aiUsageLimit ?? 100} AI limit</span>
                </div>
              </div>

              <div className="flex flex-wrap gap-1.5">
                {getAllowedModels(task).map((model) => (
                  <span key={model} className="rounded-md bg-secondary px-2 py-1 text-xs text-secondary-foreground">
                    {model}
                  </span>
                ))}
              </div>

              {task.externalServiceType && (
                <div className="text-xs text-muted-foreground">
                  Source: {task.externalServiceType}
                </div>
              )}
            </CardContent>

            <CardFooter className="flex gap-2 pt-4 border-t">
              <Button
                variant="default"
                size="sm"
                className="flex-1"
                onClick={() => router.push(`/tasks/${task.id}`)}
              >
                <Eye className="mr-2 h-4 w-4" />
                View
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push(`/tasks/${task.id}/settings`)}
              >
                <Settings className="h-4 w-4" />
              </Button>
              <Button
                variant="destructive"
                size="sm"
                disabled={deletingTaskId === task.id}
                onClick={() => handleDeleteTask(task.id, task.name)}
              >
                {deletingTaskId === task.id ? (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-background border-t-transparent" />
                ) : (
                  <Trash2 className="h-4 w-4" />
                )}
              </Button>
            </CardFooter>
          </Card>
        ))}
      </div>

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

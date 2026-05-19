'use client';

import { useEffect, useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Task } from '@humanly/shared';
import api, { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Plus,
  Search,
  Eye,
  Settings,
  Trash2,
  Calendar,
  Users,
  AlertCircle,
  Folder,
  Loader2,
  MoreHorizontal,
} from 'lucide-react';

/**
 * Extended task interface with stats
 */
interface TaskWithStats extends Task {
  eventCount?: number;
  sessionCount?: number;
  enrolledUserCount?: number;
  documentCount?: number;
  submissionCount?: number;
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
  const [openOptionsTaskId, setOpenOptionsTaskId] = useState<string | null>(null);

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

  const getCompletionCount = (task: TaskWithStats) => task.submissionCount ?? 0;

  const formatCompletionCount = (task: TaskWithStats) => {
    const count = getCompletionCount(task);
    return `${count.toLocaleString()} ${count === 1 ? 'completion' : 'completions'}`;
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
            placeholder="Search tasks..."
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
              <CardTitle className="truncate" title={task.name}>
                {task.name}
              </CardTitle>
              <CardDescription className="line-clamp-3 min-h-[3.75rem]" title={task.description || undefined}>
                {task.description || 'No description provided.'}
              </CardDescription>
            </CardHeader>

            <CardContent className="flex-1">
              <div className="space-y-2 text-sm text-muted-foreground">
                <div className="flex items-center gap-3">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <span>{formatCompletionCount(task)}</span>
                </div>
                <div className="flex items-center gap-3">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <span>Created {formatDateTime(task.createdAt)}</span>
                </div>
              </div>
            </CardContent>

            <CardFooter className="flex pt-4 border-t space-x-2">
              <Button
                variant="default"
                size="sm"
                className="w-full"
                onClick={() => router.push(`/tasks/${task.id}`)}
              >
                <Eye className="mr-2 h-4 w-4" />
                View
              </Button>
              <DropdownMenu
                open={openOptionsTaskId === task.id}
                onOpenChange={(open) => setOpenOptionsTaskId(open ? task.id : null)}
              >
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    className="min-w-[120px]"
                    onPointerDown={(event) => event.preventDefault()}
                    onClick={(event) => {
                      if (event.detail === 0) return;
                      setOpenOptionsTaskId((currentTaskId) => (
                        currentTaskId === task.id ? null : task.id
                      ));
                    }}
                  >
                    <MoreHorizontal className="mr-2 h-4 w-4" />
                    Options
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  className="w-44"
                >
                  <DropdownMenuItem onClick={() => router.push(`/tasks/${task.id}`)}>
                    <Eye className="mr-2 h-4 w-4" />
                    View Details
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => router.push(`/tasks/${task.id}?tab=setting`)}>
                    <Settings className="mr-2 h-4 w-4" />
                    Edit Setting
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className="text-destructive focus:text-destructive"
                    disabled={deletingTaskId === task.id}
                    onClick={() => handleDeleteTask(task.id, task.name)}
                  >
                    {deletingTaskId === task.id ? (
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    ) : (
                      <Trash2 className="mr-2 h-4 w-4" />
                    )}
                    Delete
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
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

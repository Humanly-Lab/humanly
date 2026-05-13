'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  BookOpen,
  CalendarClock,
  FileText,
  KeyRound,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { DocumentCard } from '@/components/documents/document-card';
import { useDocuments } from '@/hooks/use-documents';
import { useToast } from '@/components/ui/use-toast';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import type { WritingEnvironmentConfig } from '@humanly/shared';

type SortOption = 'lastEdited' | 'title' | 'wordCount';

interface TaskEnrollment {
  id: string;
  name: string;
  inviteCode: string;
  documentId: string;
  joinedAt: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  environmentConfig?: WritingEnvironmentConfig | null;
}

const TASK_ENROLLMENTS_KEY = 'humanly.taskEnrollments';
const readTaskEnrollments = (): TaskEnrollment[] => {
  if (typeof window === 'undefined') return [];
  try {
    return JSON.parse(localStorage.getItem(TASK_ENROLLMENTS_KEY) || '[]');
  } catch {
    return [];
  }
};

const writeTaskEnrollments = (enrollments: TaskEnrollment[]) => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(TASK_ENROLLMENTS_KEY, JSON.stringify(enrollments));
};

const getDisplayTaskName = (task: TaskEnrollment) => {
  const name = task.name?.trim();
  if (!name || name === 'Task Name') return `Task ${task.inviteCode}`;
  return name;
};

export default function DocumentsPage() {
  const router = useRouter();
  const { documents, isLoading, error, createDocument, deleteDocument } = useDocuments();
  const { toast } = useToast();
  const [sortBy, setSortBy] = useState<SortOption>('lastEdited');
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<TaskEnrollment | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [isJoiningTask, setIsJoiningTask] = useState(false);
  const [taskEnrollments, setTaskEnrollments] = useState<TaskEnrollment[]>([]);

  useEffect(() => {
    setTaskEnrollments(readTaskEnrollments());
  }, []);

  useEffect(() => {
    if (taskEnrollments.length === 0) return;

    let cancelled = false;

    const refreshTaskNames = async () => {
      const refreshed = await Promise.all(
        taskEnrollments.map(async (task) => {
          try {
            const response = await apiClient.post('/tasks/join', { inviteCode: task.inviteCode });
            const taskFromApi = response.data?.data?.task || response.data?.data || null;

            if (!taskFromApi?.name) return task;

            return {
              ...task,
              id: taskFromApi.id || task.id,
              name: taskFromApi.name,
              description: taskFromApi.description || task.description,
              startDate: taskFromApi.startDate || task.startDate,
              endDate: taskFromApi.endDate || task.endDate,
              environmentConfig: taskFromApi.environmentConfig || task.environmentConfig,
            };
          } catch {
            return task;
          }
        })
      );

      if (cancelled) return;

      const changed = refreshed.some((task, index) => (
        task.name !== taskEnrollments[index].name ||
        task.description !== taskEnrollments[index].description ||
        task.startDate !== taskEnrollments[index].startDate ||
        task.endDate !== taskEnrollments[index].endDate ||
        JSON.stringify(task.environmentConfig || null) !== JSON.stringify(taskEnrollments[index].environmentConfig || null) ||
        task.id !== taskEnrollments[index].id
      ));

      if (changed) {
        setTaskEnrollments(refreshed);
        writeTaskEnrollments(refreshed);
      }
    };

    refreshTaskNames();

    return () => {
      cancelled = true;
    };
  }, [taskEnrollments]);

  useEffect(() => {
    if (isLoading || !documents) return;
    const existingDocumentIds = new Set(documents.map((document) => document.id));
    const nextEnrollments = taskEnrollments.filter((task) => (
      existingDocumentIds.has(task.documentId)
    ));

    if (nextEnrollments.length !== taskEnrollments.length) {
      setTaskEnrollments(nextEnrollments);
      writeTaskEnrollments(nextEnrollments);
    }
  }, [documents, isLoading, taskEnrollments]);

  const handleDeleteDocument = async (documentId: string) => {
    try {
      await deleteDocument(documentId);
      toast({
        title: 'Success',
        description: 'Document deleted successfully',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to delete document',
        variant: 'destructive',
      });
    }
  };

  const removeTaskEnrollment = (task: TaskEnrollment) => {
    const nextEnrollments = taskEnrollments.filter(
      (enrollment) => enrollment.documentId !== task.documentId
    );
    setTaskEnrollments(nextEnrollments);
    writeTaskEnrollments(nextEnrollments);
  };

  const handleDeleteTaskEnrollment = async () => {
    if (!taskToDelete) return;

    try {
      await apiClient.delete(`/tasks/enrollments/${taskToDelete.id}`);
      await deleteDocument(taskToDelete.documentId);
      removeTaskEnrollment(taskToDelete);
      toast({
        title: 'Task removed',
        description: 'The task submission was deleted from your dashboard',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to delete task',
        variant: 'destructive',
      });
    } finally {
      setTaskToDelete(null);
    }
  };

  const handleJoinTask = useCallback(async () => {
    const normalizedCode = inviteCode.trim().toUpperCase();
    if (!/^[A-Z0-9]{6}$/.test(normalizedCode)) {
      toast({
        title: 'Error',
        description: 'Invite code must be 6 letters or numbers',
        variant: 'destructive',
      });
      return;
    }

    if (taskEnrollments.some((task) => task.inviteCode === normalizedCode)) {
      toast({
        title: 'Already joined',
        description: 'This task is already on your dashboard',
      });
      setShowJoinDialog(false);
      setInviteCode('');
      return;
    }

    try {
      setIsJoiningTask(true);

      const response = await apiClient.post('/tasks/join', { inviteCode: normalizedCode });
      const enrollmentFromApi: Partial<TaskEnrollment> | null = response.data?.data?.task || response.data?.data || null;

      if (!enrollmentFromApi?.name) {
        throw new Error('Task invite code not found');
      }

      const document = await createDocument(
        `${enrollmentFromApi.name} Submission`,
        undefined,
        enrollmentFromApi.environmentConfig || null
      );

      const enrollment: TaskEnrollment = {
        id: enrollmentFromApi?.id || normalizedCode,
        name: enrollmentFromApi.name,
        description: enrollmentFromApi?.description || 'Task joined with invite code',
        startDate: enrollmentFromApi?.startDate,
        endDate: enrollmentFromApi?.endDate,
        environmentConfig: enrollmentFromApi?.environmentConfig || null,
        inviteCode: normalizedCode,
        documentId: document.id,
        joinedAt: new Date().toISOString(),
      };

      await apiClient.put(`/tasks/enrollments/${enrollment.id}/submission-document`, {
        documentId: document.id,
      });

      const nextEnrollments = [...taskEnrollments, enrollment];
      setTaskEnrollments(nextEnrollments);
      writeTaskEnrollments(nextEnrollments);
      setShowJoinDialog(false);
      setInviteCode('');

      toast({
        title: 'Task joined',
        description: 'A task submission document was added to your dashboard',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to join task',
        variant: 'destructive',
      });
    } finally {
      setIsJoiningTask(false);
    }
  }, [createDocument, inviteCode, taskEnrollments, toast]);

  const documentIds = new Set((documents || []).map((document) => document.id));
  const validTaskEnrollments = taskEnrollments.filter((task) => (
    documentIds.has(task.documentId)
  ));
  const taskDocumentIds = new Set(validTaskEnrollments.map((task) => task.documentId));
  const personalDocuments = (documents || [])
    .filter((document) => !taskDocumentIds.has(document.id))
    .sort((a, b) => {
      if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (sortBy === 'wordCount') {
        return (b.wordCount || 0) - (a.wordCount || 0);
      }
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    });

  // Container classes for centered content with max-width
  const containerClass = "mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8";

  if (isLoading) {
    return (
      <main className={containerClass}>
        <div className="mb-8">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-3/4 mb-2" />
                <Skeleton className="h-4 w-1/2" />
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    );
  }

  if (error) {
    return (
      <main className={containerClass}>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <p className="text-destructive">{error}</p>
            <Button onClick={() => window.location.reload()} className="mt-4">
              Retry
            </Button>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className={containerClass}>
      <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">My Documents</h1>
          <p className="text-sm sm:text-base text-muted-foreground mt-1">
            Create and manage your documents with authorship tracking
          </p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
            <DialogTrigger asChild>
              <Button variant="outline" className="w-full sm:w-auto">
                <KeyRound className="mr-2 h-4 w-4" />
                Join Task
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Join Task</DialogTitle>
                <DialogDescription>
                  Enter the 6-character invite code from your instructor or admin.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-2 py-4">
                <Label htmlFor="invite-code">Invite Code</Label>
                <Input
                  id="invite-code"
                  value={inviteCode}
                  maxLength={6}
                  placeholder="A7K2QX"
                  className="font-mono uppercase tracking-widest"
                  onChange={(event) => setInviteCode(event.target.value.toUpperCase())}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') {
                      handleJoinTask();
                    }
                  }}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowJoinDialog(false)} disabled={isJoiningTask}>
                  Cancel
                </Button>
                <Button onClick={handleJoinTask} disabled={isJoiningTask}>
                  {isJoiningTask ? 'Joining...' : 'Join Task'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Button className="w-full sm:w-auto" onClick={() => router.push('/documents/new')}>
            <Plus className="mr-2 h-4 w-4" />
            New Document
          </Button>
        </div>
      </div>

      {validTaskEnrollments.length > 0 && (
        <section className="mb-10">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h2 className="text-xl font-semibold tracking-tight">Enrolled Task Documents</h2>
              <p className="text-sm text-muted-foreground">
                {validTaskEnrollments.length} task-scoped {validTaskEnrollments.length === 1 ? 'submission' : 'submissions'}
              </p>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {validTaskEnrollments.map((task) => {
              const taskName = getDisplayTaskName(task);
              return (
              <Card key={`${task.id}-${task.documentId}`} className="transition-shadow hover:shadow-md">
                <CardContent className="flex h-full flex-col gap-3 p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                        Task Name
                      </p>
                      <h3 className="truncate text-lg font-semibold" title={taskName}>
                        {taskName}
                      </h3>
                    </div>
                    <BookOpen className="h-5 w-5 shrink-0 text-muted-foreground" />
                  </div>
                  <div>
                    <p className="mb-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                      Code
                    </p>
                    <div className="rounded-md border bg-muted/30 px-3 py-2 font-mono text-sm font-semibold tracking-wider">
                      {task.inviteCode}
                    </div>
                  </div>
                  {(task.startDate || task.endDate) && (
                    <div className="grid gap-2 rounded-md border bg-muted/20 p-3 text-sm">
                      {task.startDate && (
                        <div className="flex items-start gap-2">
                          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Starts
                            </p>
                            <p className="break-words">{formatDateTime(task.startDate)}</p>
                          </div>
                        </div>
                      )}
                      {task.endDate && (
                        <div className="flex items-start gap-2">
                          <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                              Deadline
                            </p>
                            <p className="break-words">{formatDateTime(task.endDate)}</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                  <div className="flex-1" />
                  <div className="flex gap-2">
                    <Button className="flex-1" onClick={() => router.push(`/documents/${task.documentId}`)}>
                      Open Submission
                    </Button>
                    <Button
                      variant="outline"
                      size="icon"
                      title="Delete task submission"
                      onClick={() => setTaskToDelete(task)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
            })}
          </div>
        </section>
      )}

      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold tracking-tight">My Documents</h2>
          <p className="text-sm text-muted-foreground">
            {personalDocuments.length} personal/private {personalDocuments.length === 1 ? 'document' : 'documents'}
          </p>
        </div>
        <Select value={sortBy} onValueChange={(value) => setSortBy(value as SortOption)}>
          <SelectTrigger className="w-[180px]">
            <SelectValue placeholder="Sort by" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="lastEdited">Last edited</SelectItem>
            <SelectItem value="title">Title</SelectItem>
            <SelectItem value="wordCount">Word count</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {personalDocuments.length === 0 ? (
        <div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border-2 border-dashed">
          <FileText className="h-12 w-12 text-muted-foreground" />
          <h3 className="mt-4 text-lg font-semibold">No documents yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Get started by creating your first document
          </p>
          <Button className="mt-4" onClick={() => router.push('/documents/new')}>
            <Plus className="mr-2 h-4 w-4" />
            Create Document
          </Button>
        </div>
      ) : (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {personalDocuments.map((document) => (
            <DocumentCard
              key={document.id}
              document={document}
              onDelete={handleDeleteDocument}
            />
          ))}
        </div>
      )}

      <AlertDialog open={!!taskToDelete} onOpenChange={(open) => !open && setTaskToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Task Submission</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the task from your dashboard and deletes its submission document.
              This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteTaskEnrollment}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}

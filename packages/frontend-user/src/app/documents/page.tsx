'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Award,
  BookOpen,
  Calendar,
  ArrowDownAZ,
  Check,
  Eye,
  FileText,
  KeyRound,
  LayoutGrid,
  List,
  Plus,
  Trash2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
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
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
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
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import type { Document, WritingEnvironmentConfig } from '@humanly/shared';

type SortOption = 'lastEdited' | 'title' | 'characterCount';
type WorkspaceTab = 'documents' | 'tasks';
type DocumentViewMode = 'cards' | 'list';

const DOCUMENT_VIEW_MODE_STORAGE_KEY = 'humanly:documents:view-mode';

const SORT_LABELS: Record<SortOption, string> = {
  lastEdited: 'Last edited',
  title: 'Title',
  characterCount: 'Character count',
};

const isDocumentViewMode = (value: string | null): value is DocumentViewMode => (
  value === 'cards' || value === 'list'
);

interface TaskEnrollment {
  id: string;
  taskId?: string;
  enrollmentId?: string;
  name: string;
  inviteCode: string;
  documentId: string | null;
  writingStartedAt?: string | Date | null;
  joinedAt: string;
  description?: string;
  startDate?: string;
  endDate?: string;
  environmentConfig?: WritingEnvironmentConfig | null;
}

interface TimedWritingSource {
  environmentConfig?: WritingEnvironmentConfig | null;
  writingStartedAt?: string | Date | null;
}

interface WritingTimerCardState {
  expired: boolean;
  label: string;
  value: string;
  detail: string;
}

interface TaskWindowStatus {
  label: 'Scheduled' | 'Open now' | 'Ended';
  tone: 'muted' | 'success' | 'warning';
}

const taskStatusToneClass: Record<TaskWindowStatus['tone'] | 'timer', string> = {
  muted: 'border-border/80 bg-muted/45 text-muted-foreground',
  success: 'border-[#b9c8b8] bg-[#edf2eb] text-[#5d7766]',
  warning: 'border-[#dfc8aa] bg-[#f6efe4] text-[#92714e]',
  timer: 'border-[#dfc8aa] bg-[#f6efe4] text-[#92714e]',
};

const getDisplayTaskName = (task: TaskEnrollment) => {
  const name = task.name?.trim();
  if (!name || name === 'Task Name') return 'Task Submission';
  return name;
};

const getDisplayTaskDescription = (task: TaskEnrollment) => {
  const description = task.description?.trim();
  return description || 'No description provided.';
};

const formatTaskDateLabel = (value: string | undefined, fallback: string) => (
  value ? formatDateTime(value) : fallback
);

const getTaskWindowStatus = (
  task: Pick<TaskEnrollment, 'startDate' | 'endDate'>,
  nowMs: number
): TaskWindowStatus => {
  const startMs = task.startDate ? new Date(task.startDate).getTime() : NaN;
  const endMs = task.endDate ? new Date(task.endDate).getTime() : NaN;

  if (Number.isFinite(startMs) && nowMs < startMs) {
    return { label: 'Scheduled', tone: 'muted' };
  }

  if (Number.isFinite(endMs) && nowMs > endMs) {
    return { label: 'Ended', tone: 'warning' };
  }

  return { label: 'Open now', tone: 'success' };
};

const getTaskStatusBadge = (
  task: TaskEnrollment,
  nowMs: number,
  timerState: WritingTimerCardState | null
) => {
  if (timerState?.expired) {
    return {
      label: 'Read-only',
      className: taskStatusToneClass.muted,
    };
  }

  if (timerState) {
    return {
      label: timerState.value,
      className: taskStatusToneClass.timer,
    };
  }

  const taskWindowStatus = getTaskWindowStatus(task, nowMs);
  return {
    label: taskWindowStatus.label,
    className: taskStatusToneClass[taskWindowStatus.tone],
  };
};

const getTimestampMs = (value?: string | Date | null): number | null => {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : null;
};

const formatTaskCountdown = (totalSeconds: number): string => {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  const seconds = safeSeconds % 60;

  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }

  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const getWritingTimeLimitSeconds = (source: TimedWritingSource): number | null => {
  const configuredSeconds = source.environmentConfig?.time?.timeLimitSeconds;
  if (!configuredSeconds) return null;

  return Math.max(1, Math.floor(configuredSeconds));
};

const getWritingTimerState = (
  source: TimedWritingSource,
  nowMs: number,
  options: { expiredDetail?: string } = {}
): WritingTimerCardState | null => {
  const timeLimitSeconds = getWritingTimeLimitSeconds(source);
  if (timeLimitSeconds === null) return null;

  const startedAtMs = getTimestampMs(source.writingStartedAt);
  if (startedAtMs === null) {
    return {
      expired: false,
      label: 'Writing time limit',
      value: formatTaskCountdown(timeLimitSeconds),
      detail: 'Timer starts when opened.',
    };
  }

  const elapsedSeconds = Math.max(0, Math.floor((nowMs - startedAtMs) / 1000));
  const remainingSeconds = Math.max(0, timeLimitSeconds - elapsedSeconds);
  const expired = remainingSeconds === 0;

  return {
    expired,
    label: expired ? 'Writing time limit reached' : 'Writing time left',
    value: expired ? 'Read-only' : formatTaskCountdown(remainingSeconds),
    detail: expired
      ? options.expiredDetail || 'Opens in read-only mode.'
      : 'Continues while you are away.',
  };
};

export default function DocumentsPage() {
  const router = useRouter();
  const { documents, isLoading, error, createDocument, deleteDocument } = useDocuments();
  const { toast } = useToast();
  const [sortBy, setSortBy] = useState<SortOption>('lastEdited');
  const [documentViewMode, setDocumentViewMode] = useState<DocumentViewMode>('list');
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<WorkspaceTab>('documents');
  const [showJoinDialog, setShowJoinDialog] = useState(false);
  const [taskToDelete, setTaskToDelete] = useState<TaskEnrollment | null>(null);
  const [inviteCode, setInviteCode] = useState('');
  const [isJoiningTask, setIsJoiningTask] = useState(false);
  const [taskEnrollments, setTaskEnrollments] = useState<TaskEnrollment[]>([]);
  const [isLoadingTaskEnrollments, setIsLoadingTaskEnrollments] = useState(true);
  const [taskEnrollmentsError, setTaskEnrollmentsError] = useState<string | null>(null);
  const [dashboardNowMs, setDashboardNowMs] = useState(() => Date.now());

  useEffect(() => {
    const storedViewMode = window.localStorage.getItem(DOCUMENT_VIEW_MODE_STORAGE_KEY);
    if (isDocumentViewMode(storedViewMode)) {
      setDocumentViewMode(storedViewMode);
    }
  }, []);

  const handleDocumentViewModeChange = useCallback((nextViewMode: DocumentViewMode) => {
    setDocumentViewMode(nextViewMode);
    window.localStorage.setItem(DOCUMENT_VIEW_MODE_STORAGE_KEY, nextViewMode);
  }, []);

  const fetchTaskEnrollments = useCallback(async () => {
    try {
      setIsLoadingTaskEnrollments(true);
      setTaskEnrollmentsError(null);
      const response = await apiClient.get('/tasks/my-enrollments');
      setTaskEnrollments(response.data.data?.enrollments || []);
    } catch (err: any) {
      setTaskEnrollments([]);
      setTaskEnrollmentsError(err.message || 'Failed to fetch task enrollments');
    } finally {
      setIsLoadingTaskEnrollments(false);
    }
  }, []);

  useEffect(() => {
    fetchTaskEnrollments();
  }, [fetchTaskEnrollments]);

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

  const handleDeleteTaskEnrollment = async () => {
    if (!taskToDelete) return;
    if (!taskToDelete.documentId) return;

    try {
      await apiClient.delete(`/tasks/enrollments/${taskToDelete.id}`);
      await deleteDocument(taskToDelete.documentId);
      await fetchTaskEnrollments();
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

    if (taskEnrollments.some((task) => (
      task.inviteCode === normalizedCode &&
      task.documentId &&
      (documents || []).some((document) => document.id === task.documentId)
    ))) {
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

      await fetchTaskEnrollments();
      setShowJoinDialog(false);
      setInviteCode('');
      setActiveWorkspaceTab('tasks');

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
  }, [createDocument, documents, fetchTaskEnrollments, inviteCode, taskEnrollments, toast]);

  const documentIds = new Set((documents || []).map((document) => document.id));
  const validTaskEnrollments = taskEnrollments.filter((task) => (
    task.documentId && documentIds.has(task.documentId)
  ));
  const taskDocumentIds = new Set(validTaskEnrollments.map((task) => task.documentId));
  const personalDocuments = (documents || [])
    .filter((document) => !taskDocumentIds.has(document.id))
    .sort((a, b) => {
      if (sortBy === 'title') {
        return (a.title || '').localeCompare(b.title || '');
      }
      if (sortBy === 'characterCount') {
        return (b.characterCount ?? (b.plainText || '').length) - (a.characterCount ?? (a.plainText || '').length);
      }
      return new Date(b.updatedAt || b.createdAt).getTime() - new Date(a.updatedAt || a.createdAt).getTime();
    });
  const hasStartedWritingTimer = [
    ...validTaskEnrollments,
    ...personalDocuments,
  ].some((source) => (
    getWritingTimeLimitSeconds(source) !== null && getTimestampMs(source.writingStartedAt) !== null
  ));

  const containerClass = 'humanly-page';

  useEffect(() => {
    if (!hasStartedWritingTimer) return;

    const intervalId = window.setInterval(() => setDashboardNowMs(Date.now()), 1000);
    return () => window.clearInterval(intervalId);
  }, [hasStartedWritingTimer]);

  if (isLoading || isLoadingTaskEnrollments) {
    return (
      <main className={containerClass}>
        <div className="mb-8 space-y-3">
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

  if (error || taskEnrollmentsError) {
    return (
      <main className={containerClass}>
        <div className="flex min-h-[400px] items-center justify-center">
          <div className="text-center">
            <p className="text-destructive">{error || taskEnrollmentsError}</p>
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
      <div className="mb-6 flex flex-col gap-2">
        <p className="humanly-eyebrow">Workspace</p>
        <h1 className="text-2xl font-semibold tracking-normal sm:text-3xl">
          Writing Dashboard
        </h1>
        <p className="max-w-2xl text-sm text-muted-foreground sm:text-base">
          Start your own tracked writing or complete an assigned task from an instructor.
        </p>
      </div>

      <Tabs value={activeWorkspaceTab} onValueChange={(value) => setActiveWorkspaceTab(value as WorkspaceTab)}>
        <TabsList className="mb-6 grid w-full grid-cols-2 border border-border/70 bg-muted/60 sm:w-[470px]">
          <TabsTrigger value="documents">Personal Writing</TabsTrigger>
          <TabsTrigger value="tasks">Task Submissions</TabsTrigger>
        </TabsList>

        <TabsContent value="documents" className="mt-0 space-y-6">
          <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-normal">Personal Writing</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Create personal writing projects, track your process, and generate verifiable authorship certificates.
              </p>
            </div>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button variant="outline" className="w-full sm:w-auto" onClick={() => router.push('/certificates')}>
                <Award className="mr-2 h-4 w-4" />
                View Certificates
              </Button>
              <Button className="w-full sm:w-auto" onClick={() => router.push('/documents/new')}>
                <Plus className="mr-2 h-4 w-4" />
                Create Writing
              </Button>
            </div>
          </section>

          {personalDocuments.length === 0 ? (
            <div className="humanly-surface flex min-h-[360px] flex-col items-center justify-center bg-card px-6 text-center">
              <FileText className="h-10 w-10 text-accent" />
              <h3 className="mt-4 text-lg font-semibold">No personal documents yet</h3>
              <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
                Start a personal writing document when you want authorship tracking and certificate generation.
              </p>
              <Button className="mt-4" onClick={() => router.push('/documents/new')}>
                <Plus className="mr-2 h-4 w-4" />
                Create Writing
              </Button>
            </div>
          ) : (
            <>
              <div className="flex items-center justify-end gap-2">
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-10 w-10 text-muted-foreground hover:text-foreground"
                  aria-label={documentViewMode === 'cards' ? 'List view' : 'Card view'}
                  onClick={() => handleDocumentViewModeChange(documentViewMode === 'cards' ? 'list' : 'cards')}
                >
                  {documentViewMode === 'cards' ? (
                    <List className="h-6 w-6" />
                  ) : (
                    <LayoutGrid className="h-6 w-6" />
                  )}
                </Button>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-10 w-10 text-muted-foreground hover:text-foreground"
                      aria-label={`Sort by ${SORT_LABELS[sortBy]}`}
                    >
                      <ArrowDownAZ className="h-6 w-6" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    {(Object.keys(SORT_LABELS) as SortOption[]).map((option) => (
                      <DropdownMenuItem key={option} onClick={() => setSortBy(option)}>
                        <Check className={sortBy === option ? 'mr-2 h-4 w-4 opacity-100' : 'mr-2 h-4 w-4 opacity-0'} />
                        {SORT_LABELS[option]}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              {documentViewMode === 'cards' ? (
                <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
                  {personalDocuments.map((document: Document) => (
                    <DocumentCard
                      key={document.id}
                      document={document}
                      timerState={getWritingTimerState(document, dashboardNowMs)}
                      onDelete={handleDeleteDocument}
                      variant="card"
                    />
                  ))}
                </div>
              ) : (
                <div>
                  <div className="hidden grid-cols-[minmax(0,1fr)_8.5rem_10rem_2.75rem] border-b border-border/70 px-2 pb-2 text-xs font-medium uppercase tracking-normal text-muted-foreground md:grid">
                    <span>Name</span>
                    <span>Characters</span>
                    <span>Last edited</span>
                    <span />
                  </div>
                  <div>
                    {personalDocuments.map((document: Document) => (
                      <DocumentCard
                        key={document.id}
                        document={document}
                        timerState={getWritingTimerState(document, dashboardNowMs)}
                        onDelete={handleDeleteDocument}
                        variant="list"
                      />
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </TabsContent>

        <TabsContent value="tasks" className="mt-0 space-y-6">
          <section className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h2 className="text-xl font-semibold tracking-normal">Task Submissions</h2>
              <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
                Join tasks from an instructor or organization and complete the assigned submission workflow.
              </p>
            </div>
            <Dialog open={showJoinDialog} onOpenChange={setShowJoinDialog}>
              <DialogTrigger asChild>
                <Button className="w-full sm:w-auto">
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
                    className=" uppercase tracking-normal"
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
          </section>

          {validTaskEnrollments.length === 0 ? (
            <div className="humanly-surface flex min-h-[360px] flex-col items-center justify-center bg-card px-6 text-center">
              <BookOpen className="h-10 w-10 text-accent" />
              <h3 className="mt-4 text-lg font-semibold">No assigned tasks yet</h3>
              <p className="mt-2 max-w-sm text-center text-sm text-muted-foreground">
                Use an invite code when an instructor or organization asks you to complete a Humanly task.
              </p>
            </div>
          ) : (
            <div className="grid min-w-0 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {validTaskEnrollments.map((task) => {
                const taskName = getDisplayTaskName(task);
                const taskDescription = getDisplayTaskDescription(task);
                const timerState = getWritingTimerState(task, dashboardNowMs, {
                  expiredDetail: 'Submission opens in read-only mode.',
                });
                const statusBadge = getTaskStatusBadge(task, dashboardNowMs, timerState);
                return (
                  <Card
                    key={`${task.id}-${task.documentId}`}
                    data-testid="task-submission-card"
                    className="flex h-full min-h-[390px] flex-col transition-[border-color,transform] hover:-translate-y-1 hover:border-foreground/20"
                  >
                    <CardHeader className="h-[230px] shrink-0 overflow-hidden">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <CardTitle
                            className="line-clamp-2 break-words [overflow-wrap:anywhere] text-xl leading-tight"
                            title={taskName}
                          >
                            {taskName}
                          </CardTitle>
                        </div>

                        <Badge
                          variant="outline"
                          className={`${statusBadge.className} shrink-0 whitespace-nowrap rounded-full px-3`}
                        >
                          {statusBadge.label}
                        </Badge>
                      </div>

                      <CardDescription
                        className="mt-4 line-clamp-4 break-words [overflow-wrap:anywhere]"
                        title={taskDescription}
                      >
                        {taskDescription}
                      </CardDescription>
                    </CardHeader>

                    <CardContent className="shrink-0 pb-8">
                      <div className="space-y-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-3">
                          <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 truncate">
                            Start Date: {formatTaskDateLabel(task.startDate, 'Not scheduled')}
                          </span>
                        </div>
                        <div className="flex items-center gap-3">
                          <Calendar className="h-4 w-4 shrink-0 text-muted-foreground" />
                          <span className="min-w-0 truncate">
                            Deadline: {formatTaskDateLabel(task.endDate, 'No deadline')}
                          </span>
                        </div>
                      </div>
                    </CardContent>

                    <CardFooter className="mt-auto border-t border-border/70 bg-muted/20 !p-0">
                      <div className="flex w-full gap-2 px-6 pb-6 pt-6">
                        <Button
                          variant="default"
                          size="sm"
                          className="h-10 flex-1"
                          onClick={() => router.push(`/documents/${task.documentId}`)}
                        >
                          <Eye className="mr-2 h-4 w-4" />
                          Open Submission
                        </Button>

                        <Button
                          variant="outline"
                          size="sm"
                          className="h-10 min-w-[120px]"
                          title="Delete task submission"
                          onClick={() => setTaskToDelete(task)}
                        >
                          <Trash2 className="mr-2 h-4 w-4" />
                          Delete
                        </Button>
                      </div>
                    </CardFooter>
                  </Card>
                );
              })}
            </div>
          )}
        </TabsContent>
      </Tabs>

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

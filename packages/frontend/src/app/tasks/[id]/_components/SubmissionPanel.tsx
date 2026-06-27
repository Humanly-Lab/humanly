'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Award, BarChart3, ChevronRight, Download, FileText, Loader2, RefreshCcw, ShieldAlert, Users } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn, formatDateTime } from '@/lib/utils';
import { ApiError, apiClient } from '@/lib/api-client';
import { buildCertificateVerifyUrl } from '@/lib/certificate-url';
import { downloadBlob } from '@/lib/download';
import { getReviewSignals } from '@/lib/review-signals';

import type { AdminSubmission, SubmissionPagination, TaskEnrollment } from './types';

interface SubmissionPanelProps {
  taskId: string;
  enrollments: TaskEnrollment[];
  submissions: AdminSubmission[];
  submissionPagination: SubmissionPagination | null;
  selectedUserId: 'all' | string;
  isLoadingEnrollments: boolean;
  isLoadingSubmissions: boolean;
  isLoadingMoreSubmissions: boolean;
  enrollmentsError: string | null;
  onSelectedUserChange: (userId: 'all' | string) => void;
  onLoadMoreSubmissions: () => void;
  onRefresh: () => void;
}

const sortSubmissions = (submissions: AdminSubmission[]) => (
  [...submissions].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
);

const formatSubmissionCount = (count: number) => {
  if (count === 0) return 'No submissions yet';
  return `${count.toLocaleString()} ${count === 1 ? 'submission' : 'submissions'}`;
};

const formatAttemptLabel = (attemptNumber?: number | null) => (
  attemptNumber ? `Attempt ${attemptNumber}` : 'Attempt 1'
);

const severityRank = {
  info: 0,
  warning: 1,
  critical: 2,
} as const;

const getFlagBadgeClass = (severity: keyof typeof severityRank) => {
  if (severity === 'critical') return 'border-[#d6c5c7] bg-[#f2edee] text-[#6f5d61]';
  if (severity === 'warning') return 'border-[#d8ccba] bg-[#f2efe8] text-[#6a6256]';
  return 'border-[#c8d1dc] bg-[#eef1f4] text-[#576777]';
};

type TaskExportKind = 'submissions' | 'log-events';
type TaskExportFormat = 'csv' | 'json';
type TaskExportScope = 'all' | 'selected-user';
type DownloadTarget = `${TaskExportKind}:${TaskExportFormat}:${TaskExportScope}`;

const getTaskExportFilename = (
  taskId: string,
  kind: TaskExportKind,
  format: TaskExportFormat,
  contentDisposition?: string
) => {
  const match = contentDisposition?.match(/filename="?([^";]+)"?/i);
  if (match?.[1]) return match[1];

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  return `humanly-task-${taskId}-${kind}-${timestamp}.${format}`;
};

const getTaskExportErrorMessage = (error: unknown) => {
  if (error instanceof ApiError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Could not download this task export.';
};

export function SubmissionPanel({
  taskId,
  enrollments,
  submissions,
  submissionPagination,
  selectedUserId,
  isLoadingEnrollments,
  isLoadingSubmissions,
  isLoadingMoreSubmissions,
  enrollmentsError,
  onSelectedUserChange,
  onLoadMoreSubmissions,
  onRefresh,
}: SubmissionPanelProps) {
  const router = useRouter();
  const [downloadTarget, setDownloadTarget] = useState<DownloadTarget | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const submissionsByUser = useMemo(() => (
    submissions.reduce<Record<string, AdminSubmission[]>>((groups, submission) => {
      const current = groups[submission.userId] || [];
      groups[submission.userId] = sortSubmissions([...current, submission]);
      return groups;
    }, {})
  ), [submissions]);

  const selectedEnrollment = enrollments.find((enrollment) => enrollment.userId === selectedUserId) || null;
  const selectedSubmissions = selectedUserId === 'all'
    ? []
    : submissionsByUser[selectedUserId] || [];
  const latestSubmissions = enrollments
    .map((enrollment) => ({
      enrollment,
      submission: submissionsByUser[enrollment.userId]?.[0] || null,
    }))
    .filter((item): item is { enrollment: TaskEnrollment; submission: AdminSubmission } => Boolean(item.submission));

  useEffect(() => {
    if (selectedUserId !== 'all' && !enrollments.some((enrollment) => enrollment.userId === selectedUserId)) {
      onSelectedUserChange('all');
    }
  }, [enrollments, onSelectedUserChange, selectedUserId]);

  const isLoading = isLoadingEnrollments || (isLoadingSubmissions && submissions.length === 0);
  const loadedSubmissionCount = submissions.length;
  const totalSubmissionCount = submissionPagination?.total ?? loadedSubmissionCount;

  const openSubmission = (submissionId: string) => {
    router.push(`/tasks/${taskId}/submissions/${submissionId}?from=submission`);
  };

  const downloadTaskExport = async (
    kind: TaskExportKind,
    format: TaskExportFormat,
    scope: TaskExportScope = 'all'
  ) => {
    const target: DownloadTarget = `${kind}:${format}:${scope}`;
    setDownloadTarget(target);
    setDownloadError(null);

    const userId = scope === 'selected-user' && selectedUserId !== 'all'
      ? selectedUserId
      : undefined;

    try {
      const response = await apiClient.get<Blob>(`/api/v1/tasks/${taskId}/exports/${kind}`, {
        params: { format, ...(userId ? { userId } : {}) },
        responseType: 'blob',
      });
      const filename = getTaskExportFilename(
        taskId,
        kind,
        format,
        response.headers['content-disposition']
      );

      downloadBlob(response.data, filename);
    } catch (error) {
      setDownloadError(getTaskExportErrorMessage(error));
    } finally {
      setDownloadTarget(null);
    }
  };

  const renderCertificateCell = (submission: AdminSubmission) => {
    if (!submission.certificateVerificationToken) {
      return <span className="text-sm text-muted-foreground">No certificate</span>;
    }

    return (
      <Button asChild variant="outline" size="sm">
        <a
          href={buildCertificateVerifyUrl(submission.certificateVerificationToken)}
          onClick={(event) => event.stopPropagation()}
        >
          <Award className="mr-1 h-4 w-4" />
          Issued
        </a>
      </Button>
    );
  };

  const renderSignalsCell = (submission: AdminSubmission) => {
    const flags = getReviewSignals(submission.anomalyFlags);
    const refusalCount = submission.aiPolicyRefusalCount || 0;
    const hasRefusalFlag = flags.some((flag) => flag.code === 'chat_refusal');

    if (flags.length === 0 && refusalCount === 0) {
      return <span className="text-sm text-muted-foreground">None</span>;
    }

    const highestSeverity = flags.length > 0
      ? flags.reduce((current, flag) => (
        severityRank[flag.severity] > severityRank[current] ? flag.severity : current
      ), flags[0].severity)
      : null;

    return (
      <div className="flex flex-wrap gap-2">
        {highestSeverity && (
          <Badge variant="outline" className={`gap-1 capitalize ${getFlagBadgeClass(highestSeverity)}`}>
            <ShieldAlert className="h-3 w-3" />
            {highestSeverity} · {flags.length}
          </Badge>
        )}
        {refusalCount > 0 && !hasRefusalFlag && (
          <Badge variant="outline" className="gap-1 border-[#B56F5C]/35 bg-[#B56F5C]/10 text-[#6E3F35]">
            <ShieldAlert className="h-3 w-3" />
            Chat refusals · {refusalCount}
          </Badge>
        )}
      </div>
    );
  };

  const renderDownloadButton = (
    kind: TaskExportKind,
    format: TaskExportFormat,
    label: string,
    scope: TaskExportScope = 'all'
  ) => {
    const target: DownloadTarget = `${kind}:${format}:${scope}`;
    const isDownloading = downloadTarget === target;

    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => downloadTaskExport(kind, format, scope)}
        disabled={Boolean(downloadTarget)}
      >
        {isDownloading ? (
          <Loader2 className="mr-2 h-4 w-4 animate-spin" />
        ) : (
          <Download className="mr-2 h-4 w-4" />
        )}
        {label}
      </Button>
    );
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Users</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          <button
            type="button"
            className={cn(
              'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
              selectedUserId === 'all' ? 'border-primary bg-primary/5 text-primary' : 'bg-background'
            )}
            onClick={() => onSelectedUserChange('all')}
          >
            <span className="flex items-center gap-2 font-medium">
              <Users className="h-4 w-4" />
              All users
            </span>
            <Badge variant="secondary">{enrollments.length}</Badge>
          </button>

          <div className="max-h-[520px] space-y-2 overflow-y-auto pr-1">
            {isLoadingEnrollments ? (
              <div className="flex h-32 items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : enrollments.length === 0 ? (
              <div className="rounded-md border border-dashed p-4 text-sm text-muted-foreground">
                No enrolled users yet.
              </div>
            ) : (
              enrollments.map((enrollment) => {
                const userSubmissionCount = enrollment.submissionCount || 0;
                return (
                  <button
                    key={enrollment.id}
                    type="button"
                    className={cn(
                      'w-full rounded-md border px-3 py-2.5 text-left transition-colors hover:bg-accent',
                      selectedUserId === enrollment.userId ? 'border-primary bg-primary/5' : 'bg-background'
                    )}
                    onClick={() => onSelectedUserChange(enrollment.userId)}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-medium">{enrollment.email}</span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <span
                        aria-hidden="true"
                        className={cn(
                          'h-1.5 w-1.5 rounded-full',
                          userSubmissionCount > 0 ? 'bg-emerald-500' : 'bg-muted-foreground/40'
                        )}
                      />
                      <span>{formatSubmissionCount(userSubmissionCount)}</span>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>
                {selectedUserId === 'all'
                  ? 'Latest submissions'
                  : selectedEnrollment?.email || 'User submissions'}
              </CardTitle>
              {totalSubmissionCount > 0 && (
                <p className="mt-1 text-sm text-muted-foreground">
                  Showing {loadedSubmissionCount.toLocaleString()} of {totalSubmissionCount.toLocaleString()} submissions
                </p>
              )}
            </div>
            <div className="flex flex-wrap items-center justify-end gap-2">
              {selectedUserId === 'all' ? (
                <>
                  {renderDownloadButton('log-events', 'csv', 'Log events CSV')}
                  {renderDownloadButton('submissions', 'csv', 'Submissions CSV')}
                </>
              ) : (
                <>
                  {renderDownloadButton('log-events', 'csv', 'User log events CSV', 'selected-user')}
                  {renderDownloadButton('submissions', 'csv', 'User submissions CSV', 'selected-user')}
                </>
              )}
              <Button
                variant="outline"
                size="icon"
                onClick={onRefresh}
                disabled={isLoading}
                aria-label="Refresh submissions"
                title="Refresh submissions"
              >
                <RefreshCcw className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {downloadError ? (
            <Alert variant="destructive" className="mb-4">
              <AlertTitle>Download failed</AlertTitle>
              <AlertDescription>{downloadError}</AlertDescription>
            </Alert>
          ) : null}

          {isLoading ? (
            <div className="flex h-[300px] items-center justify-center">
              <div className="space-y-3 text-center">
                <Loader2 className="mx-auto h-8 w-8 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Loading submissions...</p>
              </div>
            </div>
          ) : enrollmentsError ? (
            <Alert variant="destructive">
              <AlertTitle>Error loading users</AlertTitle>
              <AlertDescription>{enrollmentsError}</AlertDescription>
            </Alert>
          ) : selectedUserId === 'all' ? (
            enrollments.length === 0 ? (
              <div className="flex h-[240px] items-center justify-center rounded-md border border-dashed">
                <div className="space-y-2 text-center">
                  <Users className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">No enrolled users yet</p>
                  <p className="text-sm text-muted-foreground">Users will appear here after joining with the task code.</p>
                </div>
              </div>
            ) : latestSubmissions.length === 0 ? (
              <div className="flex h-[240px] items-center justify-center rounded-md border border-dashed">
                <div className="space-y-2 text-center">
                  <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
                  <p className="font-medium">No submissions yet</p>
                </div>
              </div>
            ) : (
              <>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>User</TableHead>
                        <TableHead>Latest Submission</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Review Signals</TableHead>
                        <TableHead className="text-right">Certificate</TableHead>
                        <TableHead className="text-right">Analytics</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {latestSubmissions.map(({ enrollment, submission }) => {
                        return (
                          <TableRow key={enrollment.id}>
                            <TableCell>
                              <div className="font-medium">{enrollment.email}</div>
                            </TableCell>
                            <TableCell>
                              <div className="flex items-start gap-2">
                                <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                                <div className="min-w-0">
                                  <span className="block truncate">{submission.documentTitle || 'Submission Document'}</span>
                                  <span className="text-xs text-muted-foreground">
                                    {formatAttemptLabel(submission.attemptNumber)}
                                  </span>
                                </div>
                              </div>
                            </TableCell>
                            <TableCell>{formatDateTime(submission.submittedAt)}</TableCell>
                            <TableCell>{renderSignalsCell(submission)}</TableCell>
                            <TableCell className="text-right">{renderCertificateCell(submission)}</TableCell>
                            <TableCell className="text-right">
                              <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => openSubmission(submission.id)}
                              >
                                <BarChart3 className="mr-2 h-4 w-4" />
                                View Analytics
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                {submissionPagination?.hasMore && (
                  <div className="mt-4 flex justify-center">
                    <Button
                      type="button"
                      variant="outline"
                      onClick={onLoadMoreSubmissions}
                      disabled={isLoadingMoreSubmissions}
                    >
                      {isLoadingMoreSubmissions && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                      Load more
                    </Button>
                  </div>
                )}
              </>
            )
          ) : selectedSubmissions.length === 0 ? (
            <div className="flex h-[240px] items-center justify-center rounded-md border border-dashed">
              <div className="space-y-2 text-center">
                <FileText className="mx-auto h-8 w-8 text-muted-foreground" />
                <p className="font-medium">No submissions yet</p>
                <p className="text-sm text-muted-foreground">
                  This user has not submitted a task document.
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Document</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Review Signals</TableHead>
                      <TableHead className="text-right">Certificate</TableHead>
                      <TableHead className="text-right">Analytics</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedSubmissions.map((submission) => (
                      <TableRow key={submission.id}>
                        <TableCell>
                          <div className="flex items-start gap-2">
                            <FileText className="mt-0.5 h-4 w-4 text-muted-foreground" />
                            <div className="min-w-0">
                              <span className="block truncate">{submission.documentTitle || 'Submission Document'}</span>
                              <span className="text-xs text-muted-foreground">
                                {formatAttemptLabel(submission.attemptNumber)}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell>{formatDateTime(submission.submittedAt)}</TableCell>
                        <TableCell>{renderSignalsCell(submission)}</TableCell>
                        <TableCell className="text-right">{renderCertificateCell(submission)}</TableCell>
                        <TableCell className="text-right">
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => openSubmission(submission.id)}
                          >
                            <BarChart3 className="mr-2 h-4 w-4" />
                            View Analytics
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              {submissionPagination?.hasMore && (
                <div className="mt-4 flex justify-center">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={onLoadMoreSubmissions}
                    disabled={isLoadingMoreSubmissions}
                  >
                    {isLoadingMoreSubmissions && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Load more
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

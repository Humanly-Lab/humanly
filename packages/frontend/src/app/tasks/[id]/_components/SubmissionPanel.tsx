'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Award, FileText, Loader2, RefreshCcw, Users } from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { cn, formatDateTime } from '@/lib/utils';
import { buildCertificateVerifyUrl } from '@/lib/certificate-url';

import type { AdminSubmission, TaskEnrollment } from './types';

interface SubmissionPanelProps {
  taskId: string;
  enrollments: TaskEnrollment[];
  submissions: AdminSubmission[];
  isLoadingEnrollments: boolean;
  isLoadingSubmissions: boolean;
  enrollmentsError: string | null;
  onRefreshEnrollments: () => void;
  onRefreshSubmissions: () => void;
}

const sortSubmissions = (submissions: AdminSubmission[]) => (
  [...submissions].sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime())
);

export function SubmissionPanel({
  taskId,
  enrollments,
  submissions,
  isLoadingEnrollments,
  isLoadingSubmissions,
  enrollmentsError,
  onRefreshEnrollments,
  onRefreshSubmissions,
}: SubmissionPanelProps) {
  const router = useRouter();
  const [selectedUserId, setSelectedUserId] = useState<'all' | string>('all');

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

  useEffect(() => {
    if (selectedUserId !== 'all' && !enrollments.some((enrollment) => enrollment.userId === selectedUserId)) {
      setSelectedUserId('all');
    }
  }, [enrollments, selectedUserId]);

  const isLoading = isLoadingEnrollments || isLoadingSubmissions;

  const openSubmission = (submissionId: string) => {
    router.push(`/tasks/${taskId}/submissions/${submissionId}`);
  };

  const renderCertificateCell = (submission: AdminSubmission | null) => {
    if (!submission) {
      return <Badge variant="secondary">No submission</Badge>;
    }

    if (!submission.certificateVerificationToken) {
      return <Badge variant="secondary">Missing</Badge>;
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

  return (
    <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)]">
      <Card className="h-fit">
        <CardHeader>
          <CardTitle className="text-base">Users</CardTitle>
          <CardDescription>Select a user to inspect submission history.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          <button
            type="button"
            className={cn(
              'flex w-full items-center justify-between rounded-md border px-3 py-2 text-left text-sm transition-colors hover:bg-accent',
              selectedUserId === 'all' ? 'border-primary bg-primary/5 text-primary' : 'bg-background'
            )}
            onClick={() => setSelectedUserId('all')}
          >
            <span className="flex items-center gap-2 font-medium">
              <Users className="h-4 w-4" />
              All users
            </span>
            <span className="text-xs text-muted-foreground">{enrollments.length}</span>
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
                const userSubmissionCount = submissionsByUser[enrollment.userId]?.length || 0;
                return (
                  <button
                    key={enrollment.id}
                    type="button"
                    className={cn(
                      'w-full rounded-md border px-3 py-2 text-left transition-colors hover:bg-accent',
                      selectedUserId === enrollment.userId ? 'border-primary bg-primary/5' : 'bg-background'
                    )}
                    onClick={() => setSelectedUserId(enrollment.userId)}
                  >
                    <div className="truncate text-sm font-medium">{enrollment.email}</div>
                    <div className="mt-1 flex items-center justify-between gap-2">
                      <span className="truncate font-mono text-xs text-muted-foreground">{enrollment.userId}</span>
                      <Badge variant="secondary">{userSubmissionCount}</Badge>
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
              <CardDescription>
                {selectedUserId === 'all'
                  ? 'One latest submission per enrolled user.'
                  : 'All submissions for the selected user, latest first.'}
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={onRefreshEnrollments} disabled={isLoading}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Users
              </Button>
              <Button variant="outline" size="sm" onClick={onRefreshSubmissions} disabled={isLoading}>
                <RefreshCcw className="mr-2 h-4 w-4" />
                Submissions
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
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
            ) : (
              <div className="rounded-md border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Latest Submission</TableHead>
                      <TableHead>Submitted</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="text-right">Certificate</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {enrollments.map((enrollment) => {
                      const latestSubmission = submissionsByUser[enrollment.userId]?.[0] || null;
                      return (
                        <TableRow
                          key={enrollment.id}
                          className={latestSubmission ? 'cursor-pointer hover:bg-muted/50' : undefined}
                          onClick={() => latestSubmission && openSubmission(latestSubmission.id)}
                        >
                          <TableCell>
                            <div className="space-y-1">
                              <div className="font-medium">{enrollment.email}</div>
                              <div className="font-mono text-xs text-muted-foreground">{enrollment.userId}</div>
                            </div>
                          </TableCell>
                          <TableCell>
                            {latestSubmission ? (
                              <div className="flex items-center gap-2">
                                <FileText className="h-4 w-4 text-muted-foreground" />
                                <span>{latestSubmission.documentTitle || 'Submission Document'}</span>
                              </div>
                            ) : (
                              <span className="text-sm text-muted-foreground">No submission yet</span>
                            )}
                          </TableCell>
                          <TableCell>
                            {latestSubmission ? formatDateTime(latestSubmission.submittedAt) : '—'}
                          </TableCell>
                          <TableCell>
                            {latestSubmission ? (
                              <Badge variant={latestSubmission.status === 'active' ? 'default' : 'secondary'}>
                                {latestSubmission.status === 'active' ? 'Latest' : 'Historical'}
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Pending</Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-right">{renderCertificateCell(latestSubmission)}</TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
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
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Document</TableHead>
                    <TableHead>Submitted</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Submission ID</TableHead>
                    <TableHead className="text-right">Certificate</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {selectedSubmissions.map((submission, index) => (
                    <TableRow
                      key={submission.id}
                      className="cursor-pointer hover:bg-muted/50"
                      onClick={() => openSubmission(submission.id)}
                    >
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <FileText className="h-4 w-4 text-muted-foreground" />
                          <span>{submission.documentTitle || 'Submission Document'}</span>
                        </div>
                      </TableCell>
                      <TableCell>{formatDateTime(submission.submittedAt)}</TableCell>
                      <TableCell>
                        <Badge variant={index === 0 || submission.status === 'active' ? 'default' : 'secondary'}>
                          {index === 0 || submission.status === 'active' ? 'Latest' : 'Historical'}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">{submission.id}</TableCell>
                      <TableCell className="text-right">{renderCertificateCell(submission)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

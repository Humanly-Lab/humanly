'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Award,
  Eye,
  FileText,
  Loader2,
  RefreshCcw,
  User,
} from 'lucide-react';

import api, { ApiError } from '@/lib/api-client';
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
import { formatDateTime as formatLocalDateTime } from '@/lib/utils';
import { buildCertificateVerifyUrl } from '@/lib/certificate-url';

interface TaskEnrollment {
  id: string;
  taskId: string;
  userId: string;
  email: string;
  documentId: string | null;
  documentTitle: string | null;
  joinedAt: string;
  submissionCount: number;
  eventCount: number;
  lastActivity: string | null;
}

interface Submission {
  id: string;
  documentId: string;
  documentTitle?: string | null;
  certificateId: string | null;
  certificateVerificationToken?: string | null;
  submittedAt: string;
  status: 'active' | 'historical';
}

export default function EnrollmentSubmissionsPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  const userId = params.userId as string;

  const [enrollment, setEnrollment] = useState<TaskEnrollment | null>(null);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEnrollmentAndSubmissions = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);

      const enrollmentsResponse = await api.get<{
        success: boolean;
        data: {
          enrollments: TaskEnrollment[];
        };
      }>(`/api/v1/tasks/${taskId}/enrollments`);

      const selectedEnrollment = enrollmentsResponse.data.enrollments.find((item) => item.userId === userId);
      if (!selectedEnrollment) {
        throw new Error('Enrollment not found for this task');
      }

      const submissionsResponse = await api.get<{
        success: boolean;
        data: {
          submissions: Submission[];
        };
      }>(`/api/v1/tasks/${taskId}/submissions`, {
        params: { userId },
      });

      setEnrollment(selectedEnrollment);
      setSubmissions(submissionsResponse.data.submissions);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load user submissions');
      setEnrollment(null);
      setSubmissions([]);
    } finally {
      setIsLoading(false);
    }
  }, [taskId, userId]);

  useEffect(() => {
    if (taskId && userId) {
      fetchEnrollmentAndSubmissions();
    }
  }, [fetchEnrollmentAndSubmissions, taskId, userId]);

  const formatDateTime = (date: string | null) => {
    if (!date) return 'No activity yet';
    return formatLocalDateTime(date);
  };

  const latestSubmission = submissions[0] || null;

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/tasks/${taskId}?tab=users`)}
          className="-ml-2 mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Enrolled Users
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">User Submissions</h1>
        <p className="text-muted-foreground mt-2">
          {enrollment ? enrollment.email : 'Loading user'} submissions for this task.
        </p>
      </div>

      {error ? (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading submissions</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      ) : null}

      {isLoading ? (
        <div className="h-[320px] flex items-center justify-center">
          <div className="text-center space-y-3">
            <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
            <p className="text-sm text-muted-foreground">Loading submissions...</p>
          </div>
        </div>
      ) : enrollment ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">User</CardTitle>
                <User className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="truncate text-lg font-semibold" title={enrollment.email}>
                  {enrollment.email}
                </div>
                <p className="mt-1 truncate font-mono text-xs text-muted-foreground" title={enrollment.userId}>
                  {enrollment.userId}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{submissions.length.toLocaleString()}</div>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">Last Activity</CardTitle>
                <FileText className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-sm font-medium">{formatDateTime(enrollment.lastActivity)}</div>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Latest Submission</CardTitle>
              <CardDescription>The most recent valid submission is shown by default.</CardDescription>
            </CardHeader>
            <CardContent>
              {latestSubmission ? (
                <div
                  className="grid gap-4 rounded-md border p-4 md:grid-cols-[1fr_auto] cursor-pointer hover:bg-muted/50"
                  onClick={() => router.push(`/tasks/${taskId}/submissions/${latestSubmission.id}`)}
                >
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge>Latest</Badge>
                      <span className="text-sm text-muted-foreground">
                        Submitted {formatDateTime(latestSubmission.submittedAt)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-sm">
                      <FileText className="h-4 w-4 text-muted-foreground" />
                      <span>{latestSubmission.documentTitle || enrollment.documentTitle || 'Submission Document'}</span>
                    </div>
                    <div className="font-mono text-xs text-muted-foreground">{latestSubmission.id}</div>
                  </div>
                  <div className="flex items-center gap-2">
                    {latestSubmission.certificateVerificationToken ? (
                      <Button
                        asChild
                        variant="outline"
                        size="sm"
                      >
                        <a
                          href={buildCertificateVerifyUrl(latestSubmission.certificateVerificationToken)}
                          onClick={(event) => event.stopPropagation()}
                        >
                          <Award className="h-4 w-4 mr-2" />
                          Certificate
                        </a>
                      </Button>
                    ) : (
                      <Badge variant="secondary">No certificate</Badge>
                    )}
                    <Button variant="default" size="sm">
                      <Eye className="h-4 w-4 mr-2" />
                      Events
                    </Button>
                  </div>
                </div>
              ) : (
                <div className="h-[180px] flex items-center justify-center rounded-md border">
                  <div className="text-center space-y-2">
                    <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
                    <p className="font-medium">No submissions yet</p>
                    <p className="text-sm text-muted-foreground">This user has not submitted a document for this task.</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <CardTitle>Submission History</CardTitle>
                  <CardDescription>Historical submissions remain available for audit.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={fetchEnrollmentAndSubmissions} disabled={isLoading}>
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  Refresh
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {submissions.length === 0 ? (
                <div className="h-[180px] flex items-center justify-center rounded-md border">
                  <div className="text-center space-y-2">
                    <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
                    <p className="font-medium">No submission history</p>
                  </div>
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Submitted</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Document</TableHead>
                        <TableHead>Submission ID</TableHead>
                        <TableHead className="text-right">Certificate</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {submissions.map((submission, index) => (
                        <TableRow
                          key={submission.id}
                          className="cursor-pointer hover:bg-muted/50"
                          onClick={() => router.push(`/tasks/${taskId}/submissions/${submission.id}`)}
                        >
                          <TableCell>{formatDateTime(submission.submittedAt)}</TableCell>
                          <TableCell>
                            <Badge variant={index === 0 || submission.status === 'active' ? 'default' : 'secondary'}>
                              {index === 0 || submission.status === 'active' ? 'Latest' : 'Historical'}
                            </Badge>
                          </TableCell>
                          <TableCell>{submission.documentTitle || enrollment.documentTitle || 'Submission Document'}</TableCell>
                          <TableCell className="font-mono text-xs">{submission.id}</TableCell>
                          <TableCell className="text-right">
                            {submission.certificateVerificationToken ? (
                              <Button
                                asChild
                                variant="ghost"
                                size="sm"
                              >
                                <a
                                  href={buildCertificateVerifyUrl(submission.certificateVerificationToken)}
                                  onClick={(event) => event.stopPropagation()}
                                >
                                  <Award className="h-4 w-4 mr-1" />
                                  View
                                </a>
                              </Button>
                            ) : (
                              <Badge variant="secondary">No certificate</Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </>
      ) : null}
    </div>
  );
}

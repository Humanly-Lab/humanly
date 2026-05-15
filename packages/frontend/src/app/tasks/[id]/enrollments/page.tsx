'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Eye,
  FileText,
  Loader2,
  RefreshCcw,
  Users,
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

export default function TaskEnrollmentsPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;

  const [enrollments, setEnrollments] = useState<TaskEnrollment[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchEnrollments = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get<{
        success: boolean;
        data: {
          enrollments: TaskEnrollment[];
        };
      }>(`/api/v1/tasks/${taskId}/enrollments`);

      setEnrollments(response.data.enrollments);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load enrolled users');
      setEnrollments([]);
    } finally {
      setIsLoading(false);
    }
  }, [taskId]);

  useEffect(() => {
    if (taskId) {
      fetchEnrollments();
    }
  }, [fetchEnrollments, taskId]);

  const formatDateTime = (date: string | null) => {
    if (!date) return 'No activity yet';
    return formatLocalDateTime(date);
  };

  const totalSubmissions = enrollments.reduce((sum, enrollment) => sum + enrollment.submissionCount, 0);

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/tasks/${taskId}`)}
          className="-ml-2 mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Task
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Enrolled Users</h1>
        <p className="text-muted-foreground mt-2">
          Inspect users enrolled in this task and open their submissions.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Enrolled Users</CardTitle>
            <Users className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{enrollments.length.toLocaleString()}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Total Submissions</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{totalSubmissions.toLocaleString()}</div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Current Enrollments</CardTitle>
              <CardDescription>Click a user to view their latest submission and submission history.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchEnrollments} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="h-[300px] flex items-center justify-center">
              <div className="text-center space-y-3">
                <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
                <p className="text-sm text-muted-foreground">Loading enrolled users...</p>
              </div>
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error loading enrollments</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : enrollments.length === 0 ? (
            <div className="h-[240px] flex items-center justify-center rounded-md border">
              <div className="text-center space-y-2">
                <Users className="h-8 w-8 text-muted-foreground mx-auto" />
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
                    <TableHead>Document</TableHead>
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead className="w-[80px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollments.map((enrollment) => (
                    <TableRow
                      key={enrollment.id}
                      className="cursor-pointer"
                      onClick={() => router.push(`/tasks/${taskId}/enrollments/${enrollment.userId}`)}
                    >
                      <TableCell>
                        <div className="space-y-1">
                          <div className="font-medium">{enrollment.email}</div>
                          <div className="font-mono text-xs text-muted-foreground">{enrollment.userId}</div>
                        </div>
                      </TableCell>
                      <TableCell>
                        {enrollment.documentId ? (
                          <div className="flex items-center gap-2">
                            <FileText className="h-4 w-4 text-muted-foreground" />
                            <span>{enrollment.documentTitle || 'Submission Document'}</span>
                          </div>
                        ) : (
                          <Badge variant="secondary">No document yet</Badge>
                        )}
                      </TableCell>
                      <TableCell>{formatDateTime(enrollment.joinedAt)}</TableCell>
                      <TableCell className="text-right font-mono">{enrollment.eventCount}</TableCell>
                      <TableCell>{formatDateTime(enrollment.lastActivity)}</TableCell>
                      <TableCell>
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(event) => {
                            event.stopPropagation();
                            router.push(`/tasks/${taskId}/enrollments/${enrollment.userId}`);
                          }}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
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

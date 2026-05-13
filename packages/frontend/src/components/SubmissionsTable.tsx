'use client';

import { useRouter } from 'next/navigation';
import { Award, FileText, Loader2, RefreshCcw } from 'lucide-react';

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
import { formatDateTime } from '@/lib/utils';

export interface AdminSubmission {
  id: string;
  userId: string;
  userEmail?: string | null;
  documentId: string;
  documentTitle?: string | null;
  certificateId?: string | null;
  certificateVerificationToken?: string | null;
  submittedAt: string;
  status: 'active' | 'historical';
}

interface SubmissionsTableProps {
  taskId: string;
  submissions: AdminSubmission[];
  isLoading?: boolean;
  onRefresh?: () => void;
}

export default function SubmissionsTable({
  taskId,
  submissions,
  isLoading = false,
  onRefresh,
}: SubmissionsTableProps) {
  const router = useRouter();

  return (
    <Card>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>Submissions</CardTitle>
            <CardDescription>
              All submitted documents for users enrolled in this task.
            </CardDescription>
          </div>
          {onRefresh ? (
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <RefreshCcw className="h-4 w-4 mr-2" />
              )}
              Refresh
            </Button>
          ) : null}
        </div>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <div className="h-[260px] flex items-center justify-center">
            <div className="text-center space-y-3">
              <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto" />
              <p className="text-sm text-muted-foreground">Loading submissions...</p>
            </div>
          </div>
        ) : submissions.length === 0 ? (
          <div className="h-[220px] flex items-center justify-center rounded-md border">
            <div className="text-center space-y-2">
              <FileText className="h-8 w-8 text-muted-foreground mx-auto" />
              <p className="font-medium">No submissions yet</p>
              <p className="text-sm text-muted-foreground">
                User submissions will appear here after they submit a task document.
              </p>
            </div>
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Document</TableHead>
                  <TableHead>Submitted</TableHead>
                  <TableHead>Status</TableHead>
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
                    <TableCell>
                      <div className="space-y-1">
                        <div className="font-medium">{submission.userEmail || submission.userId}</div>
                        <div className="font-mono text-xs text-muted-foreground">{submission.userId}</div>
                      </div>
                    </TableCell>
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
                    <TableCell className="text-right">
                      {submission.certificateId ? (
                        <Badge variant="outline" className="inline-flex gap-1">
                          <Award className="h-3 w-3" />
                          Issued
                        </Badge>
                      ) : (
                        <Badge variant="secondary">Missing</Badge>
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
  );
}

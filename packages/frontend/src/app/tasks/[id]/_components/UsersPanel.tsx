'use client';

import {
  AlertCircle,
  FileText,
  Loader2,
  RefreshCcw,
  Users,
} from 'lucide-react';

import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
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
import { formatDateTime } from '@/lib/utils';

import type { TaskEnrollment } from './types';

interface UsersPanelProps {
  enrollments: TaskEnrollment[];
  isLoading: boolean;
  error: string | null;
  onRefresh: () => void;
}

export function UsersPanel({
  enrollments,
  isLoading,
  error,
  onRefresh,
}: UsersPanelProps) {
  const totalSubmissions = enrollments.reduce((sum, enrollment) => sum + enrollment.submissionCount, 0);

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h2 className="text-2xl font-semibold tracking-tight">Enrolled Users</h2>
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
            </div>
            <Button variant="outline" size="sm" onClick={onRefresh} disabled={isLoading}>
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
                    <TableHead>Joined</TableHead>
                    <TableHead className="text-right">Submissions</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead>Last Activity</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {enrollments.map((enrollment) => (
                    <TableRow key={enrollment.id}>
                      <TableCell>
                        <div className="font-medium">{enrollment.email}</div>
                      </TableCell>
                      <TableCell>{formatDateTime(enrollment.joinedAt)}</TableCell>
                      <TableCell className="text-right font-mono">{enrollment.submissionCount}</TableCell>
                      <TableCell className="text-right font-mono">{enrollment.eventCount}</TableCell>
                      <TableCell>
                        {enrollment.lastActivity ? formatDateTime(enrollment.lastActivity) : 'No activity yet'}
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

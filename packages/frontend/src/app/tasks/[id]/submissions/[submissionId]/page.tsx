'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { AlertCircle, ArrowLeft, Clock, FileText, Loader2, RefreshCcw } from 'lucide-react';

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
import { formatDateTime } from '@/lib/utils';

interface Submission {
  id: string;
  documentId: string;
  submittedAt: string;
  status: 'active' | 'historical';
}

interface DocumentEvent {
  id: string;
  eventType: string;
  timestamp: string;
  textBefore?: string | null;
  textAfter?: string | null;
  metadata?: Record<string, unknown> | null;
}

export default function TaskSubmissionEventsPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  const submissionId = params.submissionId as string;

  const [submission, setSubmission] = useState<Submission | null>(null);
  const [events, setEvents] = useState<DocumentEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSubmissionEvents = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const response = await api.get<{
        success: boolean;
        data: {
          submission: Submission;
          events: DocumentEvent[];
          totalEvents: number;
        };
      }>(`/api/v1/tasks/${taskId}/submissions/${submissionId}/events`);

      setSubmission(response.data.submission);
      setEvents(response.data.events);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load submission events');
      setSubmission(null);
      setEvents([]);
    } finally {
      setIsLoading(false);
    }
  }, [submissionId, taskId]);

  useEffect(() => {
    if (taskId && submissionId) {
      fetchSubmissionEvents();
    }
  }, [fetchSubmissionEvents, submissionId, taskId]);

  return (
    <div className="space-y-6">
      <div>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.back()}
          className="-ml-2 mb-2"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back
        </Button>
        <h1 className="text-3xl font-bold tracking-tight">Submission Events</h1>
        <p className="text-muted-foreground mt-2">
          Events are cut off at this submission&apos;s timestamp.
        </p>
      </div>

      {submission && (
        <div className="grid gap-4 md:grid-cols-3">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Submitted</CardTitle>
              <Clock className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-sm font-medium">{formatDateTime(submission.submittedAt)}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Events Before Submit</CardTitle>
              <FileText className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{events.length.toLocaleString()}</div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
              <CardTitle className="text-sm font-medium">Status</CardTitle>
            </CardHeader>
            <CardContent>
              <Badge variant={submission.status === 'active' ? 'default' : 'secondary'}>
                {submission.status === 'active' ? 'Latest' : 'Historical'}
              </Badge>
            </CardContent>
          </Card>
        </div>
      )}

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Event Log</CardTitle>
              <CardDescription>Chronological document events included in this submission snapshot.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={fetchSubmissionEvents} disabled={isLoading}>
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
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Error loading submission events</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : events.length === 0 ? (
            <div className="h-[220px] flex items-center justify-center rounded-md border">
              <p className="text-sm text-muted-foreground">No events recorded before this submission.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Time</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Before</TableHead>
                    <TableHead>After</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {events.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell>{formatDateTime(event.timestamp)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{event.eventType}</Badge>
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                        {event.textBefore || '-'}
                      </TableCell>
                      <TableCell className="max-w-[280px] truncate text-xs text-muted-foreground">
                        {event.textAfter || '-'}
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

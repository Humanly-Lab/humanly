'use client';

import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import {
  AlertCircle,
  ArrowLeft,
  Clock,
  Copy,
  FileText,
  Keyboard,
  Loader2,
  MousePointer,
  RefreshCcw,
  TrendingUp,
  Type,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import api, { ApiError } from '@/lib/api-client';
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
import { formatDateTime } from '@/lib/utils';

interface Submission {
  id: string;
  userEmail?: string | null;
  documentId: string;
  documentTitle?: string | null;
  certificateVerificationToken?: string | null;
  submittedAt: string;
  status: 'active' | 'historical';
}

interface DocumentEvent {
  id: string;
  eventType: string;
  timestamp: string;
  keyCode?: string | null;
  keyChar?: string | null;
  textBefore?: string | null;
  textAfter?: string | null;
  cursorPosition?: number | null;
  metadata?: Record<string, unknown> | null;
}

const EVENT_GROUPS = [
  { label: 'Typing', eventTypes: ['keydown', 'keyup', 'input'] },
  { label: 'Paste', eventTypes: ['paste'] },
  { label: 'Copy', eventTypes: ['copy', 'cut'] },
  { label: 'Focus', eventTypes: ['focus', 'blur'] },
] as const;

const EVENT_ICONS: Record<string, ReactNode> = {
  keydown: <Keyboard className="h-3 w-3" />,
  keyup: <Keyboard className="h-3 w-3" />,
  paste: <Copy className="h-3 w-3" />,
  copy: <Copy className="h-3 w-3" />,
  cut: <Copy className="h-3 w-3" />,
  focus: <MousePointer className="h-3 w-3" />,
  blur: <MousePointer className="h-3 w-3" />,
  input: <Type className="h-3 w-3" />,
};

const EVENT_COLORS: Record<string, string> = {
  keydown: 'bg-blue-100 text-blue-800',
  keyup: 'bg-blue-50 text-blue-600',
  paste: 'bg-yellow-100 text-yellow-800',
  copy: 'bg-orange-100 text-orange-800',
  cut: 'bg-red-100 text-red-800',
  focus: 'bg-green-100 text-green-800',
  blur: 'bg-gray-100 text-gray-600',
  input: 'bg-teal-100 text-teal-800',
};

const formatDuration = (secondsValue: number) => {
  const seconds = Math.max(0, Math.floor(secondsValue || 0));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};

const formatPercent = (value: number) => `${Math.round(value)}%`;

const eventTime = (event: DocumentEvent) => new Date(event.timestamp).getTime();

const calculateTextDeltaMetrics = (events: DocumentEvent[]) => {
  let typedCharacters = 0;
  let pastedCharacters = 0;

  for (const event of events) {
    const beforeLength = event.textBefore?.length || 0;
    const afterLength = event.textAfter?.length || 0;
    const difference = afterLength - beforeLength;

    if (difference <= 0) continue;

    if (event.eventType === 'paste') {
      pastedCharacters += difference;
    } else if (event.eventType === 'keydown' || event.eventType === 'keyup' || event.eventType === 'input') {
      typedCharacters += difference;
    }
  }

  return { typedCharacters, pastedCharacters };
};

const buildActivityTimeline = (events: DocumentEvent[]) => {
  const buckets = events.reduce<Record<string, number>>((groups, event) => {
    const date = new Date(event.timestamp);
    const label = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}`;
    groups[label] = (groups[label] || 0) + 1;
    return groups;
  }, {});

  return Object.entries(buckets).map(([time, eventCount]) => ({ time, eventCount }));
};

const formatEventTime = (timestamp: string) => (
  new Intl.DateTimeFormat(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    fractionalSecondDigits: 3,
  }).format(new Date(timestamp))
);

export default function TaskSubmissionAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const taskId = params.id as string;
  const submissionId = params.submissionId as string;
  const cameFromAnalytics = searchParams.get('from') === 'analytics';
  const cameFromSubmission = searchParams.get('from') === 'submission';

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
      setEvents(response.data.events || []);
    } catch (err) {
      const apiError = err as ApiError;
      setError(apiError.message || 'Failed to load submission analytics');
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

  const sortedEvents = useMemo(() => [...events].sort((a, b) => eventTime(a) - eventTime(b)), [events]);
  const eventLogRows = useMemo(() => [...sortedEvents].reverse(), [sortedEvents]);
  const textMetrics = useMemo(() => calculateTextDeltaMetrics(sortedEvents), [sortedEvents]);
  const activityTimeline = useMemo(() => buildActivityTimeline(sortedEvents), [sortedEvents]);
  const eventCounts = sortedEvents.reduce<Record<string, number>>((counts, event) => {
    counts[event.eventType] = (counts[event.eventType] || 0) + 1;
    return counts;
  }, {});
  const composition = EVENT_GROUPS.map((group) => {
    const count = group.eventTypes.reduce((sum, eventType) => sum + (eventCounts[eventType] || 0), 0);
    const percentage = sortedEvents.length > 0 ? (count / sortedEvents.length) * 100 : 0;
    return { ...group, count, percentage };
  });
  const firstEventAt = sortedEvents[0] ? eventTime(sortedEvents[0]) : null;
  const lastEventAt = sortedEvents[sortedEvents.length - 1] ? eventTime(sortedEvents[sortedEvents.length - 1]) : null;
  const editingDurationSeconds = firstEventAt && lastEventAt
    ? Math.max(0, Math.round((lastEventAt - firstEventAt) / 1000))
    : 0;
  const authoredCharacters = textMetrics.typedCharacters + textMetrics.pastedCharacters;
  const pasteShare = authoredCharacters > 0
    ? (textMetrics.pastedCharacters / authoredCharacters) * 100
    : 0;
  const pasteActivity = pasteShare >= 25 ? 'Paste activity high' : pasteShare >= 10 ? 'Paste activity moderate' : 'Paste activity low';
  const insightText = `${pasteActivity} · Activity captured before submit · ${submission?.status === 'active' ? 'Latest submission' : 'Historical submission'}`;

  const handleBack = () => {
    if (cameFromAnalytics) {
      router.push(`/tasks/${taskId}?tab=analytics`);
      return;
    }
    if (cameFromSubmission) {
      router.push(`/tasks/${taskId}?tab=submission`);
      return;
    }
    router.back();
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleBack}
            className="-ml-2 mb-2"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            {cameFromAnalytics ? 'Back to Analytics' : cameFromSubmission ? 'Back to Submission' : 'Back'}
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Submission Analytics</h1>
          {submission && (
            <p className="mt-2 text-muted-foreground">
              {[submission.userEmail, submission.documentTitle || 'Untitled submission', `Submitted ${formatDateTime(submission.submittedAt)}`]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </div>
        {submission?.certificateVerificationToken && (
          <Button asChild variant="outline">
            <a href={`/verify/${submission.certificateVerificationToken}`}>
              Open Certificate
            </a>
          </Button>
        )}
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading analytics</AlertTitle>
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Events before submit</CardTitle>
            <FileText className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
              <div className="text-2xl font-semibold">{sortedEvents.length.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Editing duration</CardTitle>
            <Clock className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
              <div className="text-2xl font-semibold">{formatDuration(editingDurationSeconds)}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Typed characters</CardTitle>
            <Keyboard className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
              <div className="text-2xl font-semibold">{textMetrics.typedCharacters.toLocaleString()}</div>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium">Paste share</CardTitle>
            <TrendingUp className="h-4 w-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            {isLoading ? <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" /> : (
              <div className="text-2xl font-semibold">{formatPercent(pasteShare)}</div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(320px,0.65fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Writing Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="flex h-[280px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : activityTimeline.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No events recorded before this submission.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={activityTimeline}>
                  <defs>
                    <linearGradient id="submissionActivity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.16} />
                      <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="time"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <YAxis
                    width={36}
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Area
                    type="monotone"
                    dataKey="eventCount"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#submissionActivity)"
                    name="Events"
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Composition</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoading ? (
              <div className="flex h-[280px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : composition.every((item) => item.count === 0) ? (
              <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No event data yet.
              </div>
            ) : (
              composition.map((item) => (
                <div key={item.label} className="space-y-2">
                  <div className="flex items-center justify-between text-sm">
                    <span className="font-medium">{item.label}</span>
                    <span className="text-muted-foreground">{formatPercent(item.percentage)}</span>
                  </div>
                  <div className="h-2 rounded-full bg-muted">
                    <div
                      className="h-2 rounded-full bg-primary"
                      style={{ width: `${Math.min(100, item.percentage)}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      <div className="rounded-md border px-4 py-3 text-sm text-muted-foreground">
        {insightText}
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div>
              <CardTitle>Event Log</CardTitle>
            </div>
            <Button variant="outline" size="sm" onClick={fetchSubmissionEvents} disabled={isLoading}>
              {isLoading ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCcw className="mr-2 h-4 w-4" />
              )}
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="flex h-[300px] items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : sortedEvents.length === 0 ? (
            <div className="flex h-[220px] items-center justify-center rounded-md border border-dashed">
              <p className="text-sm text-muted-foreground">No events recorded before this submission.</p>
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                    <TableRow>
                      <TableHead>Time</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Key / Detail</TableHead>
                      <TableHead>Cursor</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                  {eventLogRows.map((event) => (
                    <TableRow key={event.id}>
                      <TableCell className="font-mono text-xs text-muted-foreground">
                        {formatEventTime(event.timestamp)}
                      </TableCell>
                      <TableCell>
                        <Badge
                          variant="secondary"
                          className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${EVENT_COLORS[event.eventType] ?? 'bg-gray-100 text-gray-700'}`}
                        >
                          {EVENT_ICONS[event.eventType] ?? null}
                          {event.eventType}
                        </Badge>
                      </TableCell>
                      <TableCell className="font-mono text-xs">
                        {event.keyChar ? (
                          <span className="rounded bg-muted px-1">{event.keyChar}</span>
                        ) : event.keyCode ? (
                          <span className="text-muted-foreground">{event.keyCode}</span>
                        ) : (
                          <span className="text-muted-foreground">-</span>
                        )}
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {event.cursorPosition ?? '-'}
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

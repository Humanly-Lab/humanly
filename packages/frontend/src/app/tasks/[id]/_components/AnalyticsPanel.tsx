'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  Clock,
  FileText,
  Gauge,
  HelpCircle,
  Loader2,
  Users,
} from 'lucide-react';
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ComposedChart,
  Legend,
  Line,
  Pie,
  PieChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { AnalyticsSummary, EventTypeDistribution, EventsTimelineDataPoint } from '@humanly/shared';

import api, { ApiError } from '@/lib/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Tooltip as UiTooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ANALYTICS_CHART_COLORS } from '@/lib/analytics-palette';

import type { AdminSubmission, TaskEnrollment } from './types';

export type DateRangePreset = '7days' | '30days' | 'all';

interface ExtendedAnalyticsSummary extends AnalyticsSummary {
  activeUsers24h?: number;
  uniqueUsers?: number;
}

interface AnalyticsPanelProps {
  taskId: string;
  taskStartDate: string | Date;
  taskEndDate?: string | Date | null;
  enrollments: TaskEnrollment[];
  submissions: AdminSubmission[];
  isLoadingEnrollments: boolean;
  isLoadingSubmissions: boolean;
}

const EXPECTED_EDITING_SPAN_SECONDS = 60 * 60;
const MAX_DAILY_SUBMISSION_TIMELINE_DAYS = 120;
const COMPLETION_DIFFICULTY_HELP = 'Calculated from non-submitters, average editing time, and resubmissions; more of any raises difficulty.';

const formatDuration = (secondsValue: number) => {
  const seconds = Math.max(0, Math.floor(secondsValue || 0));
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);

  if (hours > 0) return `${hours}h ${minutes % 60}m`;
  if (minutes > 0) return `${minutes}m`;
  return `${seconds}s`;
};

const formatPercent = (value: number) => `${Math.round(value)}%`;

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

const getDifficultyLabel = (score: number) => {
  if (score < 30) return 'Easy';
  if (score < 60) return 'Moderate';
  if (score < 80) return 'Difficult';
  return 'Very difficult';
};

const toValidDate = (value: string | Date | null | undefined, fallback: Date) => {
  if (!value) return fallback;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? fallback : date;
};

const toOptionalDate = (value: string | Date | null | undefined) => {
  if (!value) return null;
  const date = value instanceof Date ? new Date(value) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};

const startOfLocalDay = (date: Date) => new Date(date.getFullYear(), date.getMonth(), date.getDate());

const addDays = (date: Date, days: number) => {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
};

const getLocalDateKey = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const parseLocalDateKey = (dateKey: string) => {
  const [year, month, day] = dateKey.split('-').map(Number);
  return new Date(year, month - 1, day);
};

const formatDateKey = (dateKey: string) => (
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric' }).format(parseLocalDateKey(dateKey))
);

export const getAnalyticsDateRange = ({
  preset,
  taskStartDate,
  taskEndDate,
  now = new Date(),
}: {
  preset: DateRangePreset;
  taskStartDate: string | Date;
  taskEndDate?: string | Date | null;
  now?: Date;
}) => {
  const endDate = new Date(now);

  if (preset === 'all') {
    const startDate = toValidDate(taskStartDate, new Date(0));
    const configuredEndDate = toValidDate(taskEndDate, endDate);
    const boundedEndDate = configuredEndDate.getTime() < endDate.getTime() ? configuredEndDate : endDate;
    const finalEndDate = boundedEndDate.getTime() < startDate.getTime() ? startDate : boundedEndDate;

    return {
      startDate: startDate.toISOString(),
      endDate: finalEndDate.toISOString(),
    };
  }

  const startDate = new Date(endDate);
  startDate.setDate(endDate.getDate() - (preset === '7days' ? 7 : 30));

  return {
    startDate: startDate.toISOString(),
    endDate: endDate.toISOString(),
  };
};

export function AnalyticsPanel({
  taskId,
  taskStartDate,
  taskEndDate,
  enrollments,
  submissions,
  isLoadingEnrollments,
  isLoadingSubmissions,
}: AnalyticsPanelProps) {
  const [summary, setSummary] = useState<ExtendedAnalyticsSummary | null>(null);
  const [eventsTimeline, setEventsTimeline] = useState<EventsTimelineDataPoint[]>([]);
  const [eventTypeDistribution, setEventTypeDistribution] = useState<EventTypeDistribution[]>([]);
  const [dateRange, setDateRange] = useState<DateRangePreset>('30days');
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(true);
  const [isLoadingDistribution, setIsLoadingDistribution] = useState(true);
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [distributionError, setDistributionError] = useState<string | null>(null);

  const getDateRange = useCallback(() => {
    return getAnalyticsDateRange({
      preset: dateRange,
      taskStartDate,
      taskEndDate,
    });
  }, [dateRange, taskEndDate, taskStartDate]);

  const fetchSummary = useCallback(async () => {
    try {
      setIsLoadingSummary(true);
      setSummaryError(null);
      const { startDate, endDate } = getDateRange();
      const response = await api.get<{
        success: boolean;
        data: ExtendedAnalyticsSummary;
      }>(`/api/v1/tasks/${taskId}/analytics/summary`, {
        params: { startDate, endDate },
      });
      setSummary(response.data);
    } catch (err) {
      const apiError = err as ApiError;
      setSummaryError(apiError.message || 'Failed to load analytics summary');
      setSummary({
        totalEvents: 0,
        totalSessions: 0,
        uniqueUsers: 0,
        totalUsers: 0,
        avgEventsPerSession: 0,
        avgSessionDuration: 0,
        completionRate: 0,
        activeUsers24h: 0,
      });
    } finally {
      setIsLoadingSummary(false);
    }
  }, [getDateRange, taskId]);

  const fetchEventsTimeline = useCallback(async () => {
    try {
      setIsLoadingTimeline(true);
      setTimelineError(null);
      const { startDate, endDate } = getDateRange();
      const response = await api.get<{
        success: boolean;
        data: {
          timeline: EventsTimelineDataPoint[];
        };
      }>(`/api/v1/tasks/${taskId}/analytics/events-timeline`, {
        params: { startDate, endDate, groupBy: 'day' },
      });
      setEventsTimeline(response.data.timeline || []);
    } catch (err) {
      const apiError = err as ApiError;
      setTimelineError(apiError.message || 'Failed to load activity');
      setEventsTimeline([]);
    } finally {
      setIsLoadingTimeline(false);
    }
  }, [getDateRange, taskId]);

  const fetchEventTypeDistribution = useCallback(async () => {
    try {
      setIsLoadingDistribution(true);
      setDistributionError(null);
      const { startDate, endDate } = getDateRange();
      const response = await api.get<{
        success: boolean;
        data: {
          eventTypes: EventTypeDistribution[];
        };
      }>(`/api/v1/tasks/${taskId}/analytics/event-types`, {
        params: { startDate, endDate },
      });
      setEventTypeDistribution(response.data.eventTypes || []);
    } catch (err) {
      const apiError = err as ApiError;
      setDistributionError(apiError.message || 'Failed to load event composition');
      setEventTypeDistribution([]);
    } finally {
      setIsLoadingDistribution(false);
    }
  }, [getDateRange, taskId]);

  useEffect(() => {
    if (!taskId) return;
    fetchSummary();
    fetchEventsTimeline();
    fetchEventTypeDistribution();
  }, [fetchEventTypeDistribution, fetchEventsTimeline, fetchSummary, taskId]);

  const totalEventTypeCount = eventTypeDistribution.reduce((sum, item) => sum + item.count, 0);
  const eventTypeChartData = useMemo(() => (
    [...eventTypeDistribution]
      .filter((item) => item.count > 0)
      .sort((left, right) => right.count - left.count)
      .map((item, index) => ({
        ...item,
        percentage: totalEventTypeCount > 0 ? (item.count / totalEventTypeCount) * 100 : 0,
        color: ANALYTICS_CHART_COLORS.eventTypes[index % ANALYTICS_CHART_COLORS.eventTypes.length],
      }))
  ), [eventTypeDistribution, totalEventTypeCount]);
  const totalSubmissions = submissions.length;
  const submissionsByUser = submissions.reduce<Record<string, number>>((counts, submission) => {
    counts[submission.userId] = (counts[submission.userId] || 0) + 1;
    return counts;
  }, {});
  const submittedUserCount = enrollments.filter((enrollment) => (
    (enrollment.submissionCount || 0) > 0 || (submissionsByUser[enrollment.userId] || 0) > 0
  )).length;
  const noSubmissionCount = Math.max(0, enrollments.length - submittedUserCount);
  const multipleSubmitterCount = enrollments.filter((enrollment) => (
    Math.max(enrollment.submissionCount || 0, submissionsByUser[enrollment.userId] || 0) > 1
  )).length;
  const completionRate = enrollments.length > 0 ? submittedUserCount / enrollments.length : 0;
  const noSubmissionPressure = enrollments.length > 0 ? noSubmissionCount / enrollments.length : 0;
  const resubmissionRate = submittedUserCount > 0 ? multipleSubmitterCount / submittedUserCount : 0;
  const editingSpanSeconds = summary?.avgSessionDuration || 0;
  const timePressure = clamp01((editingSpanSeconds / EXPECTED_EDITING_SPAN_SECONDS - 0.75) / 1.25);
  const difficultyScore = enrollments.length > 0
    ? Math.round(100 * (
      0.55 * noSubmissionPressure +
      0.30 * timePressure +
      0.15 * clamp01(resubmissionRate)
    ))
    : null;
  const difficultyLabel = difficultyScore === null ? 'No data' : getDifficultyLabel(difficultyScore);

  const submissionTimeline = useMemo(() => {
    const datedSubmissions = submissions
      .map((submission) => {
        const submittedAt = toOptionalDate(submission.submittedAt);
        return submittedAt ? { submission, submittedAt } : null;
      })
      .filter((item): item is { submission: AdminSubmission; submittedAt: Date } => item !== null)
      .sort((left, right) => left.submittedAt.getTime() - right.submittedAt.getTime());

    if (datedSubmissions.length === 0) return [];

    const dailySubmissions = new Map<string, number>();
    const firstSubmissionByUser = new Map<string, Date>();

    datedSubmissions.forEach(({ submission, submittedAt }) => {
      const dateKey = getLocalDateKey(submittedAt);
      dailySubmissions.set(dateKey, (dailySubmissions.get(dateKey) || 0) + 1);

      const currentFirstSubmission = firstSubmissionByUser.get(submission.userId);
      if (!currentFirstSubmission || submittedAt.getTime() < currentFirstSubmission.getTime()) {
        firstSubmissionByUser.set(submission.userId, submittedAt);
      }
    });

    const firstSubmissionKeys = Array.from(firstSubmissionByUser.values())
      .map((submittedAt) => getLocalDateKey(submittedAt))
      .sort();
    const firstSubmissionDate = datedSubmissions[0].submittedAt;
    const lastSubmissionDate = datedSubmissions[datedSubmissions.length - 1].submittedAt;
    const configuredStartDate = toOptionalDate(taskStartDate);
    const configuredEndDate = toOptionalDate(taskEndDate);
    const startDate = startOfLocalDay(new Date(Math.min(
      configuredStartDate?.getTime() ?? firstSubmissionDate.getTime(),
      firstSubmissionDate.getTime()
    )));
    const endDate = startOfLocalDay(new Date(Math.max(
      configuredEndDate?.getTime() ?? lastSubmissionDate.getTime(),
      lastSubmissionDate.getTime()
    )));
    const daySpan = Math.max(0, Math.round((endDate.getTime() - startDate.getTime()) / 86_400_000));
    const timelineKeys = new Set<string>();

    if (daySpan <= MAX_DAILY_SUBMISSION_TIMELINE_DAYS) {
      for (let offset = 0; offset <= daySpan; offset += 1) {
        timelineKeys.add(getLocalDateKey(addDays(startDate, offset)));
      }
    } else {
      timelineKeys.add(getLocalDateKey(startDate));
      timelineKeys.add(getLocalDateKey(endDate));
      dailySubmissions.forEach((_, dateKey) => timelineKeys.add(dateKey));
      firstSubmissionKeys.forEach((dateKey) => timelineKeys.add(dateKey));
      if (configuredEndDate) timelineKeys.add(getLocalDateKey(configuredEndDate));
    }

    const sortedTimelineKeys = Array.from(timelineKeys).sort();
    let cumulativeSubmittedUsers = 0;
    let firstSubmissionIndex = 0;

    return sortedTimelineKeys.map((dateKey) => {
      while (
        firstSubmissionIndex < firstSubmissionKeys.length &&
        firstSubmissionKeys[firstSubmissionIndex] <= dateKey
      ) {
        cumulativeSubmittedUsers += 1;
        firstSubmissionIndex += 1;
      }

      return {
        dateKey,
        submissions: dailySubmissions.get(dateKey) || 0,
        cumulativeSubmittedUsers,
      };
    });
  }, [submissions, taskEndDate, taskStartDate]);

  const submissionDeadlineKey = useMemo(() => {
    const deadline = toOptionalDate(taskEndDate);
    return deadline ? getLocalDateKey(deadline) : null;
  }, [taskEndDate]);

  const metrics = [
    {
      title: 'Submitted users',
      value: `${submittedUserCount.toLocaleString()} / ${enrollments.length.toLocaleString()}`,
      icon: Users,
      isLoading: isLoadingEnrollments || isLoadingSubmissions,
    },
    {
      title: 'Total submissions',
      value: totalSubmissions.toLocaleString(),
      icon: FileText,
      isLoading: isLoadingSubmissions,
    },
    {
      title: 'Avg editing time',
      value: formatDuration(editingSpanSeconds),
      icon: Clock,
      isLoading: isLoadingSummary,
    },
    {
      title: 'Completion Difficulty',
      value: difficultyLabel,
      detail: difficultyScore === null
        ? 'Needs enrolled users'
        : `${difficultyScore}/100 · ${formatPercent(completionRate * 100)} completed`,
      helpText: COMPLETION_DIFFICULTY_HELP,
      icon: Gauge,
      isLoading: isLoadingEnrollments || isLoadingSubmissions || isLoadingSummary,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-semibold tracking-tight">Analytics</h2>
        <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRangePreset)}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder="Select date range" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7days">Last 7 days</SelectItem>
            <SelectItem value="30days">Last 30 days</SelectItem>
            <SelectItem value="all">All time</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <Card key={metric.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">
                  {'helpText' in metric && metric.helpText ? (
                    <TooltipProvider delayDuration={0}>
                      <UiTooltip>
                        <TooltipTrigger asChild>
                          <button
                            type="button"
                            className="inline-flex items-center gap-1.5 rounded-sm text-left outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          >
                            <span>{metric.title}</span>
                            <HelpCircle className="h-3.5 w-3.5 text-muted-foreground" aria-hidden="true" />
                          </button>
                        </TooltipTrigger>
                        <TooltipContent className="max-w-[260px] text-xs">
                          {metric.helpText}
                        </TooltipContent>
                      </UiTooltip>
                    </TooltipProvider>
                  ) : (
                    metric.title
                  )}
                </CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {metric.isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <div className="space-y-1">
                    <div className="text-2xl font-semibold">{metric.value}</div>
                    {'detail' in metric && metric.detail ? (
                      <div className="text-xs text-muted-foreground">{metric.detail}</div>
                    ) : null}
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {(summaryError || timelineError || distributionError) && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Some analytics could not load</AlertTitle>
          <AlertDescription>
            {[summaryError, timelineError, distributionError].filter(Boolean).join(' ')}
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Submission Timeline</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingSubmissions ? (
              <div className="flex h-[280px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : submissionTimeline.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No submissions yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={submissionTimeline} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="dateKey"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickFormatter={formatDateKey}
                    tickLine={false}
                    axisLine={false}
                    minTickGap={24}
                  />
                  <YAxis
                    width={36}
                    allowDecimals={false}
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
                    labelFormatter={(label) => formatDateKey(String(label))}
                  />
                  <Legend iconType="circle" wrapperStyle={{ fontSize: 12 }} />
                  {submissionDeadlineKey ? (
                    <ReferenceLine
                      x={submissionDeadlineKey}
                      stroke={ANALYTICS_CHART_COLORS.reference}
                      strokeDasharray="4 4"
                      label={{
                        value: 'Deadline',
                        position: 'insideTopRight',
                        fill: ANALYTICS_CHART_COLORS.reference,
                        fontSize: 12,
                      }}
                    />
                  ) : null}
                  <Bar
                    dataKey="submissions"
                    name="Submissions"
                    fill={ANALYTICS_CHART_COLORS.submissions}
                    radius={[4, 4, 0, 0]}
                  />
                  <Line
                    type="monotone"
                    dataKey="cumulativeSubmittedUsers"
                    name="Submitted users"
                    stroke={ANALYTICS_CHART_COLORS.submittedUsers}
                    strokeWidth={2}
                    dot={{
                      r: 3,
                      fill: 'hsl(var(--card))',
                      stroke: ANALYTICS_CHART_COLORS.submittedUsers,
                      strokeWidth: 2,
                    }}
                    activeDot={{ r: 5, strokeWidth: 2 }}
                  />
                </ComposedChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Activity</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingTimeline ? (
              <div className="flex h-[280px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : eventsTimeline.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No activity yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <AreaChart data={eventsTimeline}>
                  <defs>
                    <linearGradient id="analyticsActivity" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={ANALYTICS_CHART_COLORS.activityFill} stopOpacity={0.14} />
                      <stop offset="95%" stopColor={ANALYTICS_CHART_COLORS.activityFill} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <XAxis
                    dataKey="date"
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
                    stroke={ANALYTICS_CHART_COLORS.activity}
                    strokeWidth={2}
                    fill="url(#analyticsActivity)"
                    name="Events"
                    dot={{
                      r: 3,
                      fill: 'hsl(var(--card))',
                      stroke: ANALYTICS_CHART_COLORS.activity,
                      strokeWidth: 2,
                    }}
                    activeDot={{ r: 5, strokeWidth: 2 }}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.25fr)_minmax(320px,0.75fr)]">
        <Card>
          <CardHeader>
            <CardTitle>Event Type Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoadingDistribution ? (
              <div className="flex h-[280px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : eventTypeChartData.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No event data yet.
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={280}>
                <BarChart data={eventTypeChartData} margin={{ top: 8, right: 16, left: 0, bottom: 8 }}>
                  <CartesianGrid vertical={false} stroke="hsl(var(--border))" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="eventType"
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                    tickLine={false}
                    axisLine={false}
                    interval={0}
                    minTickGap={12}
                  />
                  <YAxis
                    width={36}
                    allowDecimals={false}
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
                    formatter={(value: number, name: string) => [
                      `${Number(value).toLocaleString()} events`,
                      name,
                    ]}
                  />
                  <Bar dataKey="count" name="Events" radius={[4, 4, 0, 0]}>
                    {eventTypeChartData.map((item) => (
                      <Cell key={item.eventType} fill={item.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Event Type Percentage</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {isLoadingDistribution ? (
              <div className="flex h-[280px] items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : eventTypeChartData.length === 0 ? (
              <div className="flex h-[280px] items-center justify-center rounded-md border border-dashed text-sm text-muted-foreground">
                No event data yet.
              </div>
            ) : (
              <>
                <div className="relative h-[190px]">
                  <div className="flex h-full items-center justify-center">
                    <PieChart width={260} height={190}>
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'hsl(var(--card))',
                          border: '1px solid hsl(var(--border))',
                          borderRadius: '6px',
                        }}
                        formatter={(value: number, name: string) => [
                          `${Number(value).toLocaleString()} events`,
                          name,
                        ]}
                      />
                      <Pie
                        data={eventTypeChartData}
                        dataKey="count"
                        nameKey="eventType"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={78}
                        paddingAngle={2}
                        stroke="hsl(var(--card))"
                        strokeWidth={3}
                      >
                        {eventTypeChartData.map((item) => (
                          <Cell key={item.eventType} fill={item.color} />
                        ))}
                      </Pie>
                    </PieChart>
                  </div>
                  <div
                    className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
                    data-testid="event-type-total-events"
                  >
                    <span className="text-2xl font-semibold">{totalEventTypeCount.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">events</span>
                  </div>
                </div>
                <div className="space-y-3">
                  {eventTypeChartData.map((item) => (
                    <div key={item.eventType} className="flex items-center justify-between gap-3 text-sm">
                      <div className="flex min-w-0 items-center gap-2">
                        <span
                          className="h-2.5 w-2.5 shrink-0 rounded-full"
                          style={{ backgroundColor: item.color }}
                        />
                        <span className="truncate font-medium">{item.eventType}</span>
                      </div>
                      <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
                        <span>{item.count.toLocaleString()}</span>
                        <span>{formatPercent(item.percentage)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

    </div>
  );
}

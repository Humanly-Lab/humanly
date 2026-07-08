'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  AlertCircle,
  ChevronRight,
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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

import type { AdminSubmission } from './types';

export type DateRangePreset = '7days' | '30days' | 'all';

interface ExtendedAnalyticsSummary extends AnalyticsSummary {
  activeUsers24h?: number;
  uniqueUsers?: number;
}

interface AnalyticsPanelProps {
  taskId: string;
  taskStartDate: string | Date;
  taskEndDate?: string | Date | null;
  submissions: AdminSubmission[];
  submissionTotal: number;
  isLoadingSubmissions: boolean;
}

const EXPECTED_EDITING_SPAN_SECONDS = 60 * 60;
const MAX_DAILY_SUBMISSION_TIMELINE_DAYS = 120;
const COMPLETION_DIFFICULTY_HELP = 'Estimated from completion rate, average editing time, and repeated submissions; higher values suggest more review attention.';
const EVENT_TYPE_VISIBLE_LIMIT = 6;
const OTHER_EVENT_TYPE = '__other_event_types__';
const OTHER_EVENT_TYPE_COLOR = 'var(--hly-neutral-text)';

interface EventTypeChartItem extends Omit<EventTypeDistribution, 'eventType'> {
  eventType: string;
  eventTypeLabel: string;
  percentage: number;
  color: string;
  isOther?: boolean;
}

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

const capitalizeFirst = (value: string) => {
  if (!value) return value;
  return value.charAt(0).toUpperCase() + value.slice(1);
};

export const getShareBarWidth = (percentage: number) => {
  if (percentage <= 0) return '0%';
  return `${Math.max(4, Math.min(100, percentage))}%`;
};

export const getEventTypeDisplayLabel = (eventType: string) => {
  if (eventType === 'page_hidden') return 'Left workspace';
  if (eventType === 'page_visible') return 'Returned';
  if (eventType === 'ai_query_sent') return 'AI question';
  if (eventType === 'ai_response_received') return 'AI response';
  if (eventType === 'ai_insert_from_chat') return 'AI inserted';
  if (eventType === 'ai_selection_action') return 'AI quick action';
  if (eventType === 'ai_panel_open') return 'AI panel opened';
  if (eventType === 'ai_panel_close') return 'AI panel closed';
  if (eventType === 'ai_policy_refusal') return 'AI refusal';
  if (eventType === 'blocked_copy_paste_attempt') return 'Blocked copy-paste';
  if (!eventType.includes('_') && !eventType.includes('-')) return capitalizeFirst(eventType);

  return eventType
    .split(/[_-]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const buildEventTypeChartData = (
  eventTypeDistribution: EventTypeDistribution[],
  visibleLimit = EVENT_TYPE_VISIBLE_LIMIT
) => {
  const totalEventTypeCount = eventTypeDistribution.reduce((sum, item) => sum + item.count, 0);
  const sortedEventTypes: EventTypeChartItem[] = [...eventTypeDistribution]
    .filter((item) => item.count > 0)
    .sort((left, right) => right.count - left.count)
    .map((item, index) => ({
      ...item,
      eventTypeLabel: getEventTypeDisplayLabel(item.eventType),
      percentage: totalEventTypeCount > 0 ? (item.count / totalEventTypeCount) * 100 : 0,
      color: ANALYTICS_CHART_COLORS.eventTypes[index % ANALYTICS_CHART_COLORS.eventTypes.length],
    }));

  if (sortedEventTypes.length <= visibleLimit) {
    return {
      eventTypeChartData: sortedEventTypes,
      foldedEventTypeChartData: [],
      totalEventTypeCount,
    };
  }

  const visibleEventTypes = sortedEventTypes.slice(0, visibleLimit);
  const foldedEventTypes = sortedEventTypes.slice(visibleLimit);
  const foldedEventCount = foldedEventTypes.reduce((sum, item) => sum + item.count, 0);
  const otherEventType: EventTypeChartItem = {
    eventType: OTHER_EVENT_TYPE,
    eventTypeLabel: 'Other',
    count: foldedEventCount,
    percentage: totalEventTypeCount > 0 ? (foldedEventCount / totalEventTypeCount) * 100 : 0,
    color: OTHER_EVENT_TYPE_COLOR,
    isOther: true,
  };

  return {
    eventTypeChartData: [...visibleEventTypes, otherEventType],
    foldedEventTypeChartData: foldedEventTypes,
    totalEventTypeCount,
  };
};

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
  submissions,
  submissionTotal,
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
  const [isOtherEventTypesOpen, setIsOtherEventTypesOpen] = useState(false);

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

  const {
    eventTypeChartData,
    foldedEventTypeChartData,
    totalEventTypeCount,
  } = useMemo(() => buildEventTypeChartData(eventTypeDistribution), [eventTypeDistribution]);
  const openOtherEventTypes = useCallback(() => {
    if (foldedEventTypeChartData.length === 0) return;
    setIsOtherEventTypesOpen(true);
  }, [foldedEventTypeChartData.length]);
  const totalSubmissions = submissionTotal;
  const submissionsByUser = submissions.reduce<Record<string, number>>((counts, submission) => {
    counts[submission.userId] = (counts[submission.userId] || 0) + 1;
    return counts;
  }, {});
  const submittedUserCount = Math.max(
    Object.keys(submissionsByUser).length,
    summary?.uniqueUsers || 0
  );
  const activeWriterCount = summary?.totalUsers || submittedUserCount;
  const multipleSubmitterCount = Object.values(submissionsByUser).filter((count) => count > 1).length;
  const completionRate = clamp01((summary?.completionRate || 0) / 100);
  const noSubmissionPressure = summary ? clamp01(1 - completionRate) : 0;
  const resubmissionRate = submittedUserCount > 0 ? multipleSubmitterCount / submittedUserCount : 0;
  const editingSpanSeconds = summary?.avgSessionDuration || 0;
  const timePressure = clamp01((editingSpanSeconds / EXPECTED_EDITING_SPAN_SECONDS - 0.75) / 1.25);
  const difficultyScore = summary
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
      value: activeWriterCount > 0
        ? `${submittedUserCount.toLocaleString()} / ${activeWriterCount.toLocaleString()}`
        : submittedUserCount.toLocaleString(),
      icon: Users,
      isLoading: isLoadingSummary || isLoadingSubmissions,
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
        ? 'Needs analytics data'
        : `${difficultyScore}/100 · ${formatPercent(completionRate * 100)} completed`,
      helpText: COMPLETION_DIFFICULTY_HELP,
      icon: Gauge,
      isLoading: isLoadingSummary,
    },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <h2 className="text-2xl font-medium tracking-normal">Analytics</h2>
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
                    <div className="text-2xl font-medium">{metric.value}</div>
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
              <div className="space-y-4">
                <div className="grid grid-cols-[minmax(130px,1fr)_88px_minmax(180px,1.5fr)] gap-x-4 px-1 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  <span>Event</span>
                  <span className="text-right">Count</span>
                  <span className="text-right">Share</span>
                </div>
                <div className="space-y-4">
                  {eventTypeChartData.map((item) => {
                    const barWidth = getShareBarWidth(item.percentage);
                    const row = (
                      <div className="grid w-full grid-cols-[minmax(130px,1fr)_88px_minmax(180px,1.5fr)] items-center gap-x-4">
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span
                            className={
                              item.isOther
                                ? 'truncate text-sm font-medium underline decoration-border underline-offset-4'
                                : 'truncate text-sm font-medium'
                            }
                          >
                            {item.eventTypeLabel}
                          </span>
                        </div>
                        <div className="whitespace-nowrap text-right text-sm tabular-nums text-muted-foreground">
                          {item.count.toLocaleString()}
                        </div>
                        <div className="min-w-0">
                          <div className="mb-1 text-right text-sm tabular-nums text-muted-foreground">
                            {formatPercent(item.percentage)}
                          </div>
                          <div className="h-2 rounded-full bg-muted">
                            <div
                              className="h-2 rounded-full"
                              style={{ width: barWidth, backgroundColor: item.color }}
                            />
                          </div>
                        </div>
                      </div>
                    );

                    if (item.isOther) {
                      return (
                        <button
                          key={item.eventType}
                          type="button"
                          className="block w-full rounded-md px-1 py-1 text-left transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={openOtherEventTypes}
                        >
                          {row}
                        </button>
                      );
                    }

                    return (
                      <div key={item.eventType} className="px-1 py-1">
                        {row}
                      </div>
                    );
                  })}
                </div>
              </div>
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
                        nameKey="eventTypeLabel"
                        cx="50%"
                        cy="50%"
                        innerRadius={58}
                        outerRadius={78}
                        paddingAngle={2}
                        stroke="hsl(var(--card))"
                        strokeWidth={3}
                        isAnimationActive={false}
                        onClick={(item) => {
                          const payload = item as EventTypeChartItem | undefined;
                          if (payload?.isOther) openOtherEventTypes();
                        }}
                      >
                        {eventTypeChartData.map((item) => (
                          <Cell
                            key={item.eventType}
                            fill={item.color}
                            cursor={item.isOther ? 'pointer' : undefined}
                          />
                        ))}
                      </Pie>
                    </PieChart>
                  </div>
                  <div
                    className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center"
                    data-testid="event-type-total-events"
                  >
                    <span className="text-2xl font-medium">{totalEventTypeCount.toLocaleString()}</span>
                    <span className="text-xs text-muted-foreground">events</span>
                  </div>
                </div>
                <div className="space-y-3">
                  <div className="grid grid-cols-[minmax(0,1fr)_72px_56px] gap-3 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                    <span>Event</span>
                    <span className="text-right">Count</span>
                    <span className="text-right">Share</span>
                  </div>
                  {eventTypeChartData.map((item) => {
                    const rowContent = (
                      <>
                        <div className="flex min-w-0 items-center gap-2">
                          <span
                            className="h-2.5 w-2.5 shrink-0 rounded-full"
                            style={{ backgroundColor: item.color }}
                          />
                          <span className={item.isOther ? 'inline-flex min-w-0 items-center font-medium underline decoration-border underline-offset-4' : 'truncate font-medium'}>
                            <span className="truncate">{item.eventTypeLabel}</span>
                            {item.isOther ? <ChevronRight className="ml-1 h-3 w-3 shrink-0" /> : null}
                          </span>
                        </div>
                        <span className="text-right tabular-nums text-muted-foreground">{item.count.toLocaleString()}</span>
                        <span className="text-right tabular-nums text-muted-foreground">{formatPercent(item.percentage)}</span>
                      </>
                    );

                    if (item.isOther) {
                      return (
                        <button
                          key={item.eventType}
                          type="button"
                          className="grid w-full grid-cols-[minmax(0,1fr)_72px_56px] gap-3 rounded-md text-left text-sm transition-colors hover:bg-muted/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                          onClick={openOtherEventTypes}
                        >
                          {rowContent}
                        </button>
                      );
                    }

                    return (
                      <div key={item.eventType} className="grid grid-cols-[minmax(0,1fr)_72px_56px] gap-3 text-sm">
                        {rowContent}
                      </div>
                    );
                  })}
                </div>
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <Dialog open={isOtherEventTypesOpen} onOpenChange={setIsOtherEventTypesOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Other event types</DialogTitle>
            <DialogDescription>
              Event types folded out of the Top 6 chart view.
            </DialogDescription>
          </DialogHeader>
          <div className="max-h-[420px] overflow-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="sticky top-0 bg-background text-xs uppercase tracking-wide text-muted-foreground">
                <tr className="border-b">
                  <th className="px-4 py-3 text-left font-medium">Event</th>
                  <th className="px-4 py-3 text-left font-medium">Raw type</th>
                  <th className="px-4 py-3 text-right font-medium">Count</th>
                  <th className="px-4 py-3 text-right font-medium">Share</th>
                </tr>
              </thead>
              <tbody>
                {foldedEventTypeChartData.map((item) => (
                  <tr key={item.eventType} className="border-b last:border-b-0">
                    <td className="px-4 py-3 font-medium">{item.eventTypeLabel}</td>
                    <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{item.eventType}</td>
                    <td className="px-4 py-3 text-right">{item.count.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right text-muted-foreground">
                      {formatPercent(item.percentage)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </DialogContent>
      </Dialog>

    </div>
  );
}

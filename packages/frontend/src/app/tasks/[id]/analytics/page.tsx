'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import {
  Activity,
  ArrowLeft,
  BarChart3,
  Users,
  Clock,
  TrendingUp,
  AlertCircle,
  Loader2,
  RefreshCcw,
} from 'lucide-react';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { AnalyticsSummary, EventTypeDistribution, EventsTimelineDataPoint, Task } from '@humanly/shared';
import api, { ApiError } from '@/lib/api-client';
import { formatDateTime } from '@/lib/utils';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

// Extended Analytics Summary with active users
interface ExtendedAnalyticsSummary extends AnalyticsSummary {
  activeUsers24h?: number;
  uniqueUsers?: number;
}

// User Activity for table
interface UserActivity {
  externalUserId: string;
  sessionCount: number;
  eventCount: number;
  lastActive: string | Date;
  avgDuration: number;
}

interface UserActivityResponse {
  users: UserActivity[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

// Date range presets
type DateRangePreset = '7days' | '30days' | '90days' | 'custom';

// Group by options
type GroupBy = 'hour' | 'day' | 'week';

export default function AnalyticsPage() {
  const params = useParams();
  const taskId = params.id as string;

  // State for analytics data
  const [summary, setSummary] = useState<ExtendedAnalyticsSummary | null>(null);
  const [eventsTimeline, setEventsTimeline] = useState<EventsTimelineDataPoint[]>([]);
  const [eventTypeDistribution, setEventTypeDistribution] = useState<EventTypeDistribution[]>([]);
  const [userActivity, setUserActivity] = useState<UserActivity[]>([]);
  const [totalUsers, setTotalUsers] = useState(0);
  const [enrolledUserCount, setEnrolledUserCount] = useState(0);

  // State for filters
  const [dateRange, setDateRange] = useState<DateRangePreset>('30days');
  const [groupBy, setGroupBy] = useState<GroupBy>('day');
  const [currentPage, setCurrentPage] = useState(1);
  const usersPerPage = 10;

  // Loading states
  const [isLoadingSummary, setIsLoadingSummary] = useState(true);
  const [isLoadingTimeline, setIsLoadingTimeline] = useState(true);
  const [isLoadingDistribution, setIsLoadingDistribution] = useState(true);
  const [isLoadingUsers, setIsLoadingUsers] = useState(true);

  // Error states
  const [summaryError, setSummaryError] = useState<string | null>(null);
  const [timelineError, setTimelineError] = useState<string | null>(null);
  const [distributionError, setDistributionError] = useState<string | null>(null);
  const [usersError, setUsersError] = useState<string | null>(null);

  // Calculate date range
  const getDateRange = useCallback(() => {
    const endDate = new Date();
    const startDate = new Date();

    switch (dateRange) {
      case '7days':
        startDate.setDate(endDate.getDate() - 7);
        break;
      case '30days':
        startDate.setDate(endDate.getDate() - 30);
        break;
      case '90days':
        startDate.setDate(endDate.getDate() - 90);
        break;
      default:
        startDate.setDate(endDate.getDate() - 30);
    }

    return {
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
    };
  }, [dateRange]);

  const fetchTask = useCallback(async () => {
    try {
      const response = await api.get<{
        success: boolean;
        data: Task;
      }>(`/api/v1/tasks/${taskId}`);
      setEnrolledUserCount(response.data.enrolledUserCount ?? 0);
    } catch (err) {
      console.error('Failed to load task enrollment count:', err);
      setEnrolledUserCount(0);
    }
  }, [taskId]);

  // Fetch summary statistics
  const fetchSummary = useCallback(async () => {
    try {
      setIsLoadingSummary(true);
      setSummaryError(null);
      const { startDate, endDate } = getDateRange();
      const response = await api.get<{
        success: boolean;
        data: ExtendedAnalyticsSummary;
      }>(`/api/v1/tasks/${taskId}/analytics/summary`, {
        params: {
          startDate,
          endDate,
        },
      });
      setSummary(response.data);
    } catch (err) {
      const apiError = err as ApiError;
      setSummaryError(apiError.message || 'Failed to load summary statistics');
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

  // Fetch events timeline
  const fetchEventsTimeline = useCallback(async () => {
    try {
      setIsLoadingTimeline(true);
      setTimelineError(null);
      const { startDate, endDate } = getDateRange();
      const response = await api.get<{
        success: boolean;
        data: {
          groupBy: string;
          timeline: EventsTimelineDataPoint[];
        };
      }>(`/api/v1/tasks/${taskId}/analytics/events-timeline`, {
        params: {
          startDate,
          endDate,
          groupBy,
        },
      });
      setEventsTimeline(response.data.timeline || []);
    } catch (err) {
      const apiError = err as ApiError;
      setTimelineError(apiError.message || 'Failed to load events timeline');
      setEventsTimeline([]);
    } finally {
      setIsLoadingTimeline(false);
    }
  }, [getDateRange, groupBy, taskId]);

  // Fetch event type distribution
  const fetchEventTypeDistribution = useCallback(async () => {
    try {
      setIsLoadingDistribution(true);
      setDistributionError(null);
      const { startDate, endDate } = getDateRange();
      const response = await api.get<{
        success: boolean;
        data: {
          eventTypes: EventTypeDistribution[];
          total: number;
        };
      }>(`/api/v1/tasks/${taskId}/analytics/event-types`, {
        params: {
          startDate,
          endDate,
        },
      });
      setEventTypeDistribution(response.data.eventTypes || []);
    } catch (err) {
      const apiError = err as ApiError;
      setDistributionError(apiError.message || 'Failed to load event distribution');
      setEventTypeDistribution([]);
    } finally {
      setIsLoadingDistribution(false);
    }
  }, [getDateRange, taskId]);

  // Fetch user activity
  const fetchUserActivity = useCallback(async () => {
    try {
      setIsLoadingUsers(true);
      setUsersError(null);
      const { startDate, endDate } = getDateRange();
      const response = await api.get<{
        success: boolean;
        data: UserActivityResponse;
      }>(`/api/v1/tasks/${taskId}/analytics/users`, {
        params: {
          page: currentPage,
          limit: usersPerPage,
          startDate,
          endDate,
        },
      });
      setUserActivity(response.data.users || []);
      setTotalUsers(response.data.total || 0);
    } catch (err) {
      const apiError = err as ApiError;
      setUsersError(apiError.message || 'Failed to load user activity');
      setUserActivity([]);
      setTotalUsers(0);
    } finally {
      setIsLoadingUsers(false);
    }
  }, [currentPage, getDateRange, taskId]);

  // Initial load
  useEffect(() => {
    if (taskId) {
      fetchTask();
      fetchSummary();
    }
  }, [fetchTask, fetchSummary, taskId]);

  // Load data when filters change
  useEffect(() => {
    if (taskId) {
      fetchEventsTimeline();
      fetchEventTypeDistribution();
    }
  }, [fetchEventsTimeline, fetchEventTypeDistribution, taskId]);

  // Load users when page changes
  useEffect(() => {
    if (taskId) {
      fetchUserActivity();
    }
  }, [fetchUserActivity, taskId]);

  // Format duration
  const formatDuration = (secondsValue: number) => {
    const seconds = Math.floor(secondsValue || 0);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);

    if (hours > 0) {
      return `${hours}h ${minutes % 60}m`;
    } else if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  };

  // Chart colors for dark/light mode
  const chartColors = {
    primary: 'hsl(var(--primary))',
    secondary: 'hsl(var(--secondary))',
    accent: 'hsl(var(--accent))',
    muted: 'hsl(var(--muted))',
  };

  // Event type colors
  const eventTypeColors: Record<string, string> = {
    keydown: '#3b82f6',
    keyup: '#8b5cf6',
    paste: '#10b981',
    copy: '#f59e0b',
    cut: '#ef4444',
    focus: '#06b6d4',
    blur: '#6366f1',
    input: '#ec4899',
  };

  // Retry handlers
  const handleRetryTimeline = () => fetchEventsTimeline();
  const handleRetryDistribution = () => fetchEventTypeDistribution();
  const handleRetryUsers = () => fetchUserActivity();

  // Summary stats cards
  const summaryCards = [
    {
      title: 'Total Events',
      value: summary?.totalEvents || 0,
      subtitle: `${summary?.avgEventsPerSession.toFixed(1) || 0} avg per session`,
      icon: Activity,
    },
    {
      title: 'Total Sessions',
      value: summary?.totalSessions || 0,
      subtitle: formatDuration(summary?.avgSessionDuration || 0),
      icon: BarChart3,
    },
    {
      title: 'Total Users',
      value: enrolledUserCount,
      subtitle: `${
        summary?.totalSessions && enrolledUserCount
          ? (summary.totalSessions / enrolledUserCount).toFixed(1)
          : 0
      } sessions/user`,
      icon: Users,
    },
    {
      title: 'Avg Session Duration',
      value: formatDuration(summary?.avgSessionDuration || 0),
      subtitle: 'Average time per session',
      icon: Clock,
    },
    {
      title: 'Completion Rate',
      value: `${summary?.completionRate.toFixed(1) || 0}%`,
      subtitle: 'of started sessions',
      icon: TrendingUp,
    },
    {
      title: 'Active Users (24h)',
      value: summary?.activeUsers24h || 0,
      subtitle: 'in last 24 hours',
      icon: Users,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" asChild className="-ml-2 mb-2">
            <Link href={`/tasks/${taskId}`}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back to Task
            </Link>
          </Button>
          <h1 className="text-3xl font-bold tracking-tight">Analytics</h1>
          <p className="text-muted-foreground mt-2">
            Comprehensive analytics and insights for your task
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={(value) => setDateRange(value as DateRangePreset)}>
            <SelectTrigger className="w-[180px]">
              <SelectValue placeholder="Select date range" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7days">Last 7 days</SelectItem>
              <SelectItem value="30days">Last 30 days</SelectItem>
              <SelectItem value="90days">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Summary Statistics Cards */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {summaryCards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                {isLoadingSummary ? (
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                ) : (
                  <>
                    <div className="text-2xl font-bold">{card.value.toLocaleString ? card.value.toLocaleString() : card.value}</div>
                    <p className="text-xs text-muted-foreground mt-1">{card.subtitle}</p>
                  </>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Error alert for summary */}
      {summaryError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>Error loading summary</AlertTitle>
          <AlertDescription>{summaryError}</AlertDescription>
        </Alert>
      )}

      {/* Events Timeline Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>Events Timeline</CardTitle>
              <CardDescription>Event activity over time</CardDescription>
            </div>
            <Select value={groupBy} onValueChange={(value) => setGroupBy(value as GroupBy)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue placeholder="Group by" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="hour">By Hour</SelectItem>
                <SelectItem value="day">By Day</SelectItem>
                <SelectItem value="week">By Week</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          {isLoadingTimeline ? (
            <div className="h-[300px] flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : timelineError ? (
            <div className="h-[300px] flex flex-col items-center justify-center gap-2">
              <p className="text-sm text-destructive">{timelineError}</p>
              <Button onClick={handleRetryTimeline} variant="outline" size="sm">
                <RefreshCcw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : !eventsTimeline || eventsTimeline.length === 0 ? (
            <div className="h-[300px] flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No data available for this period</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={300}>
              <AreaChart data={eventsTimeline}>
                <defs>
                  <linearGradient id="colorEvents" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={chartColors.primary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={chartColors.primary} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                <XAxis
                  dataKey="date"
                  className="text-xs"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                />
                <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
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
                  stroke={chartColors.primary}
                  strokeWidth={2}
                  fill="url(#colorEvents)"
                  name="Events"
                />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Event Type Distribution */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Bar Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Event Type Distribution</CardTitle>
            <CardDescription>Breakdown by event type</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingDistribution ? (
              <div className="h-[300px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : distributionError ? (
              <div className="h-[300px] flex flex-col items-center justify-center gap-2">
                <p className="text-sm text-destructive">{distributionError}</p>
                <Button onClick={handleRetryDistribution} variant="outline" size="sm">
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            ) : !eventTypeDistribution || eventTypeDistribution.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center">
                <p className="text-sm text-muted-foreground">No event data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={eventTypeDistribution}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis
                    dataKey="eventType"
                    className="text-xs"
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  />
                  <YAxis className="text-xs" tick={{ fill: 'hsl(var(--muted-foreground))' }} />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                    labelStyle={{ color: 'hsl(var(--foreground))' }}
                  />
                  <Bar dataKey="count" fill={chartColors.primary} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* Pie Chart */}
        <Card>
          <CardHeader>
            <CardTitle>Event Type Percentage</CardTitle>
            <CardDescription>Proportional distribution</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoadingDistribution ? (
              <div className="h-[300px] flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : distributionError ? (
              <div className="h-[300px] flex flex-col items-center justify-center gap-2">
                <p className="text-sm text-destructive">{distributionError}</p>
                <Button onClick={handleRetryDistribution} variant="outline" size="sm">
                  <RefreshCcw className="h-4 w-4 mr-2" />
                  Retry
                </Button>
              </div>
            ) : !eventTypeDistribution || eventTypeDistribution.length === 0 ? (
              <div className="h-[300px] flex items-center justify-center">
                <p className="text-sm text-muted-foreground">No event data available</p>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={eventTypeDistribution}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={({ eventType, percentage }) =>
                      `${eventType}: ${percentage.toFixed(1)}%`
                    }
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="count"
                  >
                    {(eventTypeDistribution || []).map((entry, index) => (
                      <Cell
                        key={`cell-${index}`}
                        fill={eventTypeColors[entry.eventType] || chartColors.primary}
                      />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '6px',
                    }}
                    formatter={(value: number, name: string, props: any) => [
                      `${value.toLocaleString()} (${props.payload.percentage.toFixed(1)}%)`,
                      name,
                    ]}
                  />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* User Activity Table */}
      <Card>
        <CardHeader>
          <CardTitle>User Activity</CardTitle>
          <CardDescription>Top users by activity</CardDescription>
        </CardHeader>
        <CardContent>
          {isLoadingUsers ? (
            <div className="h-[300px] flex items-center justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          ) : usersError ? (
            <div className="h-[300px] flex flex-col items-center justify-center gap-2">
              <p className="text-sm text-destructive">{usersError}</p>
              <Button onClick={handleRetryUsers} variant="outline" size="sm">
                <RefreshCcw className="h-4 w-4 mr-2" />
                Retry
              </Button>
            </div>
          ) : !userActivity || userActivity.length === 0 ? (
            <div className="h-[200px] flex items-center justify-center">
              <p className="text-sm text-muted-foreground">No user activity data available</p>
            </div>
          ) : (
            <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead className="text-right">Sessions</TableHead>
                    <TableHead className="text-right">Events</TableHead>
                    <TableHead>Last Activity</TableHead>
                    <TableHead className="text-right">Avg Duration</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(userActivity || []).map((user) => (
                    <TableRow key={user.externalUserId}>
                      <TableCell className="font-mono text-sm">
                        {user.externalUserId}
                      </TableCell>
                      <TableCell className="text-right">
                        {user.sessionCount.toLocaleString()}
                      </TableCell>
                      <TableCell className="text-right">
                        {user.eventCount.toLocaleString()}
                      </TableCell>
                      <TableCell>{formatDateTime(user.lastActive)}</TableCell>
                      <TableCell className="text-right">
                        {formatDuration(user.avgDuration)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>

              {/* Pagination */}
              <div className="flex items-center justify-between mt-4">
                <p className="text-sm text-muted-foreground">
                  Showing {(currentPage - 1) * usersPerPage + 1} to{' '}
                  {Math.min(currentPage * usersPerPage, totalUsers)} of {totalUsers} users
                </p>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    Previous
                  </Button>
                  <span className="text-sm">
                    Page {currentPage} of {Math.ceil(totalUsers / usersPerPage) || 1}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage((p) => p + 1)}
                    disabled={currentPage >= Math.ceil(totalUsers / usersPerPage)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

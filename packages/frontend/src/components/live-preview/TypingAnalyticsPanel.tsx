import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useTypingAnalytics } from '@/hooks/use-typing-analytics';
import { useSelectedMetrics } from '@/hooks/use-selected-metrics';
import { getMetricById } from '@/lib/metric-definitions';
import type { RealtimeEvent } from '@/lib/analytics-utils';
import { MetricCard } from './MetricCard';
import { EmptyAnalyticsState } from './EmptyAnalyticsState';
import { AnalyticsControls } from './AnalyticsControls';

interface TypingAnalyticsPanelProps {
  events: RealtimeEvent[];
  taskId: string;
  resetKey: number;
  onReset: () => void;
}

export function TypingAnalyticsPanel({ events, taskId, resetKey, onReset }: TypingAnalyticsPanelProps) {
  const analytics = useTypingAnalytics(events, resetKey);
  const selectedMetricsHook = useSelectedMetrics(taskId);

  // Get selected metric definitions
  const selectedMetricDefs = selectedMetricsHook.selectedMetrics
    .map(id => getMetricById(id))
    .filter(Boolean); // Filter out any undefined

  return (
    <Card className="flex flex-col h-full overflow-hidden" key={resetKey}>
      <CardHeader className="flex-shrink-0 pb-4">
        <AnalyticsControls
          selectedMetricsHook={selectedMetricsHook}
          onReset={onReset}
        />
      </CardHeader>

      <CardContent className="flex-1 p-0 overflow-hidden">
        {events.length === 0 ? (
          <EmptyAnalyticsState />
        ) : (
          <ScrollArea className="h-full w-full">
            <div className="space-y-3 p-4">
              {selectedMetricDefs.map(metric => {
                if (!metric) return null;

                const value = analytics[metric.id] || 0;
                const formattedValue = metric.formatter(value);

                return (
                  <MetricCard
                    key={metric.id}
                    label={metric.label}
                    value={formattedValue}
                    description={metric.description}
                    icon={metric.icon}
                    category={metric.category}
                  />
                );
              })}

              {selectedMetricDefs.length === 0 && (
                <div className="text-center text-sm text-muted-foreground p-8">
                  No metrics selected. Use the Metrics dropdown to select metrics to display.
                </div>
              )}
            </div>
          </ScrollArea>
        )}
      </CardContent>
    </Card>
  );
}

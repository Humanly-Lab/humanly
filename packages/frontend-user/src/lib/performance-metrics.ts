export const HUMANLY_PERFORMANCE_METRIC_EVENT = 'humanly:performance-metric';

export type HumanlyPerformanceMetricName =
  | 'humanly.workspace.hydration'
  | 'humanly.pdf.document_load'
  | 'humanly.pdf.first_page_paint'
  | 'humanly.pdf.text_index_readiness';

export interface HumanlyPerformanceMetricDetail {
  name: HumanlyPerformanceMetricName;
  durationMs: number;
  context: Record<string, boolean | number | string | null | undefined>;
}

export function getHumanlyPerformanceTimestamp(): number | null {
  if (typeof window === 'undefined' || !window.performance) return null;
  return window.performance.now();
}

export function recordHumanlyPerformanceMetric(
  name: HumanlyPerformanceMetricName,
  startedAt: number | null,
  context: HumanlyPerformanceMetricDetail['context'] = {}
): HumanlyPerformanceMetricDetail | null {
  if (
    startedAt === null ||
    typeof window === 'undefined' ||
    !window.performance
  ) {
    return null;
  }

  const endedAt = window.performance.now();
  const detail: HumanlyPerformanceMetricDetail = {
    name,
    durationMs: Number(Math.max(0, endedAt - startedAt).toFixed(2)),
    context,
  };

  try {
    window.performance.measure(name, {
      start: startedAt,
      end: endedAt,
      detail: context,
    });
  } catch {
    // Custom events remain available on browsers without measure options.
  }

  window.dispatchEvent(
    new CustomEvent<HumanlyPerformanceMetricDetail>(
      HUMANLY_PERFORMANCE_METRIC_EVENT,
      { detail }
    )
  );

  return detail;
}

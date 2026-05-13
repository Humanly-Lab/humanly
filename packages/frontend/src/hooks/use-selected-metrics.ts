import { useState, useEffect, useCallback } from 'react';
import { DEFAULT_METRICS } from '@/lib/metric-definitions';

export interface UseSelectedMetricsReturn {
  selectedMetrics: string[];
  toggleMetric: (metricId: string) => void;
  resetToDefaults: () => void;
  isSelected: (metricId: string) => boolean;
}

export function useSelectedMetrics(taskId: string): UseSelectedMetricsReturn {
  const storageKey = `humanly-analytics-metrics-${taskId}`;

  // Initialize from localStorage or defaults
  const [selectedMetrics, setSelectedMetrics] = useState<string[]>(() => {
    if (typeof window === 'undefined') return DEFAULT_METRICS;

    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        return Array.isArray(parsed) ? parsed : DEFAULT_METRICS;
      }
    } catch (error) {
      console.error('Error loading selected metrics from localStorage:', error);
    }

    return DEFAULT_METRICS;
  });

  // Persist to localStorage whenever selection changes
  useEffect(() => {
    if (typeof window === 'undefined') return;

    try {
      localStorage.setItem(storageKey, JSON.stringify(selectedMetrics));
    } catch (error) {
      console.error('Error saving selected metrics to localStorage:', error);
    }
  }, [selectedMetrics, storageKey]);

  // Toggle a metric on/off
  const toggleMetric = useCallback((metricId: string) => {
    setSelectedMetrics(prev => {
      if (prev.includes(metricId)) {
        // Remove metric
        return prev.filter(id => id !== metricId);
      } else {
        // Add metric
        return [...prev, metricId];
      }
    });
  }, []);

  // Reset to default metrics
  const resetToDefaults = useCallback(() => {
    setSelectedMetrics(DEFAULT_METRICS);
  }, []);

  // Check if a metric is selected
  const isSelected = useCallback((metricId: string) => {
    return selectedMetrics.includes(metricId);
  }, [selectedMetrics]);

  return {
    selectedMetrics,
    toggleMetric,
    resetToDefaults,
    isSelected
  };
}

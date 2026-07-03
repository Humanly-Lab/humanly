'use client';

import { useCallback, useEffect, useState } from 'react';
import { AlertCircle, ChevronDown, Info, Loader2, Shield, TrendingDown, TrendingUp } from 'lucide-react';

import api, { ApiError } from '@/lib/api-client';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * Generic, spec-driven detector card.
 *
 * A detector = one component spec (returned by the inference service) + one prediction result.
 * This component relies only on the contract and hardcodes no detector-specific copy: the title,
 * verdict wording, feature labels/units/descriptions, and accent color all come from the spec, so
 * the same component can be reused for any number of future detectors.
 */

type FeatureFormat = 'percent' | 'ms' | 'bits' | 'count' | 'ratio' | 'number';

interface DetectorSpec {
  id: string;
  title: string;
  verdict: {
    positiveClass: string;
    metricNoun: string;
    positiveLabel: string;
    negativeLabel: string;
  };
  style?: { accent?: string };
  features: Record<string, { label: string; format: FeatureFormat; description: string }>;
}

interface DetectFeature {
  name: string;
  value: number | null;
  contribution: number;
}

interface DetectResult {
  ok: boolean;
  label?: 'human' | 'agent' | 'unknown';
  score?: number;
  reason?: string;
  detail?: string;
  n_events?: number;
  features?: DetectFeature[];
  error?: string;
}

const HUMAN_COLOR = '#5b6b63';
const DEFAULT_ACCENT = '#6f5d61';
const BAR_TRACK = '#ece9e3';

function formatValue(format: FeatureFormat | undefined, v: number | null): string {
  if (v == null || Number.isNaN(v)) return '—';
  switch (format) {
    case 'percent':
      return `${(v * 100).toFixed(1)}%`;
    case 'ms':
      return `${Math.round(v)} ms`;
    case 'bits':
      return `${v.toFixed(2)} bits`;
    case 'count':
      return Math.round(v).toLocaleString();
    case 'ratio':
      return v.toFixed(2);
    default:
      return `${Math.round(v * 100) / 100}`;
  }
}

export default function DetectorCard({
  taskId,
  submissionId,
  detectorName = 'detector',
}: {
  taskId: string;
  submissionId: string;
  detectorName?: string;
}) {
  const [spec, setSpec] = useState<DetectorSpec | null>(null);
  const [result, setResult] = useState<DetectResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    api
      .get<{ success: boolean; data: DetectorSpec }>(`/api/v1/detectors/${detectorName}/spec`)
      .then((res) => {
        if (active) setSpec(res.data);
      })
      .catch(() => {
        /* Failing to load the spec is non-blocking: detection can still run, just with fallback copy */
      });
    return () => {
      active = false;
    };
  }, [detectorName]);

  const run = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      setResult(null);
      setExpanded(null);
      const res = await api.post<{ success: boolean; data: DetectResult }>(
        `/api/v1/tasks/${taskId}/submissions/${submissionId}/detect`,
        { detector: detectorName }
      );
      setResult(res.data);
    } catch (err) {
      setError((err as ApiError).message || 'Detection failed');
    } finally {
      setLoading(false);
    }
  }, [taskId, submissionId, detectorName]);

  // Run once automatically by default: detect on page entry without a manual click (the button stays as "Re-run").
  useEffect(() => {
    void run();
  }, [run]);

  const title = spec?.title ?? 'Detector';
  const metricNoun = spec?.verdict.metricNoun ?? 'computer-use agent';
  const positiveClass = spec?.verdict.positiveClass ?? 'agent';
  const positiveLabel = spec?.verdict.positiveLabel ?? 'Likely agent';
  const negativeLabel = spec?.verdict.negativeLabel ?? 'Likely human';
  const accent = spec?.style?.accent ?? DEFAULT_ACCENT;

  const isPositive = result?.label === positiveClass;
  const verdictColor = result?.label === 'unknown' ? '#6b6255' : isPositive ? accent : HUMAN_COLOR;
  const pct = Math.round((result?.score ?? 0) * 100);
  const feats = result?.features ?? [];
  const maxContrib = feats.reduce((m, f) => Math.max(m, Math.abs(f.contribution)), 0) || 1;

  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 border-b border-border/60 pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <Shield className="h-4 w-4" style={{ color: accent }} />
          {title}
        </CardTitle>
        <div className="flex items-center gap-3">
          <span className="hidden font-mono text-xs text-muted-foreground sm:inline">
            {submissionId.slice(0, 8)}
          </span>
          <Button size="sm" variant="outline" onClick={run} disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Detecting…
              </>
            ) : result ? (
              'Re-run'
            ) : (
              'Run detection'
            )}
          </Button>
        </div>
      </CardHeader>

      <CardContent className="pt-5">
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Detection failed</AlertTitle>
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {!error && !result && loading && (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Analyzing keystroke timing dynamics…
          </p>
        )}

        {!error && !result && !loading && (
          <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
            Estimate this submission&apos;s authorship from keystroke timing dynamics. Results are
            shown here only.
          </p>
        )}

        {result && result.label === 'unknown' && (
          <div className="flex items-start gap-3">
            <span className="mt-0.5 inline-flex shrink-0 items-center rounded-full border border-[#d7cdc0] bg-[#f1eee8] px-2.5 py-0.5 text-xs font-medium text-[#6b6255]">
              {result.reason === 'no_events' ? 'No data' : 'Inconclusive'}
            </span>
            <p className="text-sm text-muted-foreground">
              {result.reason === 'no_events'
                ? 'No writing events to analyze for this submission.'
                : `Not enough clean typing to judge.${result.detail ? ` ${result.detail}` : ''}`}
            </p>
          </div>
        )}

        {result && (result.label === 'human' || result.label === 'agent') && (
          <div className="space-y-6">
            {/* Probability + verdict */}
            <div className="flex flex-wrap items-center gap-x-5 gap-y-3">
              <div className="flex items-baseline gap-2.5">
                <span
                  className="text-[2.75rem] font-bold leading-none tracking-tight"
                  style={{ color: verdictColor }}
                >
                  {pct}%
                </span>
                <span className="max-w-[10rem] text-sm leading-snug text-muted-foreground">
                  probability of {metricNoun}
                </span>
              </div>
              <span
                className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-sm font-medium"
                style={{
                  color: verdictColor,
                  backgroundColor: isPositive ? '#f2edee' : '#eff2ef',
                  borderColor: isPositive ? '#d6c5c7' : '#cbd5ce',
                }}
              >
                {isPositive ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
                {isPositive ? positiveLabel : negativeLabel}
              </span>
            </div>

            {/* Top contributing features (click to expand the description) */}
            {feats.length > 0 && (
              <div className="space-y-1 border-t border-dashed border-border pt-4">
                <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  Top contributing features
                </p>
                {feats.map((f) => {
                  const meta = spec?.features?.[f.name];
                  const label = meta?.label ?? f.name;
                  const value = formatValue(meta?.format, f.value);
                  const width = Math.round((Math.abs(f.contribution) / maxContrib) * 100);
                  const open = expanded === f.name;
                  const hasDesc = Boolean(meta?.description);
                  return (
                    <div key={f.name} className="border-b border-border/40 last:border-0">
                      <button
                        type="button"
                        onClick={() => hasDesc && setExpanded(open ? null : f.name)}
                        className="group flex w-full flex-col gap-1.5 rounded-md py-2.5 text-left transition-colors hover:bg-muted/40 disabled:cursor-default"
                        disabled={!hasDesc}
                        aria-expanded={open}
                      >
                        <div className="flex items-baseline justify-between gap-3 px-1 text-sm">
                          <span className="flex items-center gap-1.5 text-foreground/80">
                            {label}
                            {hasDesc && (
                              <ChevronDown
                                className={`h-3.5 w-3.5 text-muted-foreground/60 transition-transform ${open ? 'rotate-180' : ''}`}
                              />
                            )}
                          </span>
                          <span className="font-semibold tabular-nums">{value}</span>
                        </div>
                        <div className="mx-1 h-1.5 overflow-hidden rounded-full" style={{ backgroundColor: BAR_TRACK }}>
                          <div
                            className="h-full rounded-full transition-all duration-500"
                            style={{ width: `${width}%`, backgroundColor: verdictColor }}
                          />
                        </div>
                      </button>
                      {open && meta?.description && (
                        <p className="px-1 pb-3 text-xs leading-relaxed text-muted-foreground">
                          {meta.description}
                        </p>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {/* Advisory note */}
            <p className="flex items-start gap-1.5 border-t border-dashed border-border pt-4 text-xs text-muted-foreground">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              Advisory only, not a verdict. Based on {(result.n_events ?? 0).toLocaleString()} writing
              events.
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

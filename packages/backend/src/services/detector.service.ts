import { TaskService, TaskLogEventExportRow } from './task.service';
import { AppError } from '../middleware/error-handler';
import { env } from '../config/env';
import { logger } from '../utils/logger';

/**
 * Detector integration service.
 *
 * Design: invoked per submission from the admin console; the result is returned immediately and
 * not persisted (zero schema changes). Reuses TaskService.exportTaskLogEvents, which already
 * checks task ownership and gathers writing events, then filters by submission, dedupes by
 * eventId (the submissions×events JOIN can produce duplicate events; same de-duplication the
 * inference service's feature extraction applies), sorts by ascending time, and forwards to the
 * Python inference service.
 */

const DETECT_TIMEOUT_MS = 30_000;

export interface DetectFeature {
  name: string;
  value: number | null;
  contribution: number;
}

export interface DetectResult {
  ok: boolean;
  label?: 'human' | 'agent' | 'unknown';
  score?: number;
  threshold?: number | null;
  threshold_trustworthy?: boolean;
  reason?: string;
  detail?: string;
  n_keydown?: number;
  typed_ratio?: number;
  n_events?: number;
  features?: DetectFeature[];
  error?: string;
}

/** Detector component spec: the frontend renders generically from this. See SPEC in the inference service's models/<name>/predict.py. */
export interface DetectorSpec {
  id: string;
  title: string;
  verdict: {
    positiveClass: string;
    metricNoun: string;
    positiveLabel: string;
    negativeLabel: string;
  };
  style?: { accent?: string };
  features: Record<string, { label: string; format: string; description: string }>;
}

/** Pick only the fields the detector actually uses, to avoid sending irrelevant columns beyond the verbatim text. */
function toDetectorEvent(row: TaskLogEventExportRow): Record<string, unknown> {
  return {
    eventId: row.eventId,
    eventType: row.eventType,
    eventTimestamp:
      row.eventTimestamp instanceof Date
        ? row.eventTimestamp.toISOString()
        : new Date(row.eventTimestamp).toISOString(),
    textBefore: row.textBefore,
    textAfter: row.textAfter,
    metadata: row.metadata ?? null,
  };
}

export class DetectorService {
  /**
   * Run human/agent detection on a submission.
   * @param taskId       Task ID (used for ownership check)
   * @param submissionId A submission under this task
   * @param adminUserId  The admin making the request (must be the task owner)
   */
  static async detectSubmission(
    taskId: string,
    submissionId: string,
    adminUserId: string,
    detectorName = 'detector'
  ): Promise<DetectResult> {
    // Reuse the export query: it already checks task ownership (throws 403 for non-owners).
    // Passing submissionId pushes the filter down to the DB layer so we fetch only this
    // submission's writing events, instead of pulling the whole task and filtering in memory.
    const rows = await TaskService.exportTaskLogEvents(
      taskId,
      adminUserId,
      undefined,
      submissionId
    );
    if (rows.length === 0) {
      // No keystroke events joined for this submission (e.g. paste-only or legacy data).
      // This is a "no data" case, not a failure, so return a neutral result so the UI shows a
      // calm notice instead of a red error. (The export query already enforced task ownership.)
      return { ok: true, label: 'unknown', reason: 'no_events', n_events: 0 };
    }

    // Dedupe by eventId (the JOIN can produce duplicates), then sort ascending by (time, server-side created time, eventId), consistent with feature extraction.
    const seen = new Set<string>();
    const deduped = rows.filter((r) => {
      if (!r.eventId || seen.has(r.eventId)) return false;
      seen.add(r.eventId);
      return true;
    });
    deduped.sort((a, b) => {
      const ta = new Date(a.eventTimestamp).getTime();
      const tb = new Date(b.eventTimestamp).getTime();
      if (ta !== tb) return ta - tb;
      const ca = a.eventCreatedAt ? new Date(a.eventCreatedAt).getTime() : 0;
      const cb = b.eventCreatedAt ? new Date(b.eventCreatedAt).getTime() : 0;
      if (ca !== cb) return ca - cb;
      return (a.eventId || '').localeCompare(b.eventId || '');
    });

    const events = deduped.map(toDetectorEvent);

    logger.info('Detector run requested', {
      taskId,
      submissionId,
      adminUserId,
      nEvents: events.length,
    });

    return DetectorService.callInference<DetectResult>(
      'POST',
      `/models/${detectorName}/predict`,
      { events }
    );
  }

  /** List the models (detectors) registered with the inference service. */
  static async listDetectors(): Promise<string[]> {
    const res = await DetectorService.callInference<{ models: string[] }>('GET', '/models');
    return res.models ?? [];
  }

  /** Get a detector's component spec: title / verdict wording / feature table (label+format+description) / style. */
  static async getSpec(name: string): Promise<DetectorSpec> {
    return DetectorService.callInference<DetectorSpec>('GET', `/models/${name}/spec`);
  }

  /** Unified inference service call: handles timeout and maps errors to 502/503. */
  private static async callInference<T>(
    method: 'GET' | 'POST',
    path: string,
    body?: unknown
  ): Promise<T> {
    const url = `${env.inferenceUrl.replace(/\/$/, '')}${path}`;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DETECT_TIMEOUT_MS);
    try {
      const resp = await fetch(url, {
        method,
        headers: body ? { 'Content-Type': 'application/json' } : undefined,
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      if (!resp.ok) {
        const text = await resp.text().catch(() => '');
        throw new AppError(502, `Inference service error (${resp.status}): ${text.slice(0, 200)}`);
      }
      return (await resp.json()) as T;
    } catch (err) {
      if (err instanceof AppError) throw err;
      const msg = err instanceof Error ? err.message : 'unknown error';
      logger.error('Inference request failed', { url, error: msg });
      throw new AppError(503, `Inference service unavailable: ${msg}`);
    } finally {
      clearTimeout(timer);
    }
  }
}

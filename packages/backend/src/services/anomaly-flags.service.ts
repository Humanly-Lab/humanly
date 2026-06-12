import {
  normalizeCopyPastePolicy,
  type WritingAnomalyFlag,
  type WritingAnomalyThresholds,
  type WritingEnvironmentConfig,
} from '@humanly/shared';
import {
  DocumentAnomalyAnalysisFeatures,
  DocumentEventModel,
} from '../models/document-event.model';
import { logger } from '../utils/logger';

export const DEFAULT_ANOMALY_THRESHOLDS: WritingAnomalyThresholds = {
  highSpeedWindowSeconds: 30,
  highSpeedCharsPerMinute: 900,
  highSpeedMinimumCharacters: 160,
  uniformCadenceMinimumEvents: 25,
  uniformCadenceMaximumStddevMs: 12,
  uniformCadenceMaximumMeanMs: 220,
  textInfluxMinimumCharacters: 250,
  focusInfluxWindowSeconds: 8,
  clockSkewMinimumEvents: 80,
  clockSkewMinimumClientSpanSeconds: 120,
  clockSkewMaximumServerSpanSeconds: 5,
};

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

export function computeWritingAnomalyFlags(
  features: DocumentAnomalyAnalysisFeatures,
  environmentConfig?: WritingEnvironmentConfig | null,
  thresholds: WritingAnomalyThresholds = DEFAULT_ANOMALY_THRESHOLDS
): WritingAnomalyFlag[] {
  const flags: WritingAnomalyFlag[] = [];

  if (
    features.speed.maxCharsInWindow >= thresholds.highSpeedMinimumCharacters
    && features.speed.charsPerMinute >= thresholds.highSpeedCharsPerMinute
  ) {
    flags.push({
      code: 'sustained_high_typing_speed',
      severity: features.speed.charsPerMinute >= thresholds.highSpeedCharsPerMinute * 1.5
        ? 'critical'
        : 'warning',
      label: 'Sustained high typing speed',
      description: 'A short writing window contained more typed characters than expected from ordinary human typing.',
      evidence: {
        windowSeconds: features.speed.windowSeconds,
        maxCharactersInWindow: features.speed.maxCharsInWindow,
        charactersPerMinute: features.speed.charsPerMinute,
        thresholdCharactersPerMinute: thresholds.highSpeedCharsPerMinute,
      },
    });
  }

  if (
    features.cadence.intervalCount >= thresholds.uniformCadenceMinimumEvents
    && features.cadence.stddevIntervalMs !== null
    && features.cadence.meanIntervalMs !== null
    && features.cadence.stddevIntervalMs <= thresholds.uniformCadenceMaximumStddevMs
    && features.cadence.meanIntervalMs <= thresholds.uniformCadenceMaximumMeanMs
  ) {
    flags.push({
      code: 'uniform_key_cadence',
      severity: 'warning',
      label: 'Uniform key cadence',
      description: 'Key intervals were unusually uniform, which can indicate scripted or agent-driven input.',
      evidence: {
        intervalCount: features.cadence.intervalCount,
        meanIntervalMs: round(features.cadence.meanIntervalMs),
        stddevIntervalMs: round(features.cadence.stddevIntervalMs),
        thresholdStddevMs: thresholds.uniformCadenceMaximumStddevMs,
      },
    });
  }

  if (features.textInflux.addedCharacters >= thresholds.textInfluxMinimumCharacters) {
    flags.push({
      code: 'text_influx_without_input',
      severity: features.textInflux.addedCharacters >= thresholds.textInfluxMinimumCharacters * 4
        ? 'critical'
        : 'warning',
      label: 'Text appeared without matching input',
      description: 'A large text increase was recorded on an event type that is not typed input, paste, or in-platform AI insertion.',
      evidence: {
        eventType: features.textInflux.eventType,
        timestamp: features.textInflux.timestamp?.toISOString() || null,
        addedCharacters: features.textInflux.addedCharacters,
        thresholdCharacters: thresholds.textInfluxMinimumCharacters,
      },
    });
  }

  if (features.focusInflux.addedCharacters >= thresholds.textInfluxMinimumCharacters) {
    flags.push({
      code: 'focus_text_influx',
      severity: 'warning',
      label: 'Text influx after refocus',
      description: 'A large amount of text appeared shortly after the editor regained focus.',
      evidence: {
        blurTimestamp: features.focusInflux.blurTimestamp?.toISOString() || null,
        focusTimestamp: features.focusInflux.focusTimestamp?.toISOString() || null,
        windowSeconds: thresholds.focusInfluxWindowSeconds,
        addedCharacters: features.focusInflux.addedCharacters,
        thresholdCharacters: thresholds.textInfluxMinimumCharacters,
      },
    });
  }

  if (
    normalizeCopyPastePolicy(environmentConfig?.copyPastePolicy) === 'blocked'
    && features.pasteEvents > 0
  ) {
    flags.push({
      code: 'paste_policy_violation',
      severity: 'critical',
      label: 'Paste occurred while paste was blocked',
      description: 'The active writing environment disallowed paste, but paste events were recorded.',
      evidence: {
        pasteEvents: features.pasteEvents,
        policy: 'blocked',
      },
    });
  }

  if (
    features.clockSkew.eventCount >= thresholds.clockSkewMinimumEvents
    && features.clockSkew.clientSpanSeconds >= thresholds.clockSkewMinimumClientSpanSeconds
    && features.clockSkew.serverSpanSeconds <= thresholds.clockSkewMaximumServerSpanSeconds
  ) {
    flags.push({
      code: 'clock_skew_anomaly',
      severity: 'warning',
      label: 'Client/server timing mismatch',
      description: 'Client timestamps span much longer than the server-side arrival window for the same session.',
      evidence: {
        sessionId: features.clockSkew.sessionId,
        eventCount: features.clockSkew.eventCount,
        clientSpanSeconds: round(features.clockSkew.clientSpanSeconds),
        serverSpanSeconds: round(features.clockSkew.serverSpanSeconds),
        thresholdClientSpanSeconds: thresholds.clockSkewMinimumClientSpanSeconds,
        thresholdServerSpanSeconds: thresholds.clockSkewMaximumServerSpanSeconds,
      },
    });
  }

  return flags;
}

export class AnomalyFlagsService {
  static async analyzeDocument(
    documentId: string,
    environmentConfig?: WritingEnvironmentConfig | null,
    thresholds: WritingAnomalyThresholds = DEFAULT_ANOMALY_THRESHOLDS
  ): Promise<WritingAnomalyFlag[]> {
    try {
      const features = await DocumentEventModel.getAnomalyAnalysisFeatures(documentId, thresholds);
      return computeWritingAnomalyFlags(features, environmentConfig, thresholds);
    } catch (error) {
      logger.warn('Unable to compute writing anomaly flags', { error, documentId });
      return [];
    }
  }
}

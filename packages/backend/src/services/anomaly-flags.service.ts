import {
  normalizeCopyPastePolicy,
  type DocumentEventQueryFilters,
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
  clockSkewMinimumEvents: 80,
  clockSkewMinimumClientSpanSeconds: 120,
  clockSkewMaximumServerSpanSeconds: 5,
  workspaceSwitchWindowSeconds: 90,
  workspaceSwitchMinimumSwitches: 6,
};

function formatDurationMs(valueMs: number) {
  const totalSeconds = Math.max(0, Math.round(valueMs / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) return `${seconds}s`;
  return seconds === 0 ? `${minutes}min` : `${minutes}min${seconds}s`;
}

export function buildAiPolicyRefusalFlag(refusalCount: number): WritingAnomalyFlag | null {
  if (refusalCount <= 0) return null;

  return {
    code: 'chat_refusal',
    severity: 'warning',
    label: refusalCount === 1 ? 'Chat refusal' : 'Chat refusals',
    description:
      'The in-platform assistant refused a request because it conflicted with the active writing policy.',
    evidence: {
      refusalCount,
      eventType: 'ai_policy_refusal',
    },
  };
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
      code: 'rapid_text_accumulation',
      severity: features.speed.maxCharsInWindow >= thresholds.highSpeedMinimumCharacters * 4 ? 'critical' : 'warning',
      label: 'Rapid text accumulation',
      description: 'A large amount of text appeared within a short time window.',
      evidence: {
        source: 'typing_speed',
        windowSeconds: features.speed.windowSeconds,
        maxCharactersInWindow: features.speed.maxCharsInWindow,
        charactersPerMinute: features.speed.charsPerMinute,
        thresholdCharactersPerMinute: thresholds.highSpeedCharsPerMinute,
        thresholdCharactersInWindow: thresholds.highSpeedMinimumCharacters,
      },
    });
  }

  if (features.textInflux.eventCount > 0) {
    flags.push({
      code: 'untracked_text_source',
      severity: 'warning',
      label: 'Untracked text source',
      description: "Text was added through an event source outside Humanly's tracked text-input categories.",
      evidence: {
        eventCount: features.textInflux.eventCount,
        untrackedCharacters: features.textInflux.totalAddedCharacters,
        largestEventType: features.textInflux.largestEventType,
        largestTimestamp: features.textInflux.largestTimestamp?.toISOString() || null,
        largestAddedCharacters: features.textInflux.largestAddedCharacters,
        eventTypes: features.textInflux.eventTypes,
      },
    });
  }

  if (features.awayFromWorkspace.rapidSwitchCount >= thresholds.workspaceSwitchMinimumSwitches) {
    flags.push({
      code: 'repeated_workspace_switching',
      severity: 'warning',
      label: 'Repeated workspace switching',
      description: 'The writer repeatedly left and returned to the Humanly workspace in a short window.',
      evidence: {
        switchCount: features.awayFromWorkspace.rapidSwitchCount,
        windowDuration: formatDurationMs(features.awayFromWorkspace.rapidSwitchWindowMs),
        windowSeconds: thresholds.workspaceSwitchWindowSeconds,
        thresholdSwitches: thresholds.workspaceSwitchMinimumSwitches,
        windowStart: features.awayFromWorkspace.rapidSwitchWindowStart,
        windowEnd: features.awayFromWorkspace.rapidSwitchWindowEnd,
      },
    });
  }

  if (
    normalizeCopyPastePolicy(environmentConfig?.copyPastePolicy) === 'blocked'
    && (features.copyPaste.blockedAttempts > 0 || features.copyPaste.pasteEvents > 0 || features.copyPaste.copyEvents > 0 || features.copyPaste.cutEvents > 0)
  ) {
    flags.push({
      code: 'blocked_copy_paste_attempt',
      severity: 'critical',
      label: 'Blocked copy-paste attempt',
      description: 'Copy, cut, or paste was attempted while copy-paste was disabled in the writing environment.',
      evidence: {
        blockedAttempts: features.copyPaste.blockedAttempts,
        pasteEvents: features.copyPaste.pasteEvents,
        copyEvents: features.copyPaste.copyEvents,
        cutEvents: features.copyPaste.cutEvents,
        policy: 'blocked',
      },
    });
  }

  return flags;
}

export class AnomalyFlagsService {
  static async analyzeDocument(
    documentId: string,
    environmentConfig?: WritingEnvironmentConfig | null,
    thresholds: WritingAnomalyThresholds = DEFAULT_ANOMALY_THRESHOLDS,
    filters: Pick<DocumentEventQueryFilters, 'startDate' | 'endDate'> = {}
  ): Promise<WritingAnomalyFlag[]> {
    const flags: WritingAnomalyFlag[] = [];

    try {
      const features = await DocumentEventModel.getAnomalyAnalysisFeatures(documentId, thresholds, filters);
      flags.push(...computeWritingAnomalyFlags(features, environmentConfig, thresholds));
    } catch (error) {
      logger.warn('Unable to compute writing anomaly feature flags', { error, documentId });
    }

    try {
      const policyRefusalCount = await DocumentEventModel.countByDocumentIdWithFilters(documentId, {
        eventType: 'ai_policy_refusal',
        ...filters,
      });
      const policyRefusalFlag = buildAiPolicyRefusalFlag(policyRefusalCount);

      if (policyRefusalFlag) {
        flags.push(policyRefusalFlag);
      }
    } catch (error) {
      logger.warn('Unable to compute AI policy refusal anomaly flag', { error, documentId });
    }

    return flags;
  }
}

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
  textInfluxMinimumCharacters: 250,
  focusInfluxWindowSeconds: 8,
  clockSkewMinimumEvents: 80,
  clockSkewMinimumClientSpanSeconds: 120,
  clockSkewMaximumServerSpanSeconds: 5,
  largePasteMinimumCharacters: 500,
  largePasteMinimumPercentage: 30,
  largePasteAbsoluteCharacters: 1500,
  rapidTabSwitchWindowSeconds: 90,
  rapidTabSwitchMinimumSwitches: 6,
};

function round(value: number, digits = 1) {
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

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
  const rapidTextSources: string[] = [];
  const rapidTextEvidence: Record<string, string | number | null | string[]> = {};

  if (
    features.speed.maxCharsInWindow >= thresholds.highSpeedMinimumCharacters
    && features.speed.charsPerMinute >= thresholds.highSpeedCharsPerMinute
  ) {
    rapidTextSources.push('typing_speed');
    rapidTextEvidence.windowSeconds = features.speed.windowSeconds;
    rapidTextEvidence.maxCharactersInWindow = features.speed.maxCharsInWindow;
    rapidTextEvidence.charactersPerMinute = features.speed.charsPerMinute;
    rapidTextEvidence.thresholdCharactersPerMinute = thresholds.highSpeedCharsPerMinute;
  }

  if (features.textInflux.addedCharacters >= thresholds.textInfluxMinimumCharacters) {
    rapidTextSources.push('untracked_input');
    rapidTextEvidence.untrackedEventType = features.textInflux.eventType;
    rapidTextEvidence.untrackedTimestamp = features.textInflux.timestamp?.toISOString() || null;
    rapidTextEvidence.untrackedAddedCharacters = features.textInflux.addedCharacters;
  }

  if (features.focusInflux.addedCharacters >= thresholds.textInfluxMinimumCharacters) {
    rapidTextSources.push('after_refocus');
    rapidTextEvidence.blurTimestamp = features.focusInflux.blurTimestamp?.toISOString() || null;
    rapidTextEvidence.focusTimestamp = features.focusInflux.focusTimestamp?.toISOString() || null;
    rapidTextEvidence.refocusWindowSeconds = thresholds.focusInfluxWindowSeconds;
    rapidTextEvidence.refocusAddedCharacters = features.focusInflux.addedCharacters;
  }

  if (rapidTextSources.length > 0) {
    const largestBurst = Math.max(
      features.speed.maxCharsInWindow,
      features.textInflux.addedCharacters,
      features.focusInflux.addedCharacters
    );

    flags.push({
      code: 'rapid_text_accumulation',
      severity: largestBurst >= thresholds.textInfluxMinimumCharacters * 4 ? 'critical' : 'warning',
      label: 'Rapid text accumulation',
      description: 'A large amount of text appeared within a short time window.',
      evidence: {
        sources: rapidTextSources,
        thresholdCharacters: thresholds.textInfluxMinimumCharacters,
        ...rapidTextEvidence,
      },
    });
  }

  if (features.awayFromWorkspace.rapidSwitchCount >= thresholds.rapidTabSwitchMinimumSwitches) {
    flags.push({
      code: 'rapid_tab_switching',
      severity: 'warning',
      label: 'Rapid tab switching',
      description: 'The writer repeatedly left and returned to the Humanly workspace in a short window.',
      evidence: {
        switchCount: features.awayFromWorkspace.rapidSwitchCount,
        windowDuration: formatDurationMs(features.awayFromWorkspace.rapidSwitchWindowMs),
        windowSeconds: thresholds.rapidTabSwitchWindowSeconds,
        thresholdSwitches: thresholds.rapidTabSwitchMinimumSwitches,
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

  if (
    normalizeCopyPastePolicy(environmentConfig?.copyPastePolicy) === 'allowed'
    && features.copyPaste.pastedCharacters > 0
  ) {
    const pastedPercentage = features.copyPaste.totalCharacters > 0
      ? (features.copyPaste.pastedCharacters / features.copyPaste.totalCharacters) * 100
      : 0;
    const meetsRelativeThreshold =
      features.copyPaste.pastedCharacters >= thresholds.largePasteMinimumCharacters
      && pastedPercentage >= thresholds.largePasteMinimumPercentage;
    const meetsAbsoluteThreshold =
      features.copyPaste.pastedCharacters >= thresholds.largePasteAbsoluteCharacters;

    if (meetsRelativeThreshold || meetsAbsoluteThreshold) {
      flags.push({
        code: 'large_paste_volume',
        severity: 'warning',
        label: 'Large paste volume',
        description: 'A substantial portion of the final text came from pasted content.',
        evidence: {
          pasteEvents: features.copyPaste.pasteEvents,
          pastedCharacters: features.copyPaste.pastedCharacters,
          pastedPercentage: round(pastedPercentage),
          thresholdCharacters: thresholds.largePasteMinimumCharacters,
          thresholdPercentage: thresholds.largePasteMinimumPercentage,
          absoluteThresholdCharacters: thresholds.largePasteAbsoluteCharacters,
        },
      });
    }
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

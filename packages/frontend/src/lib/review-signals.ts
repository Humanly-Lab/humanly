import type { WritingAnomalyFlag } from '@humanly/shared';

const hiddenReviewSignalCodes = new Set<WritingAnomalyFlag['code']>([
  'clock_skew_anomaly',
  'uniform_key_cadence',
  'large_paste_volume',
]);

const rapidTextAccumulationCodes = new Set<WritingAnomalyFlag['code']>([
  'sustained_high_typing_speed',
]);

function isClearlyLongOrRepeatedAway(flag: WritingAnomalyFlag) {
  const leftCount = Number(flag.evidence?.leftCount || 0);
  const totalAwayTime = String(flag.evidence?.totalAwayTime || '');
  const longestAwayTime = String(flag.evidence?.longestAwayTime || '');

  return (
    leftCount >= 3 ||
    /[5-9]min|[1-9][0-9]+min/.test(longestAwayTime) ||
    /1[0-9]min|[2-9][0-9]+min/.test(totalAwayTime)
  );
}

export function normalizeReviewSignal(flag: WritingAnomalyFlag): WritingAnomalyFlag | null {
  if (hiddenReviewSignalCodes.has(flag.code)) {
    return null;
  }

  if (rapidTextAccumulationCodes.has(flag.code)) {
    return {
      ...flag,
      code: 'rapid_text_accumulation',
      label: 'Rapid text accumulation',
      description: 'A large amount of text appeared within a short time window.',
      evidence: {
        legacyCode: flag.code,
        ...(flag.evidence || {}),
      },
    };
  }

  if (flag.code === 'text_influx_without_input') {
    return {
      ...flag,
      code: 'untracked_text_source',
      label: 'Untracked text source',
      description: "Text was added through an event source outside Humanly's tracked text-input categories.",
      evidence: {
        legacyCode: flag.code,
        ...(flag.evidence || {}),
      },
    };
  }

  if (flag.code === 'focus_text_influx') {
    return null;
  }

  if (flag.code === 'away_from_workspace') {
    if (!isClearlyLongOrRepeatedAway(flag)) return null;

    return {
      ...flag,
      code: 'long_or_repeated_away_from_workspace',
      label: 'Long or repeated away-from-workspace time',
      description: 'The writer left the Humanly writing workspace for a long time or repeatedly during the session.',
      evidence: {
        legacyCode: flag.code,
        ...(flag.evidence || {}),
      },
    };
  }

  if (flag.code === 'rapid_tab_switching' || flag.code === 'repeated_workspace_switching') {
    return {
      ...flag,
      code: 'repeated_workspace_switching',
      label: 'Repeated workspace switching',
      description: 'The writer repeatedly left and returned to the Humanly workspace in a short window.',
      evidence: {
        ...(flag.code === 'rapid_tab_switching' ? { legacyCode: flag.code } : {}),
        ...(flag.evidence || {}),
      },
    };
  }

  if (flag.code === 'paste_policy_violation') {
    return {
      ...flag,
      code: 'blocked_copy_paste_attempt',
      label: 'Blocked copy-paste attempt',
      description: 'Copy, cut, or paste was attempted while copy-paste was disabled in the writing environment.',
      evidence: {
        legacyCode: flag.code,
        ...(flag.evidence || {}),
      },
    };
  }

  if (flag.code === 'ai_policy_refusal') {
    return {
      ...flag,
      code: 'chat_refusal',
      label: flag.evidence?.refusalCount === 1 ? 'Chat refusal' : 'Chat refusals',
    };
  }

  return flag;
}

export function getReviewSignals(flags?: WritingAnomalyFlag[] | null): WritingAnomalyFlag[] {
  return (flags || [])
    .map(normalizeReviewSignal)
    .filter((flag): flag is WritingAnomalyFlag => Boolean(flag));
}

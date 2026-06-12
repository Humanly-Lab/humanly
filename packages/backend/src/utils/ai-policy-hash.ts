import crypto from 'crypto';
import {
  WritingAiPolicyConfig,
  normalizeWritingAiPolicy,
} from '@humanly/shared';
import { canonicalJSONString } from '../services/certificate-seal.service';

export const AI_POLICY_REFUSAL_PREFIX =
  "I can't help with that request because it conflicts with the writing policy.";

export function isAiPolicyRefusalText(content: string | null | undefined): boolean {
  return typeof content === 'string' && content.trimStart().startsWith(AI_POLICY_REFUSAL_PREFIX);
}

export function computeAiPolicyTextHash(
  policy?: Partial<WritingAiPolicyConfig> | null
): string | null {
  const normalized = normalizeWritingAiPolicy(policy);
  if (normalized.mode !== 'guard' || !normalized.rejectionRule?.trim()) {
    return null;
  }

  const canonicalPolicy = {
    mode: 'guard',
    rejectionRule: normalized.rejectionRule.trim(),
  };

  return crypto
    .createHash('sha256')
    .update(canonicalJSONString(canonicalPolicy), 'utf8')
    .digest('hex');
}

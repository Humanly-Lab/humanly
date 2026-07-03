export type WritingTaskType = 'personal' | 'admin_assigned';
export type WritingAiAccess = 'off' | 'polish' | 'chat' | 'full';
export type LegacyWritingAiAccess = WritingAiAccess | 'readonly' | 'on';
export type WritingAiPolicyMode = 'off' | 'guard';
export type WritingAiUsageLimitMode = 'unlimited' | 'max_requests' | 'max_tokens' | 'time_restricted';
export type WritingLateSubmissionPolicy = 'allowed' | 'not_allowed';
export type WritingSubmissionMode = 'single' | 'multiple';
export type WritingAttemptPolicyMode = 'single' | 'restart_allowed';
export type CopyPastePolicy = 'allowed' | 'blocked';
export type ResourceAccessPolicy = 'downloadable' | 'view-only';
export type WritingEnvironmentPreset = 'default_writing' | 'no_ai' | 'ai_assisted' | 'timed_writing' | 'custom';
export type WritingAiProvider = 'together' | 'openrouter' | 'openai' | 'claude' | 'custom';
export type WritingDetectorId = 'anomalyPattern' | 'humanTyping';

export interface WritingDetectorToggle {
  enabled: boolean;
}

export interface WritingDetectorConfig {
  anomalyPattern: WritingDetectorToggle;
  humanTyping: WritingDetectorToggle;
}

export interface WritingAiProviderConfig {
  provider: WritingAiProvider;
  baseUrl: string;
}

export interface WritingAiTokenBudget {
  shortcutMaxTokens?: number;
  chatMaxTokens?: number;
}

export interface WritingAiPolicyConfig {
  mode: WritingAiPolicyMode;
  rejectionRule?: string;
}

export interface WritingAttemptPolicyConfig {
  mode: WritingAttemptPolicyMode;
  maxAttempts?: number;
}

export interface WritingEnvironmentConfig {
  preset?: WritingEnvironmentPreset;
  taskType: WritingTaskType;
  description?: string;
  instructions: {
    hasInstructionPdf?: boolean;
    taskInstruction?: string;
    editableAfterSubmission: boolean;
  };
  aiAccess: WritingAiAccess;
  aiProvider?: WritingAiProviderConfig;
  allowedModels: string[];
  customModels?: string[];
  aiTokenBudget?: WritingAiTokenBudget;
  aiPolicy?: WritingAiPolicyConfig;
  aiUsageLimit: {
    mode: WritingAiUsageLimitMode;
    maxRequests?: number;
    maxTokens?: number;
  };
  time: {
    startTime?: string;
    endTime?: string;
    timeLimitSeconds?: number;
    lateSubmission: WritingLateSubmissionPolicy;
  };
  submission: {
    mode: WritingSubmissionMode;
    minCharacters?: number;
    maxCharacters?: number;
    attemptPolicy?: WritingAttemptPolicyConfig;
  };
  traceability: {
    trackAiUsage: boolean;
    trackTyping: boolean;
    trackCopyPaste: boolean;
    trackFocusBlur: boolean;
  };
  detectors: WritingDetectorConfig;
  resourceAccess?: ResourceAccessPolicy;
  copyPastePolicy: CopyPastePolicy;
}

export const WRITING_AI_MODELS = ['GPT-4.1', 'GPT-5', 'Claude', 'Gemini', 'Custom models'] as const;

export const WRITING_AI_ACCESS_OPTIONS: Array<{ value: WritingAiAccess; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'polish', label: 'Only polish' },
  { value: 'chat', label: 'Only agent chat' },
  { value: 'full', label: 'Full' },
];

export const WRITING_AI_POLICY_OPTIONS: Array<{ value: WritingAiPolicyMode; label: string }> = [
  { value: 'off', label: 'Off' },
  { value: 'guard', label: 'Guard' },
];

export const normalizeWritingAiAccess = (value?: string | null): WritingAiAccess => {
  if (value === 'off' || value === 'polish' || value === 'chat' || value === 'full') {
    return value;
  }
  if (value === 'readonly') {
    return 'chat';
  }
  if (value === 'on') {
    return 'full';
  }
  return 'off';
};

export const formatWritingAiAccess = (value?: string | null): string => (
  WRITING_AI_ACCESS_OPTIONS.find((option) => option.value === normalizeWritingAiAccess(value))?.label || 'Off'
);

export const isWritingAiEnabled = (value?: string | null): boolean => (
  normalizeWritingAiAccess(value) !== 'off'
);

export const isWritingAiPolishEnabled = (value?: string | null): boolean => {
  const access = normalizeWritingAiAccess(value);
  return access === 'polish' || access === 'full';
};

export const isWritingAiChatEnabled = (value?: string | null): boolean => {
  const access = normalizeWritingAiAccess(value);
  return access === 'chat' || access === 'full';
};

export const normalizeWritingAiPolicyMode = (value?: string | null): WritingAiPolicyMode => (
  value === 'guard' ? 'guard' : 'off'
);

export const normalizeWritingAiPolicy = (
  value?: Partial<WritingAiPolicyConfig> | null
): WritingAiPolicyConfig => {
  const mode = normalizeWritingAiPolicyMode(value?.mode);
  const rejectionRule = typeof value?.rejectionRule === 'string'
    ? value.rejectionRule.trim()
    : '';

  return mode === 'guard'
    ? { mode, rejectionRule }
    : { mode: 'off' };
};

export const getWritingAiPolicyRejectionRuleInputValue = (
  value?: Partial<WritingAiPolicyConfig> | null
): string => (
  normalizeWritingAiPolicyMode(value?.mode) === 'guard' && typeof value?.rejectionRule === 'string'
    ? value.rejectionRule
    : ''
);

export const getEffectiveWritingAiPolicy = (
  config?: Pick<WritingEnvironmentConfig, 'aiAccess' | 'aiPolicy'> | null
): WritingAiPolicyConfig => {
  if (!config || !isWritingAiChatEnabled(config.aiAccess)) {
    return { mode: 'off' };
  }

  const policy = normalizeWritingAiPolicy(config.aiPolicy);
  return policy.mode === 'guard' && policy.rejectionRule
    ? policy
    : { mode: 'off' };
};

export const formatWritingAiPolicy = (
  config?: Pick<WritingEnvironmentConfig, 'aiAccess' | 'aiPolicy'> | null
): string => (
  getEffectiveWritingAiPolicy(config).mode === 'guard' ? 'Guard' : 'Off'
);

export const normalizeCopyPastePolicy = (policy?: string | null): CopyPastePolicy => (
  policy === 'blocked' ? 'blocked' : 'allowed'
);

export const normalizeResourceAccessPolicy = (policy?: string | null): ResourceAccessPolicy => (
  policy === 'view-only' ? 'view-only' : 'downloadable'
);

export const DEFAULT_WRITING_DETECTOR_CONFIG: WritingDetectorConfig = {
  anomalyPattern: { enabled: true },
  humanTyping: { enabled: true },
};

const normalizeDetectorToggle = (
  value: unknown,
  fallback: WritingDetectorToggle
): WritingDetectorToggle => {
  if (typeof value === 'boolean') {
    return { enabled: value };
  }

  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const enabled = (value as { enabled?: unknown }).enabled;
    if (typeof enabled === 'boolean') {
      return { enabled };
    }
  }

  return { ...fallback };
};

export const normalizeWritingDetectorConfig = (
  value?: Partial<WritingDetectorConfig> | null
): WritingDetectorConfig => ({
  anomalyPattern: normalizeDetectorToggle(value?.anomalyPattern, DEFAULT_WRITING_DETECTOR_CONFIG.anomalyPattern),
  humanTyping: normalizeDetectorToggle(value?.humanTyping, DEFAULT_WRITING_DETECTOR_CONFIG.humanTyping),
});

export const isAnomalyPatternDetectorEnabled = (
  config?: Pick<WritingEnvironmentConfig, 'detectors'> | null
): boolean => normalizeWritingDetectorConfig(config?.detectors).anomalyPattern.enabled;

export const isHumanTypingDetectorEnabled = (
  config?: Pick<WritingEnvironmentConfig, 'detectors'> | null
): boolean => normalizeWritingDetectorConfig(config?.detectors).humanTyping.enabled;

export const formatWritingDetectorConfig = (
  value?: Partial<WritingDetectorConfig> | null
): string => {
  const detectors = normalizeWritingDetectorConfig(value);
  const enabled = [
    detectors.anomalyPattern.enabled ? 'Anomaly Pattern' : null,
    detectors.humanTyping.enabled ? 'Humanly Typing Detector' : null,
  ].filter(Boolean);

  return enabled.length ? enabled.join(', ') : 'None enabled';
};

export const normalizeWritingAttemptPolicy = (
  value?: Partial<WritingAttemptPolicyConfig> | null
): WritingAttemptPolicyConfig => {
  if (value?.mode !== 'restart_allowed') {
    return { mode: 'single' };
  }

  const parsedMaxAttempts = Number(value.maxAttempts);
  const maxAttempts = Number.isFinite(parsedMaxAttempts)
    ? Math.max(2, Math.min(20, Math.floor(parsedMaxAttempts)))
    : 2;

  return {
    mode: 'restart_allowed',
    maxAttempts,
  };
};

export const isWritingRestartAllowed = (
  config?: Pick<WritingEnvironmentConfig, 'submission'> | null
): boolean => (
  normalizeWritingAttemptPolicy(config?.submission?.attemptPolicy).mode === 'restart_allowed'
);

export const getMaxWritingAttempts = (
  config?: Pick<WritingEnvironmentConfig, 'submission'> | null
): number => (
  normalizeWritingAttemptPolicy(config?.submission?.attemptPolicy).maxAttempts || 1
);

export const DEFAULT_WRITING_ENVIRONMENT_CONFIG: WritingEnvironmentConfig = {
  preset: 'default_writing',
  taskType: 'personal',
  instructions: {
    hasInstructionPdf: false,
    taskInstruction: '',
    editableAfterSubmission: true,
  },
  aiAccess: 'off',
  allowedModels: [],
  customModels: [],
  aiTokenBudget: {
    shortcutMaxTokens: 1024,
    chatMaxTokens: 4096,
  },
  aiPolicy: {
    mode: 'off',
  },
  aiUsageLimit: {
    mode: 'unlimited',
  },
  time: {
    lateSubmission: 'allowed',
  },
  submission: {
    mode: 'multiple',
    attemptPolicy: {
      mode: 'single',
    },
  },
  traceability: {
    trackAiUsage: false,
    trackTyping: true,
    trackCopyPaste: false,
    trackFocusBlur: true,
  },
  detectors: DEFAULT_WRITING_DETECTOR_CONFIG,
  resourceAccess: 'downloadable',
  copyPastePolicy: 'allowed',
};

export const WRITING_ENVIRONMENT_PRESETS: Record<WritingEnvironmentPreset, WritingEnvironmentConfig> = {
  default_writing: DEFAULT_WRITING_ENVIRONMENT_CONFIG,
  no_ai: {
    ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
    preset: 'no_ai',
    aiAccess: 'off',
    allowedModels: [],
    aiUsageLimit: { mode: 'unlimited' },
  },
  ai_assisted: {
    ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
    preset: 'ai_assisted',
    aiAccess: 'full',
    allowedModels: ['GPT-4.1', 'GPT-5'],
    aiUsageLimit: { mode: 'max_requests', maxRequests: 100 },
  },
  timed_writing: {
    ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
    preset: 'timed_writing',
    aiAccess: 'chat',
    aiUsageLimit: { mode: 'time_restricted' },
    time: {
      lateSubmission: 'not_allowed',
      timeLimitSeconds: 3600,
    },
  },
  custom: {
    ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
    preset: 'custom',
    aiAccess: 'off',
    allowedModels: [],
    copyPastePolicy: 'allowed',
  },
};

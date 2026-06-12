export type WritingTaskType = 'personal' | 'admin_assigned';
export type WritingAiAccess = 'off' | 'polish' | 'chat' | 'full';
export type LegacyWritingAiAccess = WritingAiAccess | 'readonly' | 'on';
export type WritingAiUsageLimitMode = 'unlimited' | 'max_requests' | 'max_tokens' | 'time_restricted';
export type WritingLateSubmissionPolicy = 'allowed' | 'not_allowed';
export type WritingSubmissionMode = 'single' | 'multiple';
export type CopyPastePolicy = 'allowed' | 'blocked';
export type ResourceAccessPolicy = 'downloadable' | 'view-only';
export type WritingEnvironmentPreset = 'default_writing' | 'no_ai' | 'ai_assisted' | 'timed_writing' | 'custom';
export type WritingAiProvider = 'together' | 'openrouter' | 'openai' | 'claude' | 'custom';

export interface WritingAiProviderConfig {
  provider: WritingAiProvider;
  baseUrl: string;
}

export interface WritingAiTokenBudget {
  shortcutMaxTokens?: number;
  chatMaxTokens?: number;
}

export interface WritingEnvironmentConfig {
  preset?: WritingEnvironmentPreset;
  taskType: WritingTaskType;
  description?: string;
  instructions: {
    hasInstructionPdf?: boolean;
    editableAfterSubmission: boolean;
  };
  aiAccess: WritingAiAccess;
  aiProvider?: WritingAiProviderConfig;
  allowedModels: string[];
  customModels?: string[];
  aiTokenBudget?: WritingAiTokenBudget;
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
  };
  traceability: {
    trackAiUsage: boolean;
    trackTyping: boolean;
    trackCopyPaste: boolean;
    trackFocusBlur: boolean;
  };
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

export const normalizeCopyPastePolicy = (policy?: string | null): CopyPastePolicy => (
  policy === 'blocked' ? 'blocked' : 'allowed'
);

export const normalizeResourceAccessPolicy = (policy?: string | null): ResourceAccessPolicy => (
  policy === 'view-only' ? 'view-only' : 'downloadable'
);

export const DEFAULT_WRITING_ENVIRONMENT_CONFIG: WritingEnvironmentConfig = {
  preset: 'default_writing',
  taskType: 'personal',
  instructions: {
    hasInstructionPdf: false,
    editableAfterSubmission: true,
  },
  aiAccess: 'off',
  allowedModels: [],
  customModels: [],
  aiTokenBudget: {
    shortcutMaxTokens: 1024,
    chatMaxTokens: 4096,
  },
  aiUsageLimit: {
    mode: 'unlimited',
  },
  time: {
    lateSubmission: 'allowed',
  },
  submission: {
    mode: 'multiple',
  },
  traceability: {
    trackAiUsage: false,
    trackTyping: true,
    trackCopyPaste: false,
    trackFocusBlur: true,
  },
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

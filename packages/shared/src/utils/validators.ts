import { z } from 'zod';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  EXTERNAL_SERVICE_TYPES,
  EVENT_TYPES,
  PAGINATION,
  SUBMISSION_MAX_CHARACTERS_MAX,
  SUBMISSION_MIN_CHARACTERS_MAX,
} from './constants';
import type {
  WritingAiAccess,
  WritingEnvironmentConfig,
  WritingTaskType,
} from '../types/environment.types';
import { normalizeWritingAiAccess } from '../types/environment.types';

export const TASK_START_DATE_PAST_GRACE_MS = 2 * 60 * 1000;
export const TASK_START_DATE_PAST_ERROR_MESSAGE = 'Task start date cannot be in the past.';

export const isTaskStartDateTooFarInPast = (
  startDate: Date | string | number,
  now: Date | string | number = new Date()
): boolean => {
  const startMs = new Date(startDate).getTime();
  const nowMs = new Date(now).getTime();

  if (!Number.isFinite(startMs) || !Number.isFinite(nowMs)) {
    return false;
  }

  return startMs < nowMs - TASK_START_DATE_PAST_GRACE_MS;
};

const writingSubmissionConfigSchema = z.object({
  mode: z.enum(['single', 'multiple']),
  minCharacters: z.number().int().min(1).max(SUBMISSION_MIN_CHARACTERS_MAX).optional(),
  maxCharacters: z.number().int().min(1).max(SUBMISSION_MAX_CHARACTERS_MAX).optional(),
}).refine((submission) => {
  if (!submission.minCharacters || !submission.maxCharacters) return true;
  return submission.minCharacters <= submission.maxCharacters;
}, {
  message: 'Maximum characters must be greater than or equal to minimum characters',
  path: ['maxCharacters'],
});

const writingAiAccessSchema = z.enum(['off', 'polish', 'chat', 'full', 'readonly', 'on'])
  .transform((value): WritingAiAccess => normalizeWritingAiAccess(value)) as z.ZodType<WritingAiAccess>;

export const writingEnvironmentConfigSchema = z.object({
  preset: z.enum(['default_writing', 'no_ai', 'ai_assisted', 'timed_writing', 'custom']).optional(),
  taskType: z.enum(['personal', 'admin_assigned']),
  description: z.string().max(1000).optional(),
  instructions: z.object({
    hasInstructionPdf: z.boolean().optional(),
    editableAfterSubmission: z.boolean(),
  }),
  aiAccess: writingAiAccessSchema,
  aiProvider: z.object({
    provider: z.enum(['together', 'openrouter', 'openai', 'claude', 'custom']),
    baseUrl: z.string().url(),
  }).optional(),
  allowedModels: z.array(z.string().min(1).max(100)).max(20),
  customModels: z.array(z.string().min(1).max(100)).max(20).optional(),
  aiTokenBudget: z.object({
    shortcutMaxTokens: z.number().int().min(256).max(16384).optional(),
    chatMaxTokens: z.number().int().min(256).max(16384).optional(),
  }).optional(),
  aiUsageLimit: z.object({
    mode: z.enum(['unlimited', 'max_requests', 'max_tokens', 'time_restricted']),
    maxRequests: z.number().int().positive().max(1000000).optional(),
    maxTokens: z.number().int().positive().max(10000000).optional(),
  }),
  time: z.object({
    startTime: z.string().optional(),
    endTime: z.string().optional(),
    timeLimitSeconds: z.number().int().positive().max(31536000).optional(),
    lateSubmission: z.enum(['allowed', 'not_allowed']),
  }),
  submission: writingSubmissionConfigSchema,
  traceability: z.object({
    trackAiUsage: z.boolean(),
    trackTyping: z.boolean(),
    trackCopyPaste: z.boolean(),
    trackFocusBlur: z.boolean(),
  }),
  resourceAccess: z.enum(['downloadable', 'view-only']).optional().default('downloadable'),
  copyPastePolicy: z.enum(['allowed', 'blocked']),
}).superRefine((config, ctx) => {
  if (config.aiProvider?.provider === 'custom') {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['aiProvider', 'provider'],
      message: 'Custom AI providers are temporarily disabled.',
    });
  }

  if ((config.customModels || []).length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['customModels'],
      message: 'Custom AI models are temporarily disabled.',
    });
  }
});

const hasOwn = (value: Record<string, unknown>, key: string) => (
  Object.prototype.hasOwnProperty.call(value, key)
);

const assertImportRecord = (value: unknown, path: string): Record<string, unknown> => {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${path} must be an object.`);
  }
  return value as Record<string, unknown>;
};

const assertRequiredImportKeys = (
  value: Record<string, unknown>,
  path: string,
  keys: string[],
) => {
  const missing = keys.filter((key) => !hasOwn(value, key));
  if (missing.length) {
    throw new Error(`${path} is incomplete. Missing: ${missing.join(', ')}.`);
  }
};

export const validateWritingEnvironmentImportTemplate = (
  value: unknown,
  expectedTaskType?: WritingTaskType,
): WritingEnvironmentConfig => {
  const root = assertImportRecord(value, 'Environment configuration');

  assertRequiredImportKeys(root, 'Environment configuration', [
    'taskType',
    'instructions',
    'aiAccess',
    'allowedModels',
    'customModels',
    'aiTokenBudget',
    'aiUsageLimit',
    'time',
    'submission',
    'traceability',
    'copyPastePolicy',
  ]);

  const instructions = assertImportRecord(root.instructions, 'instructions');
  assertRequiredImportKeys(instructions, 'instructions', [
    'hasInstructionPdf',
    'editableAfterSubmission',
  ]);

  const aiTokenBudget = assertImportRecord(root.aiTokenBudget, 'aiTokenBudget');
  assertRequiredImportKeys(aiTokenBudget, 'aiTokenBudget', [
    'shortcutMaxTokens',
    'chatMaxTokens',
  ]);

  const aiUsageLimit = assertImportRecord(root.aiUsageLimit, 'aiUsageLimit');
  assertRequiredImportKeys(aiUsageLimit, 'aiUsageLimit', ['mode']);
  if (aiUsageLimit.mode === 'max_requests') {
    assertRequiredImportKeys(aiUsageLimit, 'aiUsageLimit', ['maxRequests']);
  }
  if (aiUsageLimit.mode === 'max_tokens') {
    assertRequiredImportKeys(aiUsageLimit, 'aiUsageLimit', ['maxTokens']);
  }

  const time = assertImportRecord(root.time, 'time');
  assertRequiredImportKeys(time, 'time', ['lateSubmission']);
  if (aiUsageLimit.mode === 'time_restricted') {
    assertRequiredImportKeys(time, 'time', ['timeLimitSeconds']);
  }

  const submission = assertImportRecord(root.submission, 'submission');
  assertRequiredImportKeys(submission, 'submission', ['mode']);

  const traceability = assertImportRecord(root.traceability, 'traceability');
  assertRequiredImportKeys(traceability, 'traceability', [
    'trackAiUsage',
    'trackTyping',
    'trackCopyPaste',
    'trackFocusBlur',
  ]);

  const parsed = writingEnvironmentConfigSchema.parse(value);

  if (expectedTaskType && parsed.taskType !== expectedTaskType) {
    throw new Error(`Environment configuration taskType must be ${expectedTaskType}.`);
  }
  if (
    expectedTaskType === 'personal'
    && parsed.aiUsageLimit.mode !== 'unlimited'
    && parsed.aiUsageLimit.mode !== 'time_restricted'
  ) {
    throw new Error('Personal environment JSON must use aiUsageLimit.mode "unlimited" or "time_restricted".');
  }
  if (
    expectedTaskType === 'admin_assigned'
    && parsed.aiUsageLimit.mode !== 'max_requests'
  ) {
    throw new Error('Admin task environment JSON must use aiUsageLimit.mode "max_requests".');
  }

  const customModels = parsed.customModels || [];
  const hasModels = parsed.allowedModels.length > 0 || customModels.length > 0;

  if (parsed.aiAccess === 'off') {
    if (hasOwn(root, 'aiProvider')) {
      throw new Error('AI-off environment JSON must not include aiProvider.');
    }
    if (hasModels) {
      throw new Error('AI-off environment JSON must not include allowedModels or customModels.');
    }
    if (parsed.traceability.trackAiUsage) {
      throw new Error('AI-off environment JSON must set traceability.trackAiUsage to false.');
    }
  } else {
    const aiProvider = assertImportRecord(root.aiProvider, 'aiProvider');
    assertRequiredImportKeys(aiProvider, 'aiProvider', ['provider', 'baseUrl']);
    if (!hasModels) {
      throw new Error('AI-enabled environment JSON must include at least one allowed model.');
    }
    if (!parsed.traceability.trackAiUsage) {
      throw new Error('AI-enabled environment JSON must set traceability.trackAiUsage to true.');
    }
  }

  const expectedTrackCopyPaste = parsed.copyPastePolicy === 'allowed';
  if (parsed.traceability.trackCopyPaste !== expectedTrackCopyPaste) {
    throw new Error(
      `traceability.trackCopyPaste must be ${String(expectedTrackCopyPaste)} when copyPastePolicy is ${parsed.copyPastePolicy}.`
    );
  }

  return {
    ...parsed,
    customModels,
    resourceAccess: parsed.resourceAccess || 'downloadable',
  };
};

// User validators
export const emailSchema = z.string().email('Invalid email address');

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Password must be at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(PASSWORD_MAX_LENGTH, `Password must be at most ${PASSWORD_MAX_LENGTH} characters`);

export const registerSchema = z.object({
  email: emailSchema,
  password: passwordSchema,
  role: z.enum(['admin', 'user']).default('user'),
});

export const updateUserProfileSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(100, 'First name must be at most 100 characters'),
  lastName: z.string().trim().min(1, 'Last name is required').max(100, 'Last name must be at most 100 characters'),
});

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  role: z.enum(['admin', 'user']).optional(),
});

export const verifyEmailSchema = z.object({
  code: z.string().length(6, 'Verification code must be 6 digits').regex(/^\d{6}$/, 'Verification code must contain only digits'),
});

export const forgotPasswordSchema = z.object({
  email: emailSchema,
});

export const resetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: passwordSchema,
});

export const passwordResetTokenSchema = z.object({
  token: z.string().min(1, 'Token is required'),
});

// Task validators
export const createTaskSchema = z.object({
  name: z.string().min(1, 'Task name is required').max(255),
  description: z.string().max(1000).optional(),
  userIdKey: z.string().max(100).optional(),
  externalServiceType: z.enum(EXTERNAL_SERVICE_TYPES).optional(),
  externalServiceUrl: z.string().url().optional().or(z.literal('')),
  allowedLlmModels: z.array(z.string().min(1).max(100)).max(20).optional(),
  aiUsageLimit: z.number().int().positive().max(1000000).optional(),
  startDate: z.coerce.date(),
  endDate: z.coerce.date(),
  environmentConfig: writingEnvironmentConfigSchema.optional(),
  allowGuestSubmissions: z.boolean().optional(),
}).refine((data) => !isTaskStartDateTooFarInPast(data.startDate), {
  message: TASK_START_DATE_PAST_ERROR_MESSAGE,
  path: ['startDate'],
}).refine((data) => data.endDate > data.startDate, {
  message: 'Task end date must be after start date',
  path: ['endDate'],
});

export const updateTaskSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().max(1000).optional(),
  userIdKey: z.string().max(100).optional(),
  externalServiceType: z.enum(EXTERNAL_SERVICE_TYPES).optional(),
  externalServiceUrl: z.string().url().optional().or(z.literal('')),
  allowedLlmModels: z.array(z.string().min(1).max(100)).max(20).optional(),
  aiUsageLimit: z.number().int().positive().max(1000000).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  environmentConfig: writingEnvironmentConfigSchema.optional(),
  allowGuestSubmissions: z.boolean().optional(),
  isActive: z.boolean().optional(),
}).refine((data) => {
  if (!data.startDate || !data.endDate) return true;
  return data.endDate > data.startDate;
}, {
  message: 'Task end date must be after start date',
  path: ['endDate'],
});

// Tracking validators
export const initSessionSchema = z.object({
  externalUserId: z.string().min(1, 'External user ID is required').max(255),
  userAgent: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
});

export const trackerEventSchema = z.object({
  eventType: z.enum(EVENT_TYPES),
  // Accept timestamp as number (Date.now()), string (ISO datetime), or Date object
  timestamp: z.union([z.number(), z.string().datetime(), z.date()]),
  targetElement: z.string().max(255).optional(),
  // Accept keyCode as number (from KeyboardEvent.keyCode) or string
  keyCode: z.union([z.number(), z.string().max(50)]).optional(),
  keyChar: z.string().max(10).optional(),
  textBefore: z.string().optional(),
  textAfter: z.string().optional(),
  cursorPosition: z.number().int().nonnegative().optional(),
  selectionStart: z.number().int().nonnegative().optional(),
  selectionEnd: z.number().int().nonnegative().optional(),
  metadata: z.record(z.any()).optional(),
});

export const trackEventsSchema = z.object({
  events: z.array(trackerEventSchema).min(1).max(100),
});

// Analytics validators
export const analyticsQuerySchema = z.object({
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  userIds: z.array(z.string()).optional(),
  groupBy: z.enum(['hour', 'day', 'week']).optional(),
});

// Pagination validators
export const paginationSchema = z.object({
  page: z.number().int().positive().default(PAGINATION.DEFAULT_PAGE),
  limit: z
    .number()
    .int()
    .positive()
    .max(PAGINATION.MAX_LIMIT)
    .default(PAGINATION.DEFAULT_LIMIT),
});

// Export validators
export const exportQuerySchema = z.object({
  format: z.enum(['json', 'csv']).default('json'),
  startDate: z.string().datetime().optional(),
  endDate: z.string().datetime().optional(),
  sessionIds: z.array(z.string().uuid()).optional(),
  userIds: z.array(z.string()).optional(),
});

// Helper function to validate data
export function validate<T>(schema: z.ZodSchema<T>, data: unknown): T {
  return schema.parse(data);
}

// Helper function to safely validate data
export function safeValidate<T>(
  schema: z.ZodSchema<T>,
  data: unknown
): { success: true; data: T } | { success: false; error: z.ZodError } {
  const result = schema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

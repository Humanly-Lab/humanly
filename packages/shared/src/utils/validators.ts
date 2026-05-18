import { z } from 'zod';
import {
  PASSWORD_MIN_LENGTH,
  PASSWORD_MAX_LENGTH,
  EXTERNAL_SERVICE_TYPES,
  EVENT_TYPES,
  PAGINATION,
} from './constants';

const writingEnvironmentConfigSchema = z.object({
  preset: z.enum(['default_writing', 'no_ai', 'ai_assisted', 'timed_writing', 'custom']).optional(),
  taskType: z.enum(['personal', 'admin_assigned']),
  description: z.string().max(1000).optional(),
  instructions: z.object({
    hasInstructionPdf: z.boolean().optional(),
    editableAfterSubmission: z.boolean(),
  }),
  aiAccess: z.enum(['off', 'readonly', 'full']),
  allowedModels: z.array(z.string().min(1).max(100)).max(20),
  customModels: z.array(z.string().min(1).max(100)).max(20).optional(),
  aiTokenBudget: z.object({
    responseMaxTokens: z.number().int().min(256).max(16384).optional(),
    agentMaxTokens: z.number().int().min(256).max(16384).optional(),
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
  submission: z.object({
    mode: z.enum(['single', 'multiple']),
  }),
  traceability: z.object({
    trackAiUsage: z.boolean(),
    trackTyping: z.boolean(),
    trackCopyPaste: z.boolean(),
    trackFocusBlur: z.boolean(),
  }),
  copyPastePolicy: z.enum(['allowed', 'blocked']),
});

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

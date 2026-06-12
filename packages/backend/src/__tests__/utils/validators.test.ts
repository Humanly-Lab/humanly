import {
  createTaskSchema,
  DEFAULT_WRITING_ENVIRONMENT_CONFIG,
  TASK_START_DATE_PAST_ERROR_MESSAGE,
  SUBMISSION_MAX_CHARACTERS_MAX,
  SUBMISSION_MIN_CHARACTERS_MAX,
  validateWritingEnvironmentImportTemplate,
} from '@humanly/shared';

describe('writing environment validators', () => {
  const baseTaskPayload = {
    name: 'Minimum character task',
    startDate: new Date('2099-05-19T12:00:00.000Z'),
    endDate: new Date('2099-05-20T12:00:00.000Z'),
  };

  it('accepts optional minimum and maximum submission character counts', () => {
    const result = createTaskSchema.parse({
      ...baseTaskPayload,
      environmentConfig: {
        ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
        taskType: 'admin_assigned',
        submission: {
          mode: 'multiple',
          minCharacters: 1000,
          maxCharacters: 3000,
        },
      },
    });

    expect(result.environmentConfig?.submission.minCharacters).toBe(1000);
    expect(result.environmentConfig?.submission.maxCharacters).toBe(3000);
  });

  it('defaults optional screen and camera recording policy during environment import', () => {
    const legacyEnvironment = {
      ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
      taskType: 'admin_assigned',
      aiUsageLimit: {
        mode: 'max_requests',
        maxRequests: 100,
      },
      traceability: {
        trackAiUsage: false,
        trackTyping: true,
        trackCopyPaste: true,
        trackFocusBlur: true,
      },
    };

    const result = validateWritingEnvironmentImportTemplate(legacyEnvironment, 'admin_assigned');

    expect(result.traceability.requireScreenRecording).toBe(false);
    expect(result.traceability.requireCameraRecording).toBe(false);
  });

  it('rejects minimum submission character counts above the supported maximum', () => {
    expect(() => createTaskSchema.parse({
      ...baseTaskPayload,
      environmentConfig: {
        ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
        taskType: 'admin_assigned',
        submission: {
          mode: 'multiple',
          minCharacters: SUBMISSION_MIN_CHARACTERS_MAX + 1,
        },
      },
    })).toThrow();
  });

  it('rejects maximum submission character counts above the supported maximum', () => {
    expect(() => createTaskSchema.parse({
      ...baseTaskPayload,
      environmentConfig: {
        ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
        taskType: 'admin_assigned',
        submission: {
          mode: 'multiple',
          maxCharacters: SUBMISSION_MAX_CHARACTERS_MAX + 1,
        },
      },
    })).toThrow();
  });

  it('rejects submission character bounds where minimum is greater than maximum', () => {
    expect(() => createTaskSchema.parse({
      ...baseTaskPayload,
      environmentConfig: {
        ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
        taskType: 'admin_assigned',
        submission: {
          mode: 'multiple',
          minCharacters: 500,
          maxCharacters: 100,
        },
      },
    })).toThrow('Maximum characters must be greater than or equal to minimum characters');
  });

  it('rejects custom AI providers while the custom-provider UI is disabled', () => {
    expect(() => createTaskSchema.parse({
      ...baseTaskPayload,
      environmentConfig: {
        ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
        taskType: 'admin_assigned',
        aiAccess: 'full',
        aiProvider: {
          provider: 'custom',
          baseUrl: 'https://example.com/v1',
        },
        allowedModels: ['example-model'],
        traceability: {
          ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.traceability,
          trackAiUsage: true,
        },
      },
    })).toThrow('Custom AI providers are temporarily disabled.');
  });

  it('rejects custom AI models for provider-bound environments', () => {
    expect(() => createTaskSchema.parse({
      ...baseTaskPayload,
      environmentConfig: {
        ...DEFAULT_WRITING_ENVIRONMENT_CONFIG,
        taskType: 'admin_assigned',
        aiAccess: 'full',
        aiProvider: {
          provider: 'openai',
          baseUrl: 'https://api.openai.com/v1',
        },
        allowedModels: ['gpt-5.4-mini'],
        customModels: ['gpt-anything'],
        traceability: {
          ...DEFAULT_WRITING_ENVIRONMENT_CONFIG.traceability,
          trackAiUsage: true,
        },
      },
    })).toThrow('Custom AI models are temporarily disabled.');
  });
});

describe('task time window validators', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2026-06-02T12:00:00.000Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const baseTaskPayload = {
    name: 'Scheduled task',
    startDate: new Date('2026-06-02T12:00:00.000Z'),
    endDate: new Date('2026-06-03T12:00:00.000Z'),
  };

  it('rejects create task start dates outside the grace window', () => {
    expect(() => createTaskSchema.parse({
      ...baseTaskPayload,
      startDate: new Date('2026-06-02T11:57:59.000Z'),
      endDate: new Date('2026-06-03T12:00:00.000Z'),
    })).toThrow(TASK_START_DATE_PAST_ERROR_MESSAGE);
  });

  it('accepts create task start dates inside the two-minute grace window', () => {
    const result = createTaskSchema.parse({
      ...baseTaskPayload,
      startDate: new Date('2026-06-02T11:58:00.000Z'),
      endDate: new Date('2026-06-03T12:00:00.000Z'),
    });

    expect(result.startDate).toEqual(new Date('2026-06-02T11:58:00.000Z'));
  });

  it('still rejects task windows where end date is not after start date', () => {
    expect(() => createTaskSchema.parse({
      ...baseTaskPayload,
      startDate: new Date('2026-06-02T12:00:00.000Z'),
      endDate: new Date('2026-06-02T12:00:00.000Z'),
    })).toThrow('Task end date must be after start date');
  });
});

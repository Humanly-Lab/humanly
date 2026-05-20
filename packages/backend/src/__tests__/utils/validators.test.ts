import {
  createTaskSchema,
  DEFAULT_WRITING_ENVIRONMENT_CONFIG,
  SUBMISSION_MAX_CHARACTERS_MAX,
  SUBMISSION_MIN_CHARACTERS_MAX,
} from '@humanly/shared';

describe('writing environment validators', () => {
  const baseTaskPayload = {
    name: 'Minimum character task',
    startDate: new Date('2026-05-19T12:00:00.000Z'),
    endDate: new Date('2026-05-20T12:00:00.000Z'),
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
});

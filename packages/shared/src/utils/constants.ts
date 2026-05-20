export const JWT_ACCESS_EXPIRES = '15m';
export const JWT_REFRESH_EXPIRES = '7d';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const TASK_TOKEN_LENGTH = 64; // 32 bytes hex
export const SUBMISSION_CHARACTER_LIMIT_MAX = 1_000_000;
export const SUBMISSION_MIN_CHARACTERS_MAX = SUBMISSION_CHARACTER_LIMIT_MAX;
export const SUBMISSION_MAX_CHARACTERS_MAX = SUBMISSION_CHARACTER_LIMIT_MAX;

export const EVENT_BATCH_SIZE = 100;
export const EVENT_MAX_PAYLOAD_SIZE = 10240; // 10KB

export const RATE_LIMITS = {
  AUTH_LOGIN: {
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 5,
  },
  AUTH_REGISTER: {
    windowMs: 15 * 60 * 1000,
    max: 3,
  },
  TRACKING: {
    windowMs: 60 * 1000, // 1 minute
    max: 1000,
  },
  API_DEFAULT: {
    windowMs: 60 * 1000,
    max: 100,
  },
};

export const EXTERNAL_SERVICE_TYPES = [
  'qualtrics',
  'google-forms',
  'custom',
  'other',
] as const;

export const EVENT_TYPES = [
  'keydown',
  'keyup',
  'paste',
  'copy',
  'cut',
  'focus',
  'blur',
  'input',
] as const;

export const DEFAULT_USER_ID_KEY = 'userId';

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
};

export const CACHE_TTL = {
  ANALYTICS: 5 * 60, // 5 minutes
  TASK_STATS: 5 * 60,
};

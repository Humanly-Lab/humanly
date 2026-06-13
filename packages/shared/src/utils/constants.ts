export const JWT_ACCESS_EXPIRES = '15m';
export const JWT_REFRESH_EXPIRES = '7d';

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 128;

export const TASK_TOKEN_LENGTH = 64; // 32 bytes hex
export const TASK_NAME_MAX_LENGTH = 100;
export const TASK_DESCRIPTION_MAX_LENGTH = 1000;
export const TASK_INSTRUCTION_PDF_MAX_FILES = 3;
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
  'blocked_copy_paste_attempt',
  'contextmenu',
  'focus',
  'blur',
  'page_hidden',
  'page_visible',
  'input',
  'delete',
  'select',
  'font-family-change',
  'font-size-change',
  'text-color-change',
  'highlight-color-change',
  'bold',
  'italic',
  'underline',
  'strikethrough',
  'code',
  'subscript',
  'superscript',
  'heading-change',
  'list-create',
  'list-delete',
  'list-indent',
  'list-outdent',
  'list-item-check',
  'alignment-change',
  'find-open',
  'find-search',
  'find-next',
  'find-previous',
  'replace',
  'replace-all',
  'find-close',
  'line-spacing-change',
  'indent-change',
  'clear-formatting',
  'ai_panel_open',
  'ai_panel_close',
  'ai_query_sent',
  'ai_response_received',
  'ai_suggestion_shown',
  'ai_suggestion_accepted',
  'ai_suggestion_rejected',
  'ai_modification_applied',
  'ai_logs_viewed',
  'ai_logs_exported',
  'ai_selection_action',
  'ai_insert_from_chat',
  'ai_policy_refusal',
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

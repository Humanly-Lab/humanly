import OpenAI from 'openai';
import { AIModel, AIChatSessionMissingError } from '../models/ai.model';
import { AIChatAttachmentModel } from '../models/ai-chat-attachment.model';
import { resolveCapabilitiesOrSafeDefault } from './ai-model-capabilities';
import { DocumentModel } from '../models/document.model';
import { TaskModel } from '../models/task.model';
import { AIRetrievalService } from './ai-retrieval.service';
import {
  AIChatSession,
  AIChatMessage,
  AIChatRequest,
  AIChatResponse,
  AIInteractionLog,
  AILogQueryFilters,
  AIQueryType,
  AISuggestion,
  AIContentModification,
  AgentEvent,
  AI_ERROR_CODES,
  ChatAttachment,
  ModelCapabilities,
  AgentToolCallRecord,
  AI_CHAT_MAX_TOKENS_DEFAULT,
  AI_MAX_TOKENS_MAX,
  AI_MAX_TOKENS_MIN,
  AI_SHORTCUT_MAX_TOKENS_DEFAULT,
  WritingEnvironmentConfig,
} from '@humanly/shared';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { UserAISettingsModel } from '../models/user-ai-settings.model';
import { FileStorageService } from './file-storage.service';

/**
 * Optional callback that observes every step of the tool-calling loop.
 * The WebSocket layer wraps this to push `ai:turn-start` / `ai:tool-call`
 * / `ai:tool-result` / `ai:turn-end` frames out to the chat UI.
 *
 * Errors thrown by the sink are swallowed; observability must never break
 * the agent loop.
 */
export type AgentEventSink = (event: AgentEvent) => void;

function emitAgentEvent(sink: AgentEventSink | undefined, event: AgentEvent): void {
  if (!sink) return;
  try {
    sink(event);
  } catch (error) {
    logger.warn('AgentEventSink threw; ignoring', { error, eventType: event.type });
  }
}

/**
 * Collects `tool-call` / `tool-result` pairs off an AgentEvent stream so the
 * websocket handler's live frames and the persisted record on the assistant
 * message stay in sync. Issue #94: previously the timeline existed only in
 * the live WebSocket frames, so reopening or refreshing the chat lost the
 * agent trail.
 */
export class AgentToolCallCollector {
  private readonly inFlight = new Map<string, { record: AgentToolCallRecord; startMs: number }>();
  private readonly completed: AgentToolCallRecord[] = [];

  observe(event: AgentEvent): void {
    if (event.type === 'tool-call') {
      const startedAt = new Date();
      this.inFlight.set(event.toolCallId, {
        startMs: Date.now(),
        record: {
          toolCallId: event.toolCallId,
          toolName: event.toolName,
          args: event.args,
          startedAt: startedAt.toISOString(),
        },
      });
      return;
    }
    if (event.type === 'tool-result') {
      const pending = this.inFlight.get(event.toolCallId);
      if (!pending) {
        // tool-result without a paired tool-call — still record so the trail
        // is not silently dropped.
        this.completed.push({
          toolCallId: event.toolCallId,
          toolName: 'unknown',
          args: {},
          result: event.result,
          isError: event.isError,
          startedAt: new Date().toISOString(),
          completedAt: new Date().toISOString(),
          durationMs: event.durationMs,
        });
        return;
      }
      this.inFlight.delete(event.toolCallId);
      this.completed.push({
        ...pending.record,
        result: event.result,
        isError: event.isError,
        completedAt: new Date().toISOString(),
        durationMs: event.durationMs ?? Date.now() - pending.startMs,
      });
    }
  }

  /**
   * Finalize and return the collected records, preserving live ordering.
   * Any tool calls without a paired result (e.g. mid-turn abort) are still
   * surfaced with no `result` so the timeline shows what was attempted.
   */
  finalize(): AgentToolCallRecord[] {
    const orphans = Array.from(this.inFlight.values()).map(({ record }) => record);
    this.inFlight.clear();
    return [...this.completed, ...orphans];
  }
}

const THINK_OPEN_TAG = '<think>';
const THINK_CLOSE_TAG = '</think>';
const IMPLICIT_THINKING_MAX_CHARS = 4096;
const IMPLICIT_THINKING_MAX_CHUNKS = 24;

export interface ThinkingSplit {
  visible: string;
  thinking: string;
}

/**
 * Splits provider-exposed reasoning bytes away from visible answer text.
 *
 * Providers are not consistent here:
 * - OpenAI-compatible reasoning models may stream `delta.reasoning_content`.
 * - Qwen-style streams may put explicit `<think>...</think>` in content.
 * - DeepSeek-R1 on Together can omit the opening tag and later close with
 *   `</think>`. We hold a small likely-reasoning prefix until the close tag
 *   arrives, then emit it as thinking instead of leaking it into chat text.
 */
export class ThinkingContentSplitter {
  private inExplicitThinking = false;
  private implicitBuffer = '';
  private implicitChunks = 0;
  private canStartImplicit = true;

  push(content: string): ThinkingSplit {
    if (!content) return { visible: '', thinking: '' };
    return this.processContent(content);
  }

  pushReasoning(reasoning: string): ThinkingSplit {
    return { visible: '', thinking: reasoning || '' };
  }

  flush(): ThinkingSplit {
    if (!this.implicitBuffer) return { visible: '', thinking: '' };
    const visible = this.implicitBuffer;
    this.implicitBuffer = '';
    this.canStartImplicit = false;
    return { visible, thinking: '' };
  }

  private processContent(content: string): ThinkingSplit {
    let source = this.implicitBuffer + content;
    let visible = '';
    let thinking = '';
    this.implicitBuffer = '';

    while (source.length > 0) {
      if (this.inExplicitThinking) {
        const closeIndex = source.indexOf(THINK_CLOSE_TAG);
        if (closeIndex === -1) {
          thinking += source;
          source = '';
        } else {
          thinking += source.slice(0, closeIndex);
          source = source.slice(closeIndex + THINK_CLOSE_TAG.length);
          this.inExplicitThinking = false;
          this.canStartImplicit = false;
        }
        continue;
      }

      const openIndex = source.indexOf(THINK_OPEN_TAG);
      const closeIndex = source.indexOf(THINK_CLOSE_TAG);

      if (closeIndex !== -1 && (openIndex === -1 || closeIndex < openIndex)) {
        if (this.canStartImplicit) {
          thinking += source.slice(0, closeIndex);
          source = source.slice(closeIndex + THINK_CLOSE_TAG.length);
          this.canStartImplicit = false;
        } else {
          visible += source.slice(0, closeIndex);
          source = source.slice(closeIndex + THINK_CLOSE_TAG.length);
        }
        continue;
      }

      if (openIndex !== -1) {
        visible += source.slice(0, openIndex);
        source = source.slice(openIndex + THINK_OPEN_TAG.length);
        this.inExplicitThinking = true;
        continue;
      }

      if (this.shouldHoldForImplicitThinking(source)) {
        this.implicitBuffer = source;
        this.implicitChunks += 1;
        if (
          this.implicitBuffer.length > IMPLICIT_THINKING_MAX_CHARS ||
          this.implicitChunks > IMPLICIT_THINKING_MAX_CHUNKS
        ) {
          visible += this.implicitBuffer;
          this.implicitBuffer = '';
          this.canStartImplicit = false;
        }
      } else {
        visible += source;
        this.canStartImplicit = false;
      }
      source = '';
    }

    return { visible, thinking };
  }

  private shouldHoldForImplicitThinking(source: string): boolean {
    if (!this.canStartImplicit || this.implicitBuffer) return Boolean(this.implicitBuffer);
    const trimmed = source.trimStart().toLowerCase();
    if (!trimmed) return false;
    return /^(we need|we should|i need|i should|okay|ok,|alright|let's|the user|need to|first,|hmm|let me|i'll|i will)/.test(trimmed);
  }
}

function emitThinkingDelta(sink: AgentEventSink | undefined, text: string): void {
  if (!text) return;
  emitAgentEvent(sink, { type: 'thinking-delta', text });
}

function splitStaticThinking(content: string | null | undefined): ThinkingSplit {
  const splitter = new ThinkingContentSplitter();
  const first = splitter.push(content || '');
  const flushed = splitter.flush();
  return {
    visible: first.visible + flushed.visible,
    thinking: first.thinking + flushed.thinking,
  };
}

export function shouldRepairEmptyToolCallResponse(completion: any): boolean {
  const choice = completion?.choices?.[0];
  const finishReason = choice?.finish_reason;
  const toolCalls = choice?.message?.tool_calls;
  return (finishReason === 'tool_calls' || finishReason === 'function_call')
    && (!Array.isArray(toolCalls) || toolCalls.length === 0);
}

// Regexes for the common shapes of pseudo tool-call leaks observed in
// production traces. Some models, when they fail to emit a structured
// tool_calls payload, instead write the call as XML-ish prose in the
// visible content. Detect any of:
//   <tool_call> ... </tool_call>
//   <function=name> ... </function>
//   <parameter=foo>bar</parameter>
//   <tool_use> ... </tool_use>
//   <｜DSML｜tool_calls> ... </｜DSML｜tool_calls>
//   {"function":"ls","arguments":{...}}
// Anchors are loose on purpose so trailing whitespace / line breaks inside
// the markup also match. The /s flag lets `.` cross newlines.
const PSEUDO_TOOL_CALL_PATTERNS: RegExp[] = [
  /<\s*tool_call\b[^>]*>[\s\S]*?<\s*\/\s*tool_call\s*>/gi,
  /<\s*tool_use\b[^>]*>[\s\S]*?<\s*\/\s*tool_use\s*>/gi,
  /<\s*function\s*=\s*[^>]*>[\s\S]*?<\s*\/\s*function\s*>/gi,
  /<\s*parameter\s*=\s*[^>]*>[\s\S]*?<\s*\/\s*parameter\s*>/gi,
  /<\s*(?:\uFF5C\s*)?DSML\s*[\uFF5C|]\s*tool_calls\b[^>]*>[\s\S]*?<\s*\/\s*(?:\uFF5C\s*)?DSML\s*[\uFF5C|]\s*tool_calls\s*>/gi,
  /\{\s*"(?:function|name)"\s*:\s*"(?:ls|grep|read)"\s*,\s*"arguments"\s*:\s*\{(?:[^{}]|\{[^{}]*\})*\}\s*\}/gi,
];

const PSEUDO_TOOL_CALL_START_PATTERN =
  /<\s*(?:tool_call\b|tool_use\b|function\s*=|parameter\s*=|(?:\uFF5C\s*)?DSML\s*[\uFF5C|]\s*tool_calls\b)|\{\s*"(?:function|name)"\s*:\s*"(?:ls|grep|read)"\s*,\s*"arguments"\s*:/i;

function findPseudoToolCallStart(text: string): number {
  const match = PSEUDO_TOOL_CALL_START_PATTERN.exec(text);
  return match?.index ?? -1;
}

/** True if `text` contains any prose-encoded tool-call markup. */
export function containsPseudoToolCall(text: string | null | undefined): boolean {
  if (!text) return false;
  return PSEUDO_TOOL_CALL_PATTERNS.some((re) => {
    re.lastIndex = 0;
    return re.test(text);
  });
}

/**
 * Strip prose-encoded tool-call markup from a visible-text buffer so the
 * user never sees `<tool_call>...</tool_call>` in the chat. We always retry
 * the call on the agent loop side so the dropped markup is replaced with a
 * real structured call result, not silence.
 */
export function stripPseudoToolCallMarkup(text: string | null | undefined): string {
  if (!text) return '';
  let cleaned = text;
  for (const re of PSEUDO_TOOL_CALL_PATTERNS) {
    cleaned = cleaned.replace(re, '');
  }
  return cleaned.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

const QUICK_ACTION_FAILURE_PATTERNS: RegExp[] = [
  /i\s+could\s+not\s+produce\s+a\s+final\s+answer\s+from\s+the\s+available\s+context/i,
  /i\s+reached\s+the\s+retrieval\s+limit\s+before\s+the\s+model\s+produced\s+a\s+final\s+answer/i,
  /could\s+not\s+complete\s+retrieval\s+because\s+the\s+ai\s+provider\s+returned/i,
  /internal\s+(?:tool-call\s+repair|final-answer)\s+instruction/i,
  /can\s+only\s+read\s+reference\s+files/i,
  /use\s+the\s+selection-menu\s+quick\s+actions?/i,
];

export function normalizeQuickActionOutput(text: string | null | undefined): string {
  const cleaned = stripPseudoToolCallMarkup(text).trim().replace(/^["']|["']$/g, '');
  if (!cleaned) return '';
  if (containsPseudoToolCall(cleaned)) return '';
  const lower = cleaned.toLowerCase();
  if (
    lower.includes('i could not produce') &&
    lower.includes('final answer') &&
    lower.includes('available context')
  ) {
    return '';
  }
  if (QUICK_ACTION_FAILURE_PATTERNS.some((pattern) => pattern.test(cleaned))) return '';
  return cleaned;
}

export function normalizeAgentTimeoutDirectFallbackOutput(text: string | null | undefined): string {
  const cleaned = stripPseudoToolCallMarkup(text).trim();
  if (!cleaned || containsPseudoToolCall(cleaned)) return '';
  if (QUICK_ACTION_FAILURE_PATTERNS.some((pattern) => pattern.test(cleaned))) return '';
  if (/took longer than \d+ seconds and was stopped before it could finish/i.test(cleaned)) return '';
  const split = splitStaticThinking(cleaned);
  return split.visible.trim();
}

export class PseudoToolCallStreamFilter {
  private buffer = '';
  public strippedPseudoToolCall = false;

  push(chunk: string): string {
    if (!chunk) return '';
    this.buffer += chunk;
    return this.drain(false);
  }

  flush(): string {
    return this.drain(true);
  }

  private drain(flush: boolean): string {
    let visible = '';

    while (this.buffer) {
      const start = findPseudoToolCallStart(this.buffer);
      if (start === -1) {
        if (!flush) {
          const lastOpen = this.buffer.lastIndexOf('<');
          const lastJsonOpen = this.buffer.lastIndexOf('{');
          const holdFrom = [lastOpen, lastJsonOpen]
            .filter((index) => index >= 0 && this.buffer.length - index < 160)
            .sort((a, b) => a - b)[0];
          if (holdFrom !== undefined) {
            visible += this.buffer.slice(0, holdFrom);
            this.buffer = this.buffer.slice(holdFrom);
            return visible;
          }
        }

        visible += this.buffer;
        this.buffer = '';
        return visible;
      }

      if (start > 0) {
        visible += this.buffer.slice(0, start);
        this.buffer = this.buffer.slice(start);
        continue;
      }

      const stripped = stripPseudoToolCallMarkup(this.buffer);
      if (stripped !== this.buffer) {
        this.strippedPseudoToolCall = true;
        this.buffer = stripped;
        continue;
      }

      if (flush) {
        this.strippedPseudoToolCall = true;
        this.buffer = '';
      }
      return visible;
    }

    return visible;
  }
}

export function buildToolCallRepairPrompt(documentId: string): string {
  return `Internal tool-call repair instruction:
The previous model response attempted a tool call but did not include a valid structured tool_calls payload. Do not answer from memory.

Retry by emitting exactly one or more valid tool calls using JSON arguments.
- Current documentId is "${documentId}" and is already scoped by the backend. Do not pass it as a tool argument.
- Available tools are exactly: ls, grep, read.
- Start with ls using {} to discover readable file ids and file-size metadata.
- Use grep with {"file":"<file id from ls>","pattern":"...","context_before":2,"context_after":4} for targeted lookup.
- Use read with {"file":"<file id from ls>","offset":1,"limit":80} when grep is not enough or you need nearby context.
Do not write XML, DSML, pseudo-tags, or prose tool calls.`;
}

export function buildFinalAnswerSynthesisPrompt(reason: string): string {
  return `Internal final-answer instruction:
Retrieval is stopping now because ${reason}. Do not call any more tools.

Use only the conversation and tool results already available above. Produce the best possible user-facing answer:
- answer the user's original question when the gathered evidence is enough;
- cite page numbers or document sources when they appear in the tool results;
- explicitly say what evidence is missing or uncertain;
- if no relevant evidence was found, say that clearly;
- mention briefly that retrieval was cut short only if that affects confidence.

Never return an empty answer.`;
}

function appendToolBudgetNotice(output: string, remainingToolCalls: number, maxToolCalls: number): string {
  return [
    output,
    '',
    `[Tool budget: ${remainingToolCalls} of ${maxToolCalls} tool calls remaining. If you have enough evidence to answer the user's question, stop calling tools and produce the final answer.]`,
  ].join('\n');
}

function normalizeAgentMaxToolCalls(value: number | undefined): number {
  if (!Number.isFinite(value) || !value) return 60;
  return Math.max(1, Math.min(Math.floor(value), 100));
}

export function normalizeProviderTimeoutMs(value: number | undefined): number {
  if (!Number.isFinite(value) || !value) return 180000;
  return Math.max(5000, Math.min(Math.floor(value), 300000));
}

export function buildProviderTimeoutFallback(timeoutMs: number): string {
  return `The AI request took longer than ${Math.round(timeoutMs / 1000)} seconds and was stopped before it could finish. Please try again with a narrower question.`;
}

const NO_REFERENCE_FILES_CHAT_RESPONSE = [
  'This document does not have any linked reference files yet.',
  'I can answer from text you paste into this chat, and I can help rewrite selected editor text through the selection quick actions, but I cannot inspect your editor draft or cite a PDF until a reference file is uploaded or linked.',
].join(' ');

const REFERENCE_AVAILABILITY_TERMS = [
  'reference',
  'references',
  'pdf',
  'file',
  'files',
  'source',
  'sources',
  'context',
  'linked',
  'uploaded',
  'attached',
  'document',
  'paper',
  'syllabus',
  'reading',
  'readings',
];

function shouldPreflightReferenceAvailability(
  message: string,
  queryType: AIQueryType,
  questionCategory: AIQuestionCategory,
): boolean {
  const lower = message.toLowerCase();
  if (queryType === 'reference' || questionCategory === 'understanding') return true;
  if (lower.includes('?')) return true;
  return REFERENCE_AVAILABILITY_TERMS.some(term => lower.includes(term));
}

const RETRYABLE_PROVIDER_STATUSES = new Set([408, 409, 425, 429, 500, 502, 503, 504]);
const PROVIDER_RETRY_ATTEMPTS = 2;
const PROVIDER_RETRY_BASE_DELAY_MS = 250;
const DIRECT_TIMEOUT_FALLBACK_MS = 45000;

async function withAIProviderTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  onTimeout: () => T
): Promise<{ value: T; timedOut: boolean }> {
  let timeout: NodeJS.Timeout | undefined;
  const timeoutPromise = new Promise<{ value: T; timedOut: boolean }>((resolve) => {
    timeout = setTimeout(() => {
      resolve({ value: onTimeout(), timedOut: true });
    }, timeoutMs);
  });

  try {
    return await Promise.race([
      operation.then(value => ({ value, timedOut: false })),
      timeoutPromise,
    ]);
  } finally {
    if (timeout) clearTimeout(timeout);
  }
}

function getProviderErrorStatus(error: unknown): number | undefined {
  const sdkError = error as any;
  return typeof sdkError?.status === 'number' ? sdkError.status : undefined;
}

function getProviderErrorDetail(error: unknown): string {
  const sdkError = error as any;
  return sdkError?.error?.message || sdkError?.message || '';
}

function getProviderErrorName(error: unknown): string {
  const sdkError = error as any;
  return sdkError?.name || sdkError?.constructor?.name || '';
}

function isRetryableProviderError(error: unknown): boolean {
  const status = getProviderErrorStatus(error);
  if (status && RETRYABLE_PROVIDER_STATUSES.has(status)) {
    return true;
  }

  const detail = getProviderErrorDetail(error);
  const errorName = getProviderErrorName(error);
  return (
    errorName === 'APIConnectionError'
    || errorName === 'APIConnectionTimeoutError'
    || errorName === 'TimeoutError'
    || /ECONNRESET|ECONNREFUSED|ETIMEDOUT|ENOTFOUND|network|socket|temporar(?:y|ily)|timed?\s*out|timeout/i.test(detail)
  );
}

function providerRetryDelayMs(attemptIndex: number): number {
  if (env.nodeEnv === 'test') {
    return 0;
  }
  const jitter = Math.floor(Math.random() * 100);
  return (PROVIDER_RETRY_BASE_DELAY_MS * (2 ** attemptIndex)) + jitter;
}

async function sleep(ms: number): Promise<void> {
  if (ms <= 0) return;
  await new Promise(resolve => setTimeout(resolve, ms));
}

interface AgentChatOptions {
  userId: string;
  documentId: string;
  maxTokens?: number;
  disableThinking?: boolean;
  onAgentEvent?: AgentEventSink;
}

/**
 * AI Provider interface for different AI backends
 */
interface AIProvider {
  agentChat(
    messages: { role: string; content: string }[],
    options: AgentChatOptions
  ): Promise<{
    content: string;
    tokensUsed?: { input: number; output: number };
  }>;

  agentStreamChat(
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    options: AgentChatOptions
  ): Promise<{
    content: string;
    tokensUsed?: { input: number; output: number };
  }>;

  directStreamChat(
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    options: AgentChatOptions
  ): Promise<{
    content: string;
    tokensUsed?: { input: number; output: number };
  }>;
}

interface AIExecutionSettings {
  provider: AIProvider;
  modelVersion: string;
  shortcutMaxTokens: number;
  chatMaxTokens: number;
  /**
   * Raw provider base URL. Used by capability gating (#93) to look up the
   * resolved model's input modalities so the websocket layer can refuse
   * IMAGE_NOT_SUPPORTED requests before dispatching to the provider.
   */
  baseUrl: string;
}

function normalizeConfiguredMaxTokens(value: unknown, fallback: number): number {
  const parsed = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(AI_MAX_TOKENS_MAX, Math.max(AI_MAX_TOKENS_MIN, Math.round(parsed)));
}

function readConfiguredTokenBudget(
  budget: WritingEnvironmentConfig['aiTokenBudget'] | null | undefined,
  key: 'shortcutMaxTokens' | 'chatMaxTokens',
): unknown {
  if (!budget) return undefined;
  const rawBudget = budget as Record<string, unknown>;
  if (key === 'shortcutMaxTokens') {
    return rawBudget.shortcutMaxTokens ?? rawBudget.responseMaxTokens;
  }
  return rawBudget.chatMaxTokens ?? rawBudget.agentMaxTokens;
}

function resolveEffectiveTokenBudget(
  settings: { shortcutMaxTokens?: number; chatMaxTokens?: number },
  environmentConfig?: WritingEnvironmentConfig | null,
): { shortcutMaxTokens: number; chatMaxTokens: number } {
  const shortcutFallback = normalizeConfiguredMaxTokens(
    settings.shortcutMaxTokens,
    AI_SHORTCUT_MAX_TOKENS_DEFAULT,
  );
  const chatFallback = normalizeConfiguredMaxTokens(
    settings.chatMaxTokens,
    AI_CHAT_MAX_TOKENS_DEFAULT,
  );

  return {
    shortcutMaxTokens: normalizeConfiguredMaxTokens(
      readConfiguredTokenBudget(environmentConfig?.aiTokenBudget, 'shortcutMaxTokens'),
      shortcutFallback,
    ),
    chatMaxTokens: normalizeConfiguredMaxTokens(
      readConfiguredTokenBudget(environmentConfig?.aiTokenBudget, 'chatMaxTokens'),
      chatFallback,
    ),
  };
}

/**
 * OpenAI-compatible provider implementation.
 *
 * Together AI is the default compatible backend. Official OpenAI uses the
 * Responses API path; Together and other compatible providers use Chat
 * Completions with tool calls.
 */
class OpenAIProvider implements AIProvider {
  private apiKey: string;
  private model: string;
  private baseUrl: string;
  private maxToolCalls: number;
  private providerTimeoutMs: number;
  private client: OpenAI;

  constructor(config?: { apiKey: string; model: string; baseUrl: string; maxToolCalls?: number }) {
    this.apiKey = config?.apiKey || env.aiApiKey || '';
    this.model = config?.model || env.aiModel || 'moonshotai/Kimi-K2.6';
    this.baseUrl = config?.baseUrl || env.aiBaseUrl || 'https://api.together.xyz/v1';
    this.maxToolCalls = normalizeAgentMaxToolCalls(config?.maxToolCalls ?? env.aiAgentMaxToolCalls);
    this.providerTimeoutMs = normalizeProviderTimeoutMs(env.aiProviderTimeoutMs);
    this.client = new OpenAI({
      apiKey: this.apiKey || 'missing-api-key',
      baseURL: this.baseUrl,
      timeout: this.providerTimeoutMs,
      maxRetries: 0,
    });
  }

  private requestOptions(): { timeout: number; maxRetries: number } {
    return {
      timeout: this.providerTimeoutMs,
      maxRetries: 0,
    };
  }

  private supportsOpenRouterReasoningToggle(): boolean {
    return this.baseUrl.includes('openrouter.ai');
  }

  private disableThinkingParams(options: AgentChatOptions): Record<string, unknown> {
    if (!options.disableThinking) return {};

    return {
      ...(this.supportsChatTemplateThinkingToggle()
        ? { chat_template_kwargs: { enable_thinking: false } }
        : {}),
      ...(this.supportsOpenRouterReasoningToggle()
        ? { reasoning: { effort: 'none' } }
        : {}),
    };
  }

  private async withProviderRetry<T>(
    label: string,
    options: AgentChatOptions,
    operation: () => Promise<T>
  ): Promise<T> {
    let lastError: unknown;

    for (let attempt = 0; attempt <= PROVIDER_RETRY_ATTEMPTS; attempt += 1) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        if (!isRetryableProviderError(error) || attempt >= PROVIDER_RETRY_ATTEMPTS) {
          break;
        }

        const delayMs = providerRetryDelayMs(attempt);
        logger.warn('Retrying transient AI provider error', {
          userId: options.userId,
          documentId: options.documentId,
          model: this.model,
          baseUrl: this.baseUrl,
          label,
          attempt: attempt + 1,
          nextAttempt: attempt + 2,
          maxAttempts: PROVIDER_RETRY_ATTEMPTS + 1,
          status: getProviderErrorStatus(error),
          errorName: getProviderErrorName(error),
          delayMs,
        });
        await sleep(delayMs);
      }
    }

    this.handleSDKError(lastError);
  }

  async agentChat(
    messages: { role: string; content: string }[],
    options: AgentChatOptions
  ): Promise<{ content: string; tokensUsed?: { input: number; output: number } }> {
    if (!this.apiKey) {
      throw new AppError(500, 'AI service not configured');
    }

    if (!this.baseUrl.includes('api.openai.com')) {
      return this.agentChatCompletions(messages, options);
    }

    const input: any[] = messages.map(message => ({
      role: message.role === 'system' ? 'developer' : message.role,
      content: message.content,
    }));

    let response: any;
    let toolCallsUsed = 0;
    let turnIndex = 0;
    while (toolCallsUsed < this.maxToolCalls) {
      emitAgentEvent(options.onAgentEvent, { type: 'turn-start', turnIndex });
      response = await this.withProviderRetry('responses.agent', options, () =>
        this.client.responses.create({
          model: this.model,
          input,
          instructions: buildRetrievalInstructions(options.documentId),
          tools: AIRetrievalService.tools,
          max_output_tokens: options.maxTokens || 2048,
          parallel_tool_calls: true,
        }, this.requestOptions())
      );

      const toolCalls = response.output?.filter((item: any) => item.type === 'function_call') || [];
      if (toolCalls.length === 0) {
        logger.info('AI agent completed without additional tool calls', {
          userId: options.userId,
          documentId: options.documentId,
          iteration: turnIndex + 1,
        });
        const split = splitStaticThinking(response.output_text || '');
        emitThinkingDelta(options.onAgentEvent, split.thinking);
        emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex });
        return {
          content: split.visible.trim() || 'I could not produce a final answer from the available context.',
          tokensUsed: response.usage ? {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          } : undefined,
        };
      }

      if (toolCallsUsed + toolCalls.length > this.maxToolCalls) {
        logger.warn('AI Responses agent requested more tools than the remaining tool budget', {
          userId: options.userId,
          documentId: options.documentId,
          iteration: turnIndex + 1,
          requestedTools: toolCalls.length,
          toolCallsUsed,
          maxToolCalls: this.maxToolCalls,
        });
        emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex });
        return this.finalizeResponsesCompletion(
          input,
          `the maximum of ${this.maxToolCalls} tool calls would be exceeded`,
          options,
          response
        );
      }

      logger.info('AI agent requested retrieval tools', {
        userId: options.userId,
        documentId: options.documentId,
        iteration: turnIndex + 1,
        tools: toolCalls.map((toolCall: any) => toolCall.name),
      });

      input.push(...response.output);
      for (const toolCall of toolCalls) {
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(toolCall.arguments || '{}');
        } catch {
          args = { _raw: toolCall.arguments };
        }
        emitAgentEvent(options.onAgentEvent, {
          type: 'tool-call',
          toolCallId: toolCall.call_id,
          toolName: toolCall.name,
          args,
        });

        const toolStartedAt = Date.now();
        let output: string;
        let isError = false;
        try {
          output = await AIRetrievalService.executeTool(
            options.userId,
            options.documentId,
            toolCall.name,
            args
          );
        } catch (error) {
          isError = true;
          output = JSON.stringify({
            error: error instanceof Error ? error.message : 'Tool execution failed',
          });
        }

        logger.info('AI agent retrieval tool completed', {
          userId: options.userId,
          documentId: options.documentId,
          tool: toolCall.name,
          outputBytes: output.length,
        });

        emitAgentEvent(options.onAgentEvent, {
          type: 'tool-result',
          toolCallId: toolCall.call_id,
          result: output,
          isError,
          durationMs: Date.now() - toolStartedAt,
        });

        toolCallsUsed += 1;
        input.push({
          type: 'function_call_output',
          call_id: toolCall.call_id,
          output: appendToolBudgetNotice(output, this.maxToolCalls - toolCallsUsed, this.maxToolCalls),
        });
      }
      emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex });
      turnIndex += 1;
    }

    return this.finalizeResponsesCompletion(
      input,
      `the maximum of ${this.maxToolCalls} tool calls was reached`,
      options,
      response
    );
  }

  async agentStreamChat(
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    options: AgentChatOptions
  ): Promise<{ content: string; tokensUsed?: { input: number; output: number } }> {
    if (!this.apiKey) {
      throw new AppError(500, 'AI service not configured');
    }

    if (!this.baseUrl.includes('api.openai.com')) {
      return this.agentStreamChatCompletions(messages, onChunk, options);
    }

    // The official OpenAI Responses path remains retrieval-capable. It falls
    // back to complete-response delivery until Responses streaming is wired in.
    const response = await this.agentChat(messages, options);
    if (response.content) {
      onChunk(response.content);
    }
    return response;
  }

  async directStreamChat(
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    options: AgentChatOptions
  ): Promise<{ content: string; tokensUsed?: { input: number; output: number } }> {
    if (!this.apiKey) {
      throw new AppError(500, 'AI service not configured');
    }

    const content = await this.streamFinalChatCompletion(messages, onChunk, options);
    return { content };
  }

  private buildChatCompletionMessages(
    messages: { role: string; content: string }[],
    documentId: string
  ): any[] {
    const systemMessages = messages
      .filter(message => message.role === 'system')
      .map(message => message.content)
      .filter(Boolean);
    const nonSystemMessages = messages
      .filter(message => message.role !== 'system')
      .map(message => ({
        role: message.role,
        content: message.content,
      }));

    return [
      {
        role: 'system',
        content: [
          buildRetrievalInstructions(documentId),
          ...systemMessages,
        ].join('\n\n'),
      },
      ...nonSystemMessages,
    ];
  }

  private async finalizeResponsesCompletion(
    input: any[],
    reason: string,
    options: AgentChatOptions,
    previousResponse?: any
  ): Promise<{ content: string; tokensUsed?: { input: number; output: number } }> {
    logger.warn('AI Responses agent finalizing after retrieval budget guard', {
      userId: options.userId,
      documentId: options.documentId,
      reason,
    });

    let response: any;
    response = await this.withProviderRetry('responses.finalize', options, () =>
      this.client.responses.create({
        model: this.model,
        input: [
          ...input,
          { role: 'user', content: buildFinalAnswerSynthesisPrompt(reason) },
        ],
        max_output_tokens: options.maxTokens || 2048,
      }, this.requestOptions())
    );

    const split = splitStaticThinking(response.output_text || '');
    emitThinkingDelta(options.onAgentEvent, split.thinking);
    const content = split.visible.trim()
      || 'I reached the retrieval limit before the model produced a final answer, and I could not synthesize a reliable answer from the retrieved evidence.';
    const usage = response.usage || previousResponse?.usage;

    return {
      content,
      tokensUsed: usage ? {
        input: usage.input_tokens,
        output: usage.output_tokens,
      } : undefined,
    };
  }

  private buildChatCompletionTools() {
    return AIRetrievalService.tools.map(tool => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description || '',
        parameters: tool.parameters || {},
        strict: tool.strict ?? true,
      },
    }));
  }

  private async agentChatCompletions(
    messages: { role: string; content: string }[],
    options: AgentChatOptions
  ): Promise<{ content: string; tokensUsed?: { input: number; output: number } }> {
    const chatTools = this.buildChatCompletionTools();
    const chatMessages = this.buildChatCompletionMessages(messages, options.documentId);

    let lastUsage: { input: number; output: number } | undefined;
    let emptyToolCallRepairAttempts = 0;
    let toolCallsUsed = 0;
    let turnIndex = 0;

    while (toolCallsUsed < this.maxToolCalls) {
      emitAgentEvent(options.onAgentEvent, { type: 'turn-start', turnIndex });
      let completion: any;
      completion = await this.withProviderRetry('chat.agent', options, () =>
        this.client.chat.completions.create({
          model: this.model,
          messages: chatMessages,
          tools: chatTools,
          tool_choice: 'auto',
          max_tokens: options.maxTokens || 2048,
          ...(this.supportsChatTemplateThinkingToggle()
            ? { chat_template_kwargs: { enable_thinking: false } }
            : {}),
        } as any, this.requestOptions() as any)
      );

      lastUsage = completion.usage ? {
        input: completion.usage.prompt_tokens,
        output: completion.usage.completion_tokens,
      } : lastUsage;

      const assistantMessage = completion.choices?.[0]?.message || {};
      emitThinkingDelta(options.onAgentEvent, assistantMessage.reasoning_content || assistantMessage.reasoning || '');
      const toolCalls = assistantMessage.tool_calls || [];
      if (toolCalls.length === 0) {
        if (shouldRepairEmptyToolCallResponse(completion)) {
          if (emptyToolCallRepairAttempts < 1) {
            emptyToolCallRepairAttempts += 1;
            logger.warn('AI agent received empty tool-call finish; retrying with repair instruction', {
              userId: options.userId,
              documentId: options.documentId,
              iteration: turnIndex + 1,
              transport: 'chat_completions',
            });
            emitThinkingDelta(options.onAgentEvent, 'Retrying retrieval because the provider returned an empty tool-call response.');
            chatMessages.push({ role: 'user', content: buildToolCallRepairPrompt(options.documentId) });
            emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex });
            turnIndex += 1;
            continue;
          }

          logger.warn('AI agent empty tool-call repair failed', {
            userId: options.userId,
            documentId: options.documentId,
            iteration: turnIndex + 1,
            transport: 'chat_completions',
          });
          emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex });
          return {
            content: 'I could not complete retrieval because the AI provider returned an invalid empty tool-call response.',
            tokensUsed: lastUsage,
          };
        }

        logger.info('AI agent completed without additional tool calls', {
          userId: options.userId,
          documentId: options.documentId,
          iteration: turnIndex + 1,
          transport: 'chat_completions',
        });
        const split = splitStaticThinking(assistantMessage.content || '');
        emitThinkingDelta(options.onAgentEvent, split.thinking);
        let visible = split.visible;
        if (containsPseudoToolCall(visible)) {
          // Bug C: model tried to fake a tool call in prose instead of via
          // the structured tool_calls payload. Strip the markup, then
          // trigger ONE repair retry on the same loop using the existing
          // empty-tool-call repair prompt — it already tells the model to
          // emit structured calls and never write pseudo-tags.
          logger.warn('AI agent stripped pseudo tool-call markup from non-stream final', {
            userId: options.userId,
            documentId: options.documentId,
            iteration: turnIndex + 1,
            transport: 'chat_completions',
          });
          if (emptyToolCallRepairAttempts < 1) {
            emptyToolCallRepairAttempts += 1;
            chatMessages.push({ role: 'user', content: buildToolCallRepairPrompt(options.documentId) });
            emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex });
            turnIndex += 1;
            continue;
          }
          visible = stripPseudoToolCallMarkup(visible);
        }
        emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex });
        return {
          content: visible.trim() || 'I could not produce a final answer from the available context.',
          tokensUsed: lastUsage,
        };
      }

      if (toolCallsUsed + toolCalls.length > this.maxToolCalls) {
        logger.warn('AI agent requested more tools than the remaining tool budget', {
          userId: options.userId,
          documentId: options.documentId,
          iteration: turnIndex + 1,
          transport: 'chat_completions',
          requestedTools: toolCalls.length,
          toolCallsUsed,
          maxToolCalls: this.maxToolCalls,
        });
        emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex });
        return this.finalizeChatCompletion(
          chatMessages,
          `the maximum of ${this.maxToolCalls} tool calls would be exceeded`,
          options,
          lastUsage
        );
      }

      logger.info('AI agent requested retrieval tools', {
        userId: options.userId,
        documentId: options.documentId,
        iteration: turnIndex + 1,
        transport: 'chat_completions',
        tools: toolCalls.map((toolCall: any) => toolCall.function?.name),
      });

      if (assistantMessage.content) {
        const split = splitStaticThinking(assistantMessage.content);
        emitThinkingDelta(options.onAgentEvent, split.thinking);
        chatMessages.push({
          ...assistantMessage,
          content: split.visible || null,
        });
      } else {
        chatMessages.push(assistantMessage);
      }
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name;
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(toolCall.function?.arguments || '{}');
        } catch {
          args = { _raw: toolCall.function?.arguments };
        }
        emitAgentEvent(options.onAgentEvent, {
          type: 'tool-call',
          toolCallId: toolCall.id,
          toolName,
          args,
        });

        const toolStartedAt = Date.now();
        let output: string;
        let isError = false;
        try {
          output = await AIRetrievalService.executeTool(
            options.userId,
            options.documentId,
            toolName,
            args
          );
        } catch (error) {
          isError = true;
          output = JSON.stringify({
            error: error instanceof Error ? error.message : 'Tool execution failed',
          });
        }

        logger.info('AI agent retrieval tool completed', {
          userId: options.userId,
          documentId: options.documentId,
          transport: 'chat_completions',
          tool: toolName,
          outputBytes: output.length,
        });

        emitAgentEvent(options.onAgentEvent, {
          type: 'tool-result',
          toolCallId: toolCall.id,
          result: output,
          isError,
          durationMs: Date.now() - toolStartedAt,
        });

        toolCallsUsed += 1;
        chatMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: appendToolBudgetNotice(output, this.maxToolCalls - toolCallsUsed, this.maxToolCalls),
        });
      }
      emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex });
      turnIndex += 1;
    }

    return this.finalizeChatCompletion(
      chatMessages,
      `the maximum of ${this.maxToolCalls} tool calls was reached`,
      options,
      lastUsage
    );
  }

  private async agentStreamChatCompletions(
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    options: AgentChatOptions
  ): Promise<{ content: string; tokensUsed?: { input: number; output: number } }> {
    const chatTools = this.buildChatCompletionTools();
    const chatMessages = this.buildChatCompletionMessages(messages, options.documentId);
    let lastUsage: { input: number; output: number } | undefined;
    let emptyToolCallRepairAttempts = 0;
    let toolCallsUsed = 0;
    let turnIndex = 0;

    while (toolCallsUsed < this.maxToolCalls) {
      emitAgentEvent(options.onAgentEvent, { type: 'turn-start', turnIndex });
      let completion: any;
      completion = await this.withProviderRetry('chat.stream-agent', options, () =>
        this.client.chat.completions.create({
          model: this.model,
          messages: chatMessages,
          tools: chatTools,
          tool_choice: 'auto',
          max_tokens: options.maxTokens || 2048,
          ...(this.supportsChatTemplateThinkingToggle()
            ? { chat_template_kwargs: { enable_thinking: false } }
            : {}),
        } as any, this.requestOptions() as any)
      );

      lastUsage = completion.usage ? {
        input: completion.usage.prompt_tokens,
        output: completion.usage.completion_tokens,
      } : lastUsage;

      const assistantMessage = completion.choices?.[0]?.message || {};
      emitThinkingDelta(options.onAgentEvent, assistantMessage.reasoning_content || assistantMessage.reasoning || '');
      const toolCalls = assistantMessage.tool_calls || [];
      if (toolCalls.length === 0) {
        if (shouldRepairEmptyToolCallResponse(completion)) {
          if (emptyToolCallRepairAttempts < 1) {
            emptyToolCallRepairAttempts += 1;
            logger.warn('AI agent received empty tool-call finish; retrying with repair instruction', {
              userId: options.userId,
              documentId: options.documentId,
              iteration: turnIndex + 1,
              transport: 'chat_completions',
            });
            emitThinkingDelta(options.onAgentEvent, 'Retrying retrieval because the provider returned an empty tool-call response.');
            chatMessages.push({ role: 'user', content: buildToolCallRepairPrompt(options.documentId) });
            emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex });
            turnIndex += 1;
            continue;
          }

          logger.warn('AI agent empty tool-call repair failed', {
            userId: options.userId,
            documentId: options.documentId,
            iteration: turnIndex + 1,
            transport: 'chat_completions',
          });
          const fallback = 'I could not complete retrieval because the AI provider returned an invalid empty tool-call response.';
          onChunk(fallback);
          emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex });
          return {
            content: fallback,
            tokensUsed: lastUsage,
          };
        }

        logger.info('AI agent final response streaming started', {
          userId: options.userId,
          documentId: options.documentId,
          iteration: turnIndex + 1,
          transport: 'chat_completions',
        });
        if (assistantMessage.content) {
          const split = splitStaticThinking(assistantMessage.content);
          emitThinkingDelta(options.onAgentEvent, split.thinking);
          let visible = split.visible;
          if (containsPseudoToolCall(visible)) {
            logger.warn('AI stream stripped pseudo tool-call markup from first final completion', {
              userId: options.userId,
              documentId: options.documentId,
            });
            visible = stripPseudoToolCallMarkup(visible);
          }
          const content = visible.trim()
            || 'I could not produce a final answer from the available context.';
          onChunk(content);
          emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex });
          return {
            content,
            tokensUsed: lastUsage,
          };
        }
        const finalContent = await this.streamFinalChatCompletion(chatMessages, onChunk, options);
        emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex });
        return {
          content: finalContent,
          tokensUsed: lastUsage,
        };
      }

      if (toolCallsUsed + toolCalls.length > this.maxToolCalls) {
        logger.warn('AI streaming agent requested more tools than the remaining tool budget', {
          userId: options.userId,
          documentId: options.documentId,
          iteration: turnIndex + 1,
          transport: 'chat_completions',
          requestedTools: toolCalls.length,
          toolCallsUsed,
          maxToolCalls: this.maxToolCalls,
        });
        const finalContent = await this.streamFinalChatCompletion(
          [
            ...chatMessages,
            {
              role: 'user',
              content: buildFinalAnswerSynthesisPrompt(
                `the maximum of ${this.maxToolCalls} tool calls would be exceeded`
              ),
            },
          ],
          onChunk,
          options
        );
        emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex });
        return {
          content: finalContent,
          tokensUsed: lastUsage,
        };
      }

      logger.info('AI agent requested retrieval tools', {
        userId: options.userId,
        documentId: options.documentId,
        iteration: turnIndex + 1,
        transport: 'chat_completions',
        tools: toolCalls.map((toolCall: any) => toolCall.function?.name),
      });

      if (assistantMessage.content) {
        const split = splitStaticThinking(assistantMessage.content);
        emitThinkingDelta(options.onAgentEvent, split.thinking);
        chatMessages.push({
          ...assistantMessage,
          content: split.visible || null,
        });
      } else {
        chatMessages.push(assistantMessage);
      }
      for (const toolCall of toolCalls) {
        const toolName = toolCall.function?.name;
        let args: Record<string, any> = {};
        try {
          args = JSON.parse(toolCall.function?.arguments || '{}');
        } catch {
          args = { _raw: toolCall.function?.arguments };
        }
        emitAgentEvent(options.onAgentEvent, {
          type: 'tool-call',
          toolCallId: toolCall.id,
          toolName,
          args,
        });

        const toolStartedAt = Date.now();
        let output: string;
        let isError = false;
        try {
          output = await AIRetrievalService.executeTool(
            options.userId,
            options.documentId,
            toolName,
            args
          );
        } catch (error) {
          isError = true;
          output = JSON.stringify({
            error: error instanceof Error ? error.message : 'Tool execution failed',
          });
        }

        logger.info('AI agent retrieval tool completed', {
          userId: options.userId,
          documentId: options.documentId,
          transport: 'chat_completions',
          tool: toolName,
          outputBytes: output.length,
        });

        emitAgentEvent(options.onAgentEvent, {
          type: 'tool-result',
          toolCallId: toolCall.id,
          result: output,
          isError,
          durationMs: Date.now() - toolStartedAt,
        });

        toolCallsUsed += 1;
        chatMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: appendToolBudgetNotice(output, this.maxToolCalls - toolCallsUsed, this.maxToolCalls),
        });
      }
      emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex });
      turnIndex += 1;
    }

    const fallback = await this.streamFinalChatCompletion(
      [
        ...chatMessages,
        {
          role: 'user',
          content: buildFinalAnswerSynthesisPrompt(`the maximum of ${this.maxToolCalls} tool calls was reached`),
        },
      ],
      onChunk,
      options
    );
    return {
      content: fallback,
      tokensUsed: lastUsage,
    };
  }

  private async streamFinalChatCompletion(
    chatMessages: any[],
    onChunk: (chunk: string) => void,
    options: AgentChatOptions
  ): Promise<string> {
    let stream: any;
    stream = await this.withProviderRetry('chat.final-stream', options, () =>
      this.client.chat.completions.create({
        model: this.model,
        messages: chatMessages,
        stream: true,
        max_tokens: options.maxTokens || 2048,
        ...this.disableThinkingParams(options),
      } as any, this.requestOptions() as any)
    );

    let fullContent = '';

    // Bug A: quick-action / silent path must NOT run content through the
    // thinking splitter. The splitter holds prefixes like "Let me / We need
    // / I'll" for an implicit <think> close that never arrives on non-Qwen
    // providers (Kimi / GLM / DeepSeek-V4), so the whole response was being
    // held as "thinking" and visible streamed out as the empty-content
    // fallback. disableThinking=true now means "stream raw text, do not
    // capture reasoning, do not split". The provider kwarg above silences
    // Qwen's own reasoning channel for free.
    if (options.disableThinking) {
      const pseudoFilter = new PseudoToolCallStreamFilter();
      for await (const chunk of stream) {
        const content = chunk.choices?.[0]?.delta?.content || '';
        if (content) {
          const visible = pseudoFilter.push(content);
          if (visible) {
            fullContent += visible;
            onChunk(visible);
          }
        }
      }
      const flushed = pseudoFilter.flush();
      if (flushed) {
        fullContent += flushed;
        onChunk(flushed);
      }
      // Quick-action silent path: strip pseudo tool-call markup if the
      // model emitted it. The selection-menu UI shows the result inside
      // a small review card; we never want raw XML there.
      if (pseudoFilter.strippedPseudoToolCall || containsPseudoToolCall(fullContent)) {
        logger.warn('AI silent stream stripped pseudo tool-call markup from output', {
          userId: options.userId,
          documentId: options.documentId,
        });
        fullContent = stripPseudoToolCallMarkup(fullContent);
      }
      if (!fullContent.trim()) {
        logger.warn('AI direct stream produced no visible content; retrying once without streaming', {
          userId: options.userId,
          documentId: options.documentId,
          model: this.model,
        });
        let retry: any;
        retry = await this.withProviderRetry('chat.direct-nonstream-retry', options, () =>
          this.client.chat.completions.create({
            model: this.model,
            messages: chatMessages,
            stream: false,
            max_tokens: options.maxTokens || 2048,
            ...this.disableThinkingParams(options),
          } as any, this.requestOptions() as any)
        );

        const retryRawContent = retry?.choices?.[0]?.message?.content;
        const retryContent = stripPseudoToolCallMarkup(
          typeof retryRawContent === 'string' ? retryRawContent : ''
        ).trim();
        if (retryContent && !containsPseudoToolCall(retryContent)) {
          fullContent = retryContent;
          onChunk(retryContent);
          return fullContent;
        }

        const fallback = 'I could not produce a final answer from the available context.';
        fullContent = fallback;
        onChunk(fallback);
      }
      return fullContent;
    }

    const thinkingSplitter = new ThinkingContentSplitter();
    const pseudoFilter = new PseudoToolCallStreamFilter();
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta || {};
      const reasoning = delta.reasoning_content || delta.reasoning || '';
      emitThinkingDelta(options.onAgentEvent, reasoning);

      const content = delta.content || '';
      if (content) {
        const split = thinkingSplitter.push(content);
        emitThinkingDelta(options.onAgentEvent, split.thinking);
        if (split.visible) {
          const visible = pseudoFilter.push(split.visible);
          if (visible) {
            fullContent += visible;
            onChunk(visible);
          }
        }
      }
    }

    const flushed = thinkingSplitter.flush();
    emitThinkingDelta(options.onAgentEvent, flushed.thinking);
    if (flushed.visible) {
      const visible = pseudoFilter.push(flushed.visible);
      if (visible) {
        fullContent += visible;
        onChunk(visible);
      }
    }
    const pseudoFlushed = pseudoFilter.flush();
    if (pseudoFlushed) {
      fullContent += pseudoFlushed;
      onChunk(pseudoFlushed);
    }

    // Strip prose-encoded tool-call leaks from the final visible buffer.
    // The stream filter withholds pseudo tool blocks before onChunk, so
    // users do not see DSML/XML flashes while the final stored value stays
    // clean as a second layer of defense.
    if (pseudoFilter.strippedPseudoToolCall || containsPseudoToolCall(fullContent)) {
      logger.warn('AI stream stripped pseudo tool-call markup from final visible content', {
        userId: options.userId,
        documentId: options.documentId,
      });
      fullContent = stripPseudoToolCallMarkup(fullContent);
    }

    if (!fullContent.trim()) {
      const fallback = 'I could not produce a final answer from the available context.';
      fullContent = fallback;
      onChunk(fallback);
    }

    return fullContent;
  }

  private supportsChatTemplateThinkingToggle(): boolean {
    if (!this.baseUrl.includes('api.together.xyz')) return false;
    return [
      'Qwen/Qwen3.5-397B-A17B',
      'moonshotai/Kimi-K2.6',
      'deepseek-ai/DeepSeek-V4-Pro',
      'zai-org/GLM-5',
      'zai-org/GLM-5.1',
    ].includes(this.model);
  }

  private async finalizeChatCompletion(
    chatMessages: any[],
    reason: string,
    options: AgentChatOptions,
    lastUsage?: { input: number; output: number }
  ): Promise<{ content: string; tokensUsed?: { input: number; output: number } }> {
    logger.warn('AI agent finalizing after retrieval budget guard', {
      userId: options.userId,
      documentId: options.documentId,
      reason,
      transport: 'chat_completions',
    });

    let completion: any;
    completion = await this.withProviderRetry('chat.finalize', options, () =>
      this.client.chat.completions.create({
        model: this.model,
        messages: [
          ...chatMessages,
          { role: 'user', content: buildFinalAnswerSynthesisPrompt(reason) },
        ],
        max_tokens: options.maxTokens || 2048,
      } as any, this.requestOptions() as any)
    );

    const assistantMessage = completion.choices?.[0]?.message || {};
    emitThinkingDelta(options.onAgentEvent, assistantMessage.reasoning_content || assistantMessage.reasoning || '');
    const split = splitStaticThinking(assistantMessage.content || '');
    emitThinkingDelta(options.onAgentEvent, split.thinking);

    const content = split.visible.trim()
      || 'I reached the retrieval limit before the model produced a final answer, and I could not synthesize a reliable answer from the retrieved evidence.';
    const usage = completion.usage ? {
      input: completion.usage.prompt_tokens,
      output: completion.usage.completion_tokens,
    } : lastUsage;

    return {
      content,
      tokensUsed: usage,
    };
  }

  private handleSDKError(error: unknown): never {
    const sdkError = error as any;
    logger.error('OpenAI API error', { status: sdkError?.status, error: sdkError });
    const detail = getProviderErrorDetail(error);
    const prefix = 'AI Provider: ';
    const errorName = getProviderErrorName(error);

    if (
      errorName === 'APIConnectionTimeoutError'
      || errorName === 'TimeoutError'
      || /timed?\s*out|timeout/i.test(detail)
    ) {
      throw new AppError(
        504,
        `${prefix}request timed out after ${Math.round(this.providerTimeoutMs / 1000)}s. Please try again or ask a narrower question.`
      );
    }

    if (sdkError?.status === 401) {
      throw new AppError(502, detail ? `${prefix}${detail}` : 'Invalid API key. Please check your AI settings.');
    }
    if (sdkError?.status === 429) {
      throw new AppError(429, detail ? `${prefix}${detail}` : 'Rate limit exceeded. Please try again later.');
    }
    if (sdkError?.status === 404) {
      throw new AppError(400, detail ? `${prefix}${detail}` : `Model "${this.model}" not found. Please check your AI settings.`);
    }
    if (sdkError?.status && sdkError.status >= 500 && sdkError.status <= 599) {
      throw new AppError(
        502,
        `${prefix}the provider is temporarily unavailable after retrying. Please try again in a moment or ask a narrower question.`
      );
    }

    throw new AppError(sdkError?.status || 502, detail ? `${prefix}${detail}` : 'AI service error');
  }
}

/**
 * Mock provider for development/testing
 */
class MockAIProvider implements AIProvider {
  async agentChat(
    messages: { role: string; content: string }[],
    options: AgentChatOptions
  ): Promise<{
    content: string;
    tokensUsed?: { input: number; output: number };
  }> {
    const lastMessage = messages[messages.length - 1];
    const mockResponse = this.generateMockResponse(lastMessage?.content || '');

    emitAgentEvent(options.onAgentEvent, { type: 'turn-start', turnIndex: 0 });
    // Simulate delay
    await new Promise(resolve => setTimeout(resolve, 500));
    emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex: 0 });

    return {
      content: mockResponse,
      tokensUsed: { input: 100, output: 50 },
    };
  }

  async agentStreamChat(
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    options: AgentChatOptions
  ): Promise<{ content: string; tokensUsed?: { input: number; output: number } }> {
    const lastMessage = messages[messages.length - 1];
    const mockResponse = this.generateMockResponse(lastMessage?.content || '');
    const words = mockResponse.split(' ');
    let fullContent = '';

    emitAgentEvent(options.onAgentEvent, { type: 'turn-start', turnIndex: 0 });
    for (const word of words) {
      await new Promise(resolve => setTimeout(resolve, 50));
      const chunk = (fullContent ? ' ' : '') + word;
      fullContent += chunk;
      onChunk(chunk);
    }
    emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex: 0 });

    return {
      content: fullContent,
      tokensUsed: { input: 100, output: words.length },
    };
  }

  async directStreamChat(
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    options: AgentChatOptions
  ): Promise<{ content: string; tokensUsed?: { input: number; output: number } }> {
    return this.agentStreamChat(messages, onChunk, options);
  }

  private generateMockResponse(query: string): string {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('grammar') || lowerQuery.includes('check')) {
      return 'I checked your text and found a few suggestions:\n\n1. Consider using active voice in paragraph 2\n2. The comma after "However" should be added\n3. "Their" should be "there" in line 5\n\nWould you like me to apply these corrections?';
    }

    if (lowerQuery.includes('summarize') || lowerQuery.includes('summary')) {
      return 'Here\'s a summary of your document:\n\nThis document discusses the main points of your topic, covering key aspects and providing detailed analysis. The main themes include the introduction, methodology, and conclusions drawn from the research.';
    }

    if (lowerQuery.includes('rewrite') || lowerQuery.includes('improve')) {
      return 'I can help improve this text. Here\'s a suggested revision that maintains your meaning while enhancing clarity and flow:\n\n[The revised text would appear here based on your selection]\n\nShall I apply this change?';
    }

    return 'I\'m your AI writing assistant. I can help you with:\n\n- Grammar and spelling checks\n- Content summarization\n- Text rewriting and improvement\n- Answering questions about your document\n\nWhat would you like me to help you with?';
  }
}

/**
 * Get the appropriate AI provider based on configuration
 */
function getAIProvider(): AIProvider {
  const provider = env.aiProvider || 'mock';

  switch (provider) {
    case 'openai':
      return new OpenAIProvider();
    case 'mock':
    default:
      return new MockAIProvider();
  }
}

/**
 * Classify the query type based on content
 */
function classifyQueryType(query: string): AIQueryType {
  const lowerQuery = query.toLowerCase();

  if (lowerQuery.includes('grammar') || lowerQuery.includes('proofread')) {
    return 'grammar_check';
  }
  if (lowerQuery.includes('spell') || lowerQuery.includes('typo')) {
    return 'spelling_check';
  }
  if (lowerQuery.includes('rewrite') || lowerQuery.includes('rephrase') || lowerQuery.includes('improve')) {
    return 'rewrite';
  }
  if (lowerQuery.includes('summarize') || lowerQuery.includes('summary') || lowerQuery.includes('tldr')) {
    return 'summarize';
  }
  if (lowerQuery.includes('expand') || lowerQuery.includes('elaborate') || lowerQuery.includes('more detail')) {
    return 'expand';
  }
  if (lowerQuery.includes('translate') || lowerQuery.includes('translation')) {
    return 'translate';
  }
  if (lowerQuery.includes('format') || lowerQuery.includes('heading') || lowerQuery.includes('list')) {
    return 'format';
  }
  if (lowerQuery.includes('reference') || lowerQuery.includes('cite') || lowerQuery.includes('source')) {
    return 'reference';
  }
  if (lowerQuery.includes('?') || lowerQuery.includes('what') || lowerQuery.includes('how') || lowerQuery.includes('why')) {
    return 'question';
  }

  return 'other';
}

/**
 * Question Category Types
 */
export type AIQuestionCategory = 'understanding' | 'generation' | 'other';

/**
 * Classify the question category based on content
 * - 'understanding': Questions about understanding/clarifying content (e.g., "What does this mean?", "Explain...")
 * - 'generation': Requests to create/modify content (e.g., "Write...", "Generate...", "Rewrite...")
 */
export function classifyQuestionCategory(query: string, queryType: AIQueryType): AIQuestionCategory {
  const lowerQuery = query.toLowerCase();

  // Generation indicators - requests to create or modify content
  const generationKeywords = [
    'write', 'generate', 'create', 'compose', 'draft', 'produce',
    'rewrite', 'rephrase', 'improve', 'fix', 'correct', 'edit',
    'expand', 'elaborate', 'extend', 'add', 'include',
    'summarize', 'shorten', 'condense', 'simplify',
    'translate', 'convert', 'format', 'restructure',
    'make it', 'change to', 'turn this', 'help me write',
    'can you write', 'please write', 'could you write',
  ];

  // Understanding indicators - questions about content
  const understandingKeywords = [
    'what does', 'what is', 'what are', 'what was', 'what were',
    'explain', 'clarify', 'describe', 'define', 'meaning of',
    'why does', 'why is', 'why are', 'why did',
    'how does', 'how is', 'how are', 'how did',
    'tell me about', 'help me understand', 'i don\'t understand',
    'what do you think', 'what\'s the', 'who is', 'who are',
    'when did', 'when was', 'where is', 'where are',
    'is this', 'are these', 'does this', 'do these',
    'can you explain', 'could you explain', 'please explain',
  ];

  // Query types that are typically generation
  const generationQueryTypes: AIQueryType[] = [
    'grammar_check', 'spelling_check', 'rewrite', 'summarize',
    'expand', 'translate', 'format',
  ];

  // Query types that are typically understanding
  const understandingQueryTypes: AIQueryType[] = [
    'question', 'reference',
  ];

  // Check explicit keywords first
  for (const keyword of generationKeywords) {
    if (lowerQuery.includes(keyword)) {
      return 'generation';
    }
  }

  for (const keyword of understandingKeywords) {
    if (lowerQuery.includes(keyword)) {
      return 'understanding';
    }
  }

  // Fall back to query type classification
  if (generationQueryTypes.includes(queryType)) {
    return 'generation';
  }

  if (understandingQueryTypes.includes(queryType)) {
    return 'understanding';
  }

  // If it's a question (contains '?'), lean towards understanding
  if (lowerQuery.includes('?')) {
    return 'understanding';
  }

  return 'other';
}

/**
 * Build system prompt for the AI assistant
 */
function buildSystemPrompt(context?: {
  selection?: { text: string; startOffset: number; endOffset: number };
  selectedText?: string;
}): string {
  let prompt = `You are an AI writing assistant integrated into a document editor. Your role is to help users improve their writing through:

1. Grammar and spelling corrections
2. Content rewriting and improvement
3. Summarization
4. Text expansion
5. Answering questions about the document
6. Formatting suggestions

Guidelines:
- Be concise and helpful
- When suggesting changes, clearly explain what you're changing and why
- If asked to make corrections, list them clearly with line references when possible
- Maintain the user's voice and style when rewriting
- For formatting, use markdown syntax

`;

  if (context?.selectedText) {
    prompt += `\nThe user has selected/quoted this text from the editor:\n\n---\n${context.selectedText}\n---\n`;
  }

  if (context?.selection?.text) {
    prompt += `\nThe user has selected the following text:\n\n---\n${context.selection.text}\n---\n`;
  }

  return prompt;
}

export function buildRetrievalInstructions(_documentId: string): string {
  return `You are an AI writing assistant. You answer questions about uploaded reference files using exactly three structured tools. The backend already scopes every call to the current document; do not pass documentId.

TOOL CONTRACTS:
  ls({}) — list uploaded reference files.
           Returns { files: [{ id, filename, lineCount, pageCount, hasPages, sizeHint }] }.
           sizeHint is "small" (≤200 lines), "medium" (201–1000), "large" (>1000), or "unknown".

  grep({"file":"<id>","pattern":"<literal text>","context_before":0,"context_after":0})
        — case-insensitive literal substring search over one file.
           Returns up to 50 matches in document order:
           { line, page (nearest preceding [page N], or null), text, contextLines? }.
           Pattern is plain text, not regex.

  read({"file":"<id>","offset":1,"limit":200})
        — read a contiguous line range from one file.
           Returns { lines, totalLines, hasPages, pageRange, truncated }.
           offset is 1-indexed; limit hard-caps at 800.

PRIVACY BOUNDARY (hard rule):
You can only see files returned by ls({}). You CANNOT read the user's editor draft, their current writing, selected text, or anything not listed by ls({}). The schema does not even expose such a tool. If the user asks for editor content ("summarize my draft", "find a typo in what I wrote", "what's in my essay"), refuse honestly:

  "I can only read reference files you've uploaded. For your own writing, paste it into chat or use the selection-menu Quick Actions (Fix grammar / Improve / Simplify / Make formal)."

STRATEGY HINTS — adapt to the file size and the question, do not follow a fixed workflow:
- If this answer has not already listed attached files, call ls({}) once to discover file ids and sizeHint metadata.
- Small file (sizeHint "small" or totalLines ≤ 200): one read({"file":"<id>","offset":1,"limit":200}) usually beats grep.
- Medium file (sizeHint "medium" or 201–1000 lines): grep first to locate the right region, then read a targeted range around the hit.
- Large file (sizeHint "large" or >1000 lines): grep first. Avoid broad sequential reads; read targeted ranges only.
- Unknown size: use the question shape. For a specific term, grep first. For a very short single-reference prompt, read the first 120-200 lines to scout.
- For PDFs, [page N] markers appear inline in the text — cite them when answering ("see page 21").
- For late-document sections (conclusion / references / appendix on a long PDF), reading at high offset is often faster than guessing the right keyword.

FALLBACK LADDER — when a tool returns nothing useful, KEEP TRYING before answering "not found":
1. grep returned []? Try, in order:
   a. A synonym or related term  ("conclusion" → "concluding remarks" → "summary" → "in summary")
   b. A shorter substring         ("methodology" → "method")
   c. A numbered-heading style    ("Conclusion" → "5. Conclusion" → "§5")
   d. Direct read of the likely region (for late sections, read near the end of the file)
2. read returned content that does not answer the question?
   a. grep again with a better pattern based on what you saw
   b. read an adjacent line range
3. ls returned []? The user has not uploaded any references. Tell them so plainly. Do not pretend a file exists.
4. A tool errored? Retry once with the same arguments. If it still errors, surface the error honestly.
5. Only after 3-4 reasonable attempts have all failed, say:
   "I could not find <topic> in <filename>. Could you point me at a specific page or term that mentions it?"
   Never fabricate an answer to fill the gap.

OUTPUT RULES:
- Answer concisely after you have enough evidence.
- Cite by page when [page N] markers appeared in your tool results; otherwise cite by line.
- When evidence is incomplete, say so explicitly and name what is missing.
- No web/search tool exists in this build. Do not answer external/current facts from memory; say that you can only use uploaded references unless the user provides the needed source text.
- Tool calls must be REAL structured function calls. Never write XML, DSML, JSON snippets like {"function":"ls","arguments":{}}, pseudo-tags, or prose tool calls in your visible answer.`;
}

/**
 * System prompt for the four selection-menu quick actions (fix grammar /
 * improve writing / simplify / make formal). Differs from the chat system
 * prompt: the model returns only the rewritten text, no commentary, and
 * matches the author's voice using the surrounding-context window.
 */
function buildQuickActionSystemPrompt(context?: AIChatRequest['context']): string {
  const base = 'You are a helpful writing assistant. Follow the user instructions precisely and only return the requested text without any explanation or surrounding quotation marks.';
  const sc = context?.surroundingContext;
  if (!sc) return base;

  const parts: string[] = [base];
  if (sc.documentTitle) {
    parts.push(`The user is writing a document titled: "${sc.documentTitle}".`);
  }
  if (sc.before || sc.after) {
    parts.push("Preserve the author's voice, register, and style. Below is the surrounding text the user is NOT asking you to change — match this voice when you rewrite the selection.");
    if (sc.before) parts.push(`[BEFORE THE SELECTION]\n${sc.before}`);
    if (sc.after) parts.push(`[AFTER THE SELECTION]\n${sc.after}`);
    parts.push('Only rewrite the selection itself. Do not echo any of the before/after text in your response.');
  }
  return parts.join('\n\n');
}

export class AIService {
  /**
   * Resolve the AI credentials for a document. Personal documents use the
   * writer's own key. Task-enrolled documents use the task owner's key and the
   * model locked in the task environment config.
   */
  private static async getExecutionSettingsForDocument(
    userId: string,
    documentId: string
  ): Promise<AIExecutionSettings> {
    const task = await TaskModel.findBySubmissionDocument(documentId, userId);

    if (!task) {
      const document = await DocumentModel.findByIdAndUserId(documentId, userId);
      if (!document) {
        throw new AppError(404, 'Document not found');
      }

      if (document.environmentConfig?.aiAccess === 'off') {
        throw new AppError(403, 'AI is disabled for this document');
      }

      const settings = await UserAISettingsModel.getByUserId(userId);
      if (!settings) {
        throw new AppError(400, 'Please configure your AI settings first');
      }
      const model = document.environmentConfig?.allowedModels?.[0] || settings.model;
      if (!model) {
        throw new AppError(400, 'No AI model is configured for this document');
      }
      const baseUrl = document.environmentConfig?.aiProvider?.baseUrl || settings.baseUrl;
      const tokenBudget = resolveEffectiveTokenBudget(settings, document.environmentConfig);

      return {
        provider: new OpenAIProvider({
          apiKey: settings.apiKey,
          baseUrl,
          model,
        }),
        modelVersion: model,
        shortcutMaxTokens: tokenBudget.shortcutMaxTokens,
        chatMaxTokens: tokenBudget.chatMaxTokens,
        baseUrl,
      };
    }

    const taskConfig = task.environmentConfig;
    if (!taskConfig || taskConfig.aiAccess === 'off') {
      throw new AppError(403, 'AI is disabled for this task');
    }

    const ownerSettings = await UserAISettingsModel.getByUserId(task.userId);
    if (!ownerSettings) {
      throw new AppError(400, 'Task owner has not configured AI settings');
    }

    const model = (
      taskConfig.allowedModels?.[0] ||
      task.allowedLlmModels?.[0] ||
      ownerSettings.model
    );

    if (!model) {
      throw new AppError(400, 'No AI model is configured for this task');
    }
    const tokenBudget = resolveEffectiveTokenBudget(ownerSettings, taskConfig);
    const baseUrl = taskConfig.aiProvider?.baseUrl || ownerSettings.baseUrl;

    return {
      provider: new OpenAIProvider({
        apiKey: ownerSettings.apiKey,
        baseUrl,
        model,
      }),
      modelVersion: model,
      shortcutMaxTokens: tokenBudget.shortcutMaxTokens,
      chatMaxTokens: tokenBudget.chatMaxTokens,
      baseUrl,
    };
  }

  private static async buildNoReferencePreflightAnswer(
    userId: string,
    documentId: string,
    message: string,
    queryType: AIQueryType,
    questionCategory: AIQuestionCategory,
  ): Promise<string | null> {
    if (!shouldPreflightReferenceAvailability(message, queryType, questionCategory)) {
      return null;
    }

    const listing = await AIRetrievalService.listReferenceFiles(userId, documentId);
    if (listing.files.length > 0) {
      return null;
    }

    return NO_REFERENCE_FILES_CHAT_RESPONSE;
  }

  /**
   * Silent chat - get AI response without creating session/logs
   * Used for quick inline actions like grammar correction
   */
  static async silentChat(
    userId: string,
    request: AIChatRequest
  ): Promise<{ message: { id: string; role: string; content: string } }> {
    // Verify document ownership
    const isOwner = await DocumentModel.isOwner(request.documentId, userId);
    if (!isOwner) {
      throw new AppError(404, 'Document not found');
    }

    const { provider, shortcutMaxTokens } = await this.getExecutionSettingsForDocument(userId, request.documentId);

    // Build simple messages without conversation history
    const messages: { role: string; content: string }[] = [
      { role: 'system', content: buildQuickActionSystemPrompt(request.context) },
      { role: 'user', content: request.message },
    ];

    let streamedContent = '';
    const response = await provider.directStreamChat(messages, (chunk: string) => {
      streamedContent += chunk;
    }, {
      userId,
      documentId: request.documentId,
      maxTokens: shortcutMaxTokens,
      disableThinking: true,
    });
    const content = normalizeQuickActionOutput(response.content || streamedContent);
    if (!content) {
      throw new AppError(
        502,
        'AI did not return a usable rewrite for the selected text. Please try again.'
      );
    }

    logger.info('AI silent chat completed', {
      userId,
      documentId: request.documentId,
    });

    return {
      message: {
        id: `silent-${Date.now()}`,
        role: 'assistant',
        content,
      },
    };
  }

  /**
   * Streaming silent chat - same idea as silentChat but pushes the response
   * back chunk-by-chunk over the supplied callbacks. The WebSocket handler
   * wraps this with the `sessionId: 'silent'` sentinel so the chat panel
   * does not adopt the frames as a real conversation turn.
   */
  static async silentStreamChat(
    userId: string,
    request: AIChatRequest,
    onChunk: (chunk: string) => void,
    onComplete: (content: string) => void,
    onError: (error: Error) => void,
  ): Promise<void> {
    try {
      const isOwner = await DocumentModel.isOwner(request.documentId, userId);
      if (!isOwner) {
        throw new AppError(404, 'Document not found');
      }

      const { provider, shortcutMaxTokens } = await this.getExecutionSettingsForDocument(userId, request.documentId);

      const messages: { role: string; content: string }[] = [
        { role: 'system', content: buildQuickActionSystemPrompt(request.context) },
        { role: 'user', content: request.message },
      ];

      // Quick actions edit user-selected text. A bad partial stream is worse
      // than no suggestion because it can be applied into the editor. Buffer
      // the provider stream, validate the completed rewrite, then emit one
      // clean chunk to the UI. This specifically prevents provider/agent
      // fallback text from being spliced into the user's selected text (#104).
      let streamedContent = '';
      const response = await provider.directStreamChat(messages, (chunk: string) => {
        streamedContent += chunk;
      }, {
        userId,
        documentId: request.documentId,
        maxTokens: shortcutMaxTokens,
        disableThinking: true,
      });

      const content = normalizeQuickActionOutput(response.content || streamedContent);
      if (!content) {
        throw new AppError(
          502,
          'AI did not return a usable rewrite for the selected text. Please try again.'
        );
      }

      logger.info('AI silent stream chat completed', {
        userId,
        documentId: request.documentId,
        bytes: content.length,
      });

      onChunk(content);
      onComplete(content);
    } catch (error) {
      logger.error('AI silent stream chat failed', {
        userId,
        documentId: request.documentId,
        error,
      });
      onError(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  /**
   * Rebuild a persisted AIChatMessage into a provider-ready content value.
   * Plain text content stays a string; messages whose metadata carries
   * image attachments are turned back into the OpenAI-style content-parts
   * array so multi-turn vision conversations preserve the image across
   * subsequent assistant turns (#93). Non-user roles never carry image
   * attachments today, so the helper still returns the plain content for
   * them.
   */
  private static rebuildHistoryContent(msg: AIChatMessage): string | Array<Record<string, unknown>> {
    const imageAttachments = (msg.metadata?.attachments ?? []).filter(
      (a): a is { type: 'image'; storageKey: string; mimeType: string; filename?: string } =>
        (a as { type?: string }).type === 'image',
    );
    if (msg.role === 'user' && imageAttachments.length > 0) {
      return this.buildUserContent(msg.content, imageAttachments, { historical: true });
    }
    return msg.content;
  }

  /**
   * Walk the just-built messages array and replace any synchronous
   * `humanly-storage:KEY` image placeholders with real `data:` URLs
   * fetched from the file-storage adapter. Runs once per turn, after the
   * messages array is assembled and before the provider call. Errors
   * surface as a 502 so the upload pipeline can be diagnosed.
   */
  private static async inlineImageAttachments(
    messages: Array<{ role: string; content: any }>,
    userId: string,
  ): Promise<void> {
    for (const msg of messages) {
      if (!Array.isArray(msg.content)) continue;
      for (const part of msg.content) {
        if (
          part &&
          typeof part === 'object' &&
          (part as any).type === 'image_url' &&
          typeof (part as any).image_url?.url === 'string' &&
          (part as any).image_url.url.startsWith('humanly-storage:')
        ) {
          const storageKey = (part as any).image_url.url.slice('humanly-storage:'.length);
          const requestedMimeType = (part as any).image_url.mimeType || 'image/png';
          // Ownership check (#93 security follow-up): refuse cross-user
          // use of a storageKey before touching the storage adapter.
          const attachment = await AIChatAttachmentModel.findOwnedByStorageKey(storageKey, userId);
          if (!attachment) {
            throw new AppError(
              403,
              'Image attachment does not belong to this user',
            );
          }
          try {
            let buffer: Buffer;
            try {
              buffer = await FileStorageService.getBuffer({
                storageProvider: attachment.storage_provider,
                storageBucket: attachment.storage_bucket,
                storageKey: attachment.storage_key,
              });
            } catch (error) {
              const storageError = error as { statusCode?: unknown; status?: unknown; message?: unknown };
              const storageStatus = Number(storageError.statusCode ?? storageError.status);
              const storageMessage = typeof storageError.message === 'string'
                ? storageError.message
                : '';
              if (
                (storageStatus === 404 || storageMessage === 'File not found') &&
                attachment.image_bytes
              ) {
                buffer = attachment.image_bytes;
              } else {
                throw error;
              }
            }
            const mimeType = attachment.mime_type || requestedMimeType;
            const historical = (part as any).image_url.historical === true;
            if (!this.isSupportedImageBuffer(buffer, mimeType)) {
              if (historical) {
                this.downgradeHistoricalImagePart(part, (part as any).image_url.filename || 'image');
                continue;
              }
              throw new AppError(
                400,
                'Image attachment is not a valid image file',
              );
            }
            const base64 = buffer.toString('base64');
            (part as any).image_url.url = `data:${mimeType};base64,${base64}`;
            // Strip our internal placeholder fields before dispatch.
            delete (part as any).image_url.mimeType;
            delete (part as any).image_url.filename;
            delete (part as any).image_url.historical;
          } catch (error) {
            const storageError = error as { statusCode?: unknown; status?: unknown; message?: unknown };
            const storageStatus = Number(storageError.statusCode ?? storageError.status);
            const storageMessage = typeof storageError.message === 'string'
              ? storageError.message
              : '';
            const historical = (part as any).image_url.historical === true;
            if (
              historical &&
              (storageStatus === 404 || storageMessage === 'File not found')
            ) {
              this.downgradeHistoricalImagePart(
                part,
                (part as any).image_url.filename || 'image',
              );
              continue;
            }
            if (error instanceof AppError) throw error;
            throw new AppError(
              502,
              'Failed to load chat image attachment from storage',
            );
          }
        }
      }
    }
  }

  private static downgradeHistoricalImagePart(part: Record<string, any>, filename: string): void {
    delete part.image_url;
    part.type = 'text';
    part.text = `[Prior image attachment unavailable: ${filename}]`;
  }

  private static isSupportedImageBuffer(buffer: Buffer, mimeType: string): boolean {
    if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;

    const normalized = mimeType.toLowerCase().split(';')[0].trim();
    if (normalized === 'image/png') {
      return (
        buffer.length >= 24 &&
        buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) &&
        buffer.subarray(12, 16).toString('ascii') === 'IHDR'
      );
    }

    if (normalized === 'image/jpeg' || normalized === 'image/jpg') {
      return buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
    }

    if (normalized === 'image/gif') {
      const header = buffer.subarray(0, 6).toString('ascii');
      return header === 'GIF87a' || header === 'GIF89a';
    }

    if (normalized === 'image/webp') {
      return (
        buffer.length >= 12 &&
        buffer.subarray(0, 4).toString('ascii') === 'RIFF' &&
        buffer.subarray(8, 12).toString('ascii') === 'WEBP'
      );
    }

    return false;
  }

  /**
   * Build the OpenAI-compatible message content for a user turn. With no
   * attachments this stays a plain string (existing wire shape). With image
   * attachments it becomes the structured `[ {type:'text'}, {type:'image_url'} ]`
   * array OpenAI / Together / OpenRouter all accept. Image bytes are looked
   * up from the file-storage adapter and inlined as `data:` URLs so the
   * provider call is self-contained.
   */
  private static buildUserContent(
    message: string,
    attachments?: ChatAttachment[],
    options?: { historical?: boolean },
  ): string | Array<Record<string, unknown>> {
    if (!attachments || attachments.length === 0) {
      return message;
    }
    const parts: Array<Record<string, unknown>> = [];
    if (message && message.length > 0) {
      parts.push({ type: 'text', text: message });
    }
    for (const attachment of attachments) {
      if (attachment.type === 'image') {
        // Fresh objects per call so `inlineImageAttachments` mutations
        // never bleed back into the persisted `metadata.attachments`
        // entries the user message row holds. The provider layer treats
        // the placeholder URL as opaque; the data: URL swap happens just
        // before dispatch.
        parts.push({
          type: 'image_url',
          image_url: {
            url: `humanly-storage:${attachment.storageKey}`,
            mimeType: attachment.mimeType,
            filename: attachment.filename ?? null,
            historical: options?.historical === true,
          },
        });
      }
    }
    return parts;
  }

  /**
   * Identity-tolerant check for the typed FK violation. Jest auto-mocks
   * replace the constructor identity in unit tests, so we also accept the
   * `.name` string as a fallback.
   */
  private static isSessionMissingError(error: unknown): boolean {
    return (
      error instanceof AIChatSessionMissingError ||
      (typeof error === 'object' &&
        error !== null &&
        (error as { name?: string }).name === 'AIChatSessionMissingError')
    );
  }

  /**
   * Resolve a chat session for an incoming request. If the client supplied a
   * `sessionId` that no longer exists (e.g. the session was deleted from
   * another tab while the message was in flight), fall back to creating a
   * fresh session for the document instead of bubbling up a raw "Session not
   * found" error. This keeps chat usable across stale-session retries and
   * prevents the downstream `addMessage` insert from triggering the
   * `ai_chat_messages_session_id_fkey` FK violation that surfaced in issue #90.
   *
   * The optional `modelSnapshot` is persisted on the session row on first
   * creation so capability gating (#93) can later detect a mid-session
   * model switch that drops a modality already used in the conversation.
   */
  private static async resolveChatSession(
    userId: string,
    request: AIChatRequest,
    modelSnapshot?: { modelVersion: string; capabilities: ModelCapabilities },
  ): Promise<AIChatSession> {
    if (request.forceNewSession) {
      const fresh = await AIModel.createSession(
        request.documentId,
        userId,
        modelSnapshot,
      );
      if (!fresh) {
        throw new AppError(500, 'Failed to create AI chat session');
      }
      return fresh;
    }

    if (request.sessionId) {
      const existing = await AIModel.findSessionById(request.sessionId);
      if (existing) return existing;

      logger.warn('Requested AI chat session missing; creating a fresh one', {
        userId,
        documentId: request.documentId,
        requestedSessionId: request.sessionId,
      });
    }

    const created = await AIModel.getOrCreateSession(
      request.documentId,
      userId,
      modelSnapshot,
    );
    if (!created) {
      throw new AppError(500, 'Failed to create AI chat session');
    }
    return created;
  }

  /**
   * Capability-gating helper (#93). Compares the resolved-for-this-turn
   * model against:
   *   1. The incoming request's `attachments` (rejects IMAGE_NOT_SUPPORTED
   *      when the model is text-only).
   *   2. The session's prior history (rejects MODEL_CAPABILITY_MISMATCH
   *      when the new model drops a modality the user already used).
   *
   * Throws an AppError with a stable code on either failure so the
   * websocket layer can route the precise message back to the chat UI.
   */
  private static enforceCapabilityGating(args: {
    session: AIChatSession;
    request: AIChatRequest;
    baseUrl: string;
    modelVersion: string;
  }): void {
    const { session, request, baseUrl, modelVersion } = args;
    const capabilities = resolveCapabilitiesOrSafeDefault(baseUrl, modelVersion);
    const supportsImage = capabilities.inputs.includes('image');
    const requestHasImage = (request.attachments ?? []).some(
      (a) => a.type === 'image',
    );

    if (requestHasImage && !supportsImage) {
      const err = new AppError(
        400,
        `Model ${modelVersion} does not accept image input. Switch to a vision-capable model or remove the attachment.`,
      );
      (err as any).code = AI_ERROR_CODES.IMAGE_NOT_SUPPORTED;
      throw err;
    }

    // History scan: if any prior assistant or user turn already carried an
    // image attachment, we cannot route this turn to a text-only model
    // without losing the conversational context.
    if (!supportsImage) {
      const historyHasImage = (session.messages ?? []).some((m) =>
        (m.metadata?.attachments ?? []).some((a) => a.type === 'image'),
      );
      if (historyHasImage) {
        const err = new AppError(
          409,
          'This conversation already includes image input. Start a new chat to switch to a text-only model.',
        );
        (err as any).code = AI_ERROR_CODES.MODEL_CAPABILITY_MISMATCH;
        throw err;
      }
    }
  }

  private static async recoverAgentTimeoutWithDirectFallback(
    provider: AIProvider,
    messages: { role: string; content: any }[],
    onChunk: (chunk: string) => void,
    options: AgentChatOptions,
    timeoutMs: number,
  ): Promise<{
    content: string;
    tokensUsed?: { input: number; output: number };
    recovered: boolean;
  }> {
    const timeoutFallback = buildProviderTimeoutFallback(timeoutMs);

    logger.warn('AI agent timed out; attempting direct snapshot fallback', {
      userId: options.userId,
      documentId: options.documentId,
      timeoutMs,
    });

    let buffered = '';
    try {
      const compactReferenceContext = await AIRetrievalService.buildCompactReferenceContext(
        options.userId,
        options.documentId
      );
      const fallbackMessages = compactReferenceContext
        ? [
            ...messages.slice(0, 1),
            { role: 'system', content: compactReferenceContext },
            ...messages.slice(1),
          ]
        : messages;

      const { value: directResponse, timedOut } = await withAIProviderTimeout(
        provider.directStreamChat(
          fallbackMessages as any,
          (chunk: string) => {
            buffered += chunk;
          },
          {
            ...options,
            maxTokens: normalizeConfiguredMaxTokens(
              options.maxTokens,
              AI_SHORTCUT_MAX_TOKENS_DEFAULT,
            ),
            disableThinking: true,
          },
        ),
        DIRECT_TIMEOUT_FALLBACK_MS,
        () => ({ content: '', tokensUsed: undefined })
      );

      if (!timedOut) {
        const content = normalizeAgentTimeoutDirectFallbackOutput(
          directResponse.content || buffered
        );
        if (content) {
          onChunk(content);
          logger.info('AI direct snapshot fallback recovered timed-out agent turn', {
            userId: options.userId,
            documentId: options.documentId,
            bytes: content.length,
          });
          return {
            content,
            tokensUsed: directResponse.tokensUsed,
            recovered: true,
          };
        }
      }

      logger.warn('AI direct snapshot fallback did not produce usable content', {
        userId: options.userId,
        documentId: options.documentId,
        timedOut,
        bytes: buffered.length,
      });
    } catch (error) {
      logger.warn('AI direct snapshot fallback failed after agent timeout', {
        userId: options.userId,
        documentId: options.documentId,
        error,
      });
    }

    onChunk(timeoutFallback);
    return {
      content: timeoutFallback,
      tokensUsed: undefined,
      recovered: false,
    };
  }

  /**
   * Process a chat message
   */
  static async chat(
    userId: string,
    request: AIChatRequest
  ): Promise<AIChatResponse> {
    const startTime = Date.now();

    // Verify document ownership
    const isOwner = await DocumentModel.isOwner(request.documentId, userId);
    if (!isOwner) {
      throw new AppError(404, 'Document not found');
    }

    // Resolve provider + model first so the session can capture the
    // capability snapshot at creation, and so capability gating runs
    // before we touch the DB at all (#93).
    const {
      provider: providerForChat,
      modelVersion: modelVersionForChat,
      baseUrl: baseUrlForChat,
      shortcutMaxTokens: shortcutMaxTokensForChat,
      chatMaxTokens: chatMaxTokensForChat,
    } =
      await this.getExecutionSettingsForDocument(userId, request.documentId);
    const capabilitiesForChat = resolveCapabilitiesOrSafeDefault(
      baseUrlForChat,
      modelVersionForChat,
    );

    // Get or create session (self-heals when the client sent a stale sessionId)
    const session = await this.resolveChatSession(userId, request, {
      modelVersion: modelVersionForChat,
      capabilities: capabilitiesForChat,
    });

    // Capability gating: refuse IMAGE_NOT_SUPPORTED / MODEL_CAPABILITY_MISMATCH
    // before any provider call.
    this.enforceCapabilityGating({
      session,
      request,
      baseUrl: baseUrlForChat,
      modelVersion: modelVersionForChat,
    });

    // Classify query type and category
    const queryType = classifyQueryType(request.message);
    const questionCategory = classifyQuestionCategory(request.message, queryType);

    // Create log entry
    const log = await AIModel.createLog({
      documentId: request.documentId,
      userId,
      sessionId: session.id,
      query: request.message,
      queryType,
      questionCategory,
      contextSnapshot: request.context,
    });

    try {
      // Add user message to session, carrying attachment metadata when
      // present so the conversation history scan in
      // `enforceCapabilityGating` can detect prior images on later turns.
      const userMetadata: Record<string, any> | undefined =
        request.attachments && request.attachments.length > 0
          ? { attachments: request.attachments }
          : undefined;
      try {
        await AIModel.addMessage(session.id, 'user', request.message, userMetadata);
      } catch (error) {
        if (AIService.isSessionMissingError(error)) {
          throw new AppError(
            409,
            'Chat session is no longer available. Please refresh and try again.',
          );
        }
        throw error;
      }

      // Build conversation history. Content can be a plain string for
      // text-only turns or an OpenAI-style content-parts array when the
      // turn carries an image attachment (#93).
      const messages: { role: string; content: any }[] = [
        { role: 'system', content: buildSystemPrompt(request.context) },
      ];

      // Add previous messages (last 10 for context). User turns with image
      // attachments stored on metadata.attachments must be rebuilt as
      // multimodal content parts; otherwise turn-2+ silently drops the
      // image the vision model already committed to in turn-1 (#93).
      const recentMessages = session.messages.slice(-10);
      for (const msg of recentMessages) {
        messages.push({
          role: msg.role,
          content: this.rebuildHistoryContent(msg),
        });
      }

      // Add current message (multimodal payload built below if attachments)
      messages.push({
        role: 'user',
        content: this.buildUserContent(request.message, request.attachments),
      });

      // Use the provider + model we already resolved before the gating check.
      const provider = providerForChat;
      const modelVersion = modelVersionForChat;

      // Inline any image attachments as data: URLs just before dispatch.
      await this.inlineImageAttachments(messages as any, userId);

      const noReferenceAnswer = await this.buildNoReferencePreflightAnswer(
        userId,
        request.documentId,
        request.message,
        queryType,
        questionCategory,
      );
      if (noReferenceAnswer) {
        const responseTimeMs = Date.now() - startTime;
        const assistantMetadata: Record<string, any> = { logId: log.id };
        const assistantMessage = await AIModel.addMessage(
          session.id,
          'assistant',
          noReferenceAnswer,
          assistantMetadata,
        );

        await AIModel.updateLogWithResponse(log.id, {
          response: noReferenceAnswer,
          responseTimeMs,
          modelVersion,
          status: 'success',
        });

        logger.info('AI chat completed with no-reference preflight answer', {
          userId,
          documentId: request.documentId,
          sessionId: session.id,
          queryType,
          responseTimeMs,
        });

        return {
          sessionId: session.id,
          message: assistantMessage,
          logId: log.id,
        };
      }

      // Reuse the same retrieval-capable streaming engine as the UI, but
      // silence chunks for this REST endpoint.
      const toolCallCollector = new AgentToolCallCollector();
      let ignoreLateProviderEvents = false;
      const providerTimeoutMs = normalizeProviderTimeoutMs(env.aiProviderTimeoutMs);
      let { value: response, timedOut } = await withAIProviderTimeout(
        provider.agentStreamChat(messages as any, () => {}, {
          userId,
          documentId: request.documentId,
          maxTokens: chatMaxTokensForChat,
          onAgentEvent: (event) => {
            if (!ignoreLateProviderEvents) {
              toolCallCollector.observe(event);
            }
          },
        }),
        providerTimeoutMs,
        () => ({
          content: buildProviderTimeoutFallback(providerTimeoutMs),
          tokensUsed: undefined,
        })
      );
      ignoreLateProviderEvents = timedOut;
      if (timedOut) {
        response = await this.recoverAgentTimeoutWithDirectFallback(
          provider,
          messages as any,
          () => {},
          {
            userId,
            documentId: request.documentId,
            maxTokens: shortcutMaxTokensForChat,
          },
          providerTimeoutMs,
        );
      }

      const responseTimeMs = Date.now() - startTime;

      // Add assistant message to session
      const toolCalls = toolCallCollector.finalize();
      const assistantMetadata: Record<string, any> = { logId: log.id };
      if (toolCalls.length > 0) {
        assistantMetadata.toolCalls = toolCalls;
      }
      let assistantMessage;
      try {
        assistantMessage = await AIModel.addMessage(
          session.id,
          'assistant',
          response.content,
          assistantMetadata
        );
      } catch (error) {
        if (AIService.isSessionMissingError(error)) {
          throw new AppError(
            409,
            'Chat session is no longer available. Please refresh and try again.',
          );
        }
        throw error;
      }

      // Update log with response
      await AIModel.updateLogWithResponse(log.id, {
        response: response.content,
        responseTimeMs,
        tokensUsed: response.tokensUsed,
        modelVersion,
        status: 'success',
      });

      logger.info('AI chat completed', {
        userId,
        documentId: request.documentId,
        sessionId: session.id,
        queryType,
        responseTimeMs,
      });

      return {
        sessionId: session.id,
        message: assistantMessage,
        logId: log.id,
      };
    } catch (error) {
      // Update log with error
      await AIModel.updateLogWithResponse(log.id, {
        response: '',
        status: 'error',
        errorMessage: error instanceof Error ? error.message : 'Unknown error',
      });

      logger.error('AI chat failed', {
        userId,
        documentId: request.documentId,
        error,
      });

      throw error;
    }
  }

  /**
   * Stream a chat response
   *
   * `onAgentEvent` (optional) receives every tool-call lifecycle event from the
   * underlying agent loop. The WebSocket handler wraps this to push the
   * `ai:turn-start` / `ai:tool-call` / `ai:tool-result` / `ai:turn-end` frames
   * out to the chat UI for the agentic timeline render.
   */
  static async streamChat(
    userId: string,
    request: AIChatRequest,
    onChunk: (chunk: string) => void,
    onComplete: (response: AIChatResponse) => void,
    onError: (error: Error) => void,
    onAgentEvent?: AgentEventSink
  ): Promise<void> {
    const startTime = Date.now();

    try {
      // Verify document ownership
      const isOwner = await DocumentModel.isOwner(request.documentId, userId);
      if (!isOwner) {
        throw new AppError(404, 'Document not found');
      }

      // Resolve provider + model first so the session snapshot can be
      // captured at creation and capability gating (#93) runs before any
      // DB writes or provider calls.
      const { provider, modelVersion, baseUrl, shortcutMaxTokens, chatMaxTokens } =
        await this.getExecutionSettingsForDocument(userId, request.documentId);
      const capabilities = resolveCapabilitiesOrSafeDefault(baseUrl, modelVersion);

      // Get or create session (self-heals when client sent a stale sessionId)
      const session = await this.resolveChatSession(userId, request, {
        modelVersion,
        capabilities,
      });

      this.enforceCapabilityGating({
        session,
        request,
        baseUrl,
        modelVersion,
      });

      // Classify query type and category
      const queryType = classifyQueryType(request.message);
      const questionCategory = classifyQuestionCategory(request.message, queryType);

      // Create log entry
      const log = await AIModel.createLog({
        documentId: request.documentId,
        userId,
        sessionId: session.id,
        query: request.message,
        queryType,
        questionCategory,
        contextSnapshot: request.context,
      });

      // Add user message to session, carrying attachment metadata when
      // present so the history scan in `enforceCapabilityGating` can detect
      // prior image attachments on subsequent turns.
      const userMetadata: Record<string, any> | undefined =
        request.attachments && request.attachments.length > 0
          ? { attachments: request.attachments }
          : undefined;
      try {
        await AIModel.addMessage(session.id, 'user', request.message, userMetadata);
      } catch (error) {
        if (AIService.isSessionMissingError(error)) {
          throw new AppError(
            409,
            'Chat session is no longer available. Please refresh and try again.',
          );
        }
        throw error;
      }

      // Build conversation history
      const messages: { role: string; content: any }[] = [
        { role: 'system', content: buildSystemPrompt(request.context) },
      ];

      // Add previous messages (last 10 for context). User turns with
      // image attachments are rebuilt as multimodal content parts so
      // turn-2+ does not silently drop the image (#93).
      const recentMessages = session.messages.slice(-10);
      for (const msg of recentMessages) {
        messages.push({
          role: msg.role,
          content: this.rebuildHistoryContent(msg),
        });
      }

      // Add current message (multimodal payload built below if attachments)
      messages.push({
        role: 'user',
        content: this.buildUserContent(request.message, request.attachments),
      });

      // Inline image attachments to data: URLs just before dispatch.
      await this.inlineImageAttachments(messages, userId);

      const noReferenceAnswer = await this.buildNoReferencePreflightAnswer(
        userId,
        request.documentId,
        request.message,
        queryType,
        questionCategory,
      );
      if (noReferenceAnswer) {
        onChunk(noReferenceAnswer);
        const responseTimeMs = Date.now() - startTime;
        const assistantMetadata: Record<string, any> = { logId: log.id };
        const assistantMessage = await AIModel.addMessage(
          session.id,
          'assistant',
          noReferenceAnswer,
          assistantMetadata,
        );

        await AIModel.updateLogWithResponse(log.id, {
          response: noReferenceAnswer,
          responseTimeMs,
          modelVersion,
          status: 'success',
        });

        logger.info('AI stream chat completed with no-reference preflight answer', {
          userId,
          documentId: request.documentId,
          sessionId: session.id,
          queryType,
          responseTimeMs,
        });

        onComplete({
          sessionId: session.id,
          message: assistantMessage,
          logId: log.id,
        });
        return;
      }

      // Collect tool-call lifecycle off the AgentEvent stream so we can
      // persist the timeline on the assistant message metadata for later
      // session reloads (#94). The websocket layer still gets every event
      // in real time via the wrapped sink.
      const toolCallCollector = new AgentToolCallCollector();
      let ignoreLateProviderEvents = false;
      const wrappedAgentEvent: AgentEventSink = (event) => {
        if (ignoreLateProviderEvents) return;
        toolCallCollector.observe(event);
        if (onAgentEvent) emitAgentEvent(onAgentEvent, event);
      };

      // Use the retrieval-capable agent and stream the final response once any
      // needed retrieval tool calls have completed.
      const providerTimeoutMs = normalizeProviderTimeoutMs(env.aiProviderTimeoutMs);
      const safeOnChunk = (chunk: string) => {
        if (!ignoreLateProviderEvents) {
          onChunk(chunk);
        }
      };
      let { value: response, timedOut } = await withAIProviderTimeout(
        provider.agentStreamChat(messages as any, safeOnChunk, {
          userId,
          documentId: request.documentId,
          maxTokens: chatMaxTokens,
          onAgentEvent: wrappedAgentEvent,
        }),
        providerTimeoutMs,
        () => {
          const fallback = buildProviderTimeoutFallback(providerTimeoutMs);
          return {
            content: fallback,
            tokensUsed: undefined,
          };
        }
      );
      ignoreLateProviderEvents = timedOut;
      if (timedOut) {
        response = await this.recoverAgentTimeoutWithDirectFallback(
          provider,
          messages as any,
          onChunk,
          {
            userId,
            documentId: request.documentId,
            maxTokens: shortcutMaxTokens,
            onAgentEvent: wrappedAgentEvent,
          },
          providerTimeoutMs,
        );
      }

      const responseTimeMs = Date.now() - startTime;

      // Add assistant message to session. Persist the tool-call timeline on
      // metadata so reopening the chat panel rehydrates the agent trail
      // instead of showing only the bare final answer (#94).
      const toolCalls = toolCallCollector.finalize();
      const assistantMetadata: Record<string, any> = { logId: log.id };
      if (toolCalls.length > 0) {
        assistantMetadata.toolCalls = toolCalls;
      }
      let assistantMessage;
      try {
        assistantMessage = await AIModel.addMessage(
          session.id,
          'assistant',
          response.content,
          assistantMetadata,
        );
      } catch (error) {
        if (AIService.isSessionMissingError(error)) {
          throw new AppError(
            409,
            'Chat session is no longer available. Please refresh and try again.',
          );
        }
        throw error;
      }

      // Update log with response
      await AIModel.updateLogWithResponse(log.id, {
        response: response.content,
        responseTimeMs,
        tokensUsed: response.tokensUsed,
        modelVersion,
        status: 'success',
      });

      logger.info('AI stream chat completed', {
        userId,
        documentId: request.documentId,
        sessionId: session.id,
        queryType,
        responseTimeMs,
      });

      onComplete({
        sessionId: session.id,
        message: assistantMessage,
        logId: log.id,
      });
    } catch (error) {
      logger.error('AI stream chat failed', {
        userId,
        documentId: request.documentId,
        error,
      });

      onError(error instanceof Error ? error : new Error('Unknown error'));
    }
  }

  /**
   * Apply a suggestion and log the modification
   */
  static async applySuggestion(
    userId: string,
    logId: string,
    suggestionId: string,
    modification: AIContentModification
  ): Promise<AIInteractionLog> {
    const log = await AIModel.findLogById(logId);
    if (!log) {
      throw new AppError(404, 'Log not found');
    }

    if (log.userId !== userId) {
      throw new AppError(403, 'Unauthorized');
    }

    // Update log with modification
    const updatedLog = await AIModel.updateLogWithModifications(logId, [modification]);
    if (!updatedLog) {
      throw new AppError(500, 'Failed to update log');
    }

    logger.info('AI suggestion applied', {
      userId,
      logId,
      suggestionId,
    });

    return updatedLog;
  }

  /**
   * Get AI interaction logs for a document
   */
  static async getLogs(
    userId: string,
    documentId: string,
    filters: Omit<AILogQueryFilters, 'documentId' | 'userId'> = {}
  ): Promise<{ logs: AIInteractionLog[]; total: number }> {
    // Verify document ownership
    const isOwner = await DocumentModel.isOwner(documentId, userId);
    if (!isOwner) {
      throw new AppError(404, 'Document not found');
    }

    return AIModel.getLogsByDocument(documentId, userId, filters.limit, filters.offset);
  }

  /**
   * Get a specific log entry
   */
  static async getLog(userId: string, logId: string): Promise<AIInteractionLog> {
    const log = await AIModel.findLogById(logId);
    if (!log) {
      throw new AppError(404, 'Log not found');
    }

    if (log.userId !== userId) {
      throw new AppError(403, 'Unauthorized');
    }

    return log;
  }

  /**
   * Get chat sessions for a document
   */
  static async getSessions(
    userId: string,
    documentId: string,
    limit = 10
  ): Promise<AIChatSession[]> {
    // Verify document ownership
    const isOwner = await DocumentModel.isOwner(documentId, userId);
    if (!isOwner) {
      throw new AppError(404, 'Document not found');
    }

    return AIModel.getSessionsByDocument(documentId, userId, limit);
  }

  /**
   * Get a specific session with messages
   */
  static async getSession(
    userId: string,
    sessionId: string
  ): Promise<AIChatSession> {
    const session = await AIModel.findSessionById(sessionId);
    if (!session) {
      throw new AppError(404, 'Session not found');
    }

    if (session.userId !== userId) {
      throw new AppError(403, 'Unauthorized');
    }

    return session;
  }

  /**
   * Close a session
   */
  static async closeSession(userId: string, sessionId: string): Promise<void> {
    const session = await AIModel.findSessionById(sessionId);
    if (!session) {
      throw new AppError(404, 'Session not found');
    }

    if (session.userId !== userId) {
      throw new AppError(403, 'Unauthorized');
    }

    await AIModel.closeSession(sessionId);

    logger.info('AI session closed', { userId, sessionId });
  }

  /**
   * Delete a session completely (including messages and logs)
   */
  static async deleteSession(userId: string, sessionId: string): Promise<void> {
    const session = await AIModel.findSessionById(sessionId);
    if (!session) {
      throw new AppError(404, 'Session not found');
    }

    if (session.userId !== userId) {
      throw new AppError(403, 'Unauthorized');
    }

    await AIModel.deleteSession(sessionId);

    logger.info('AI session deleted', { userId, sessionId });
  }
}

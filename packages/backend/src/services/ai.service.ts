import OpenAI from 'openai';
import { AIModel } from '../models/ai.model';
import { DocumentModel } from '../models/document.model';
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
} from '@humanly/shared';
import { AppError } from '../middleware/error-handler';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { UserAISettingsModel } from '../models/user-ai-settings.model';

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

interface AgentChatOptions {
  userId: string;
  documentId: string;
  maxTokens?: number;
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
  private client: OpenAI;

  constructor(config?: { apiKey: string; model: string; baseUrl: string }) {
    this.apiKey = config?.apiKey || env.aiApiKey || '';
    this.model = config?.model || env.aiModel || 'Qwen/Qwen3.5-397B-A17B';
    this.baseUrl = config?.baseUrl || env.aiBaseUrl || 'https://api.together.xyz/v1';
    this.client = new OpenAI({
      apiKey: this.apiKey || 'missing-api-key',
      baseURL: this.baseUrl,
    });
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
    for (let i = 0; i < 6; i++) {
      emitAgentEvent(options.onAgentEvent, { type: 'turn-start', turnIndex: i });
      try {
        response = await this.client.responses.create({
          model: this.model,
          input,
          instructions: buildRetrievalInstructions(options.documentId),
          tools: AIRetrievalService.tools,
          max_output_tokens: options.maxTokens || 2048,
          parallel_tool_calls: true,
        });
      } catch (error) {
        this.handleSDKError(error);
      }

      const toolCalls = response.output?.filter((item: any) => item.type === 'function_call') || [];
      if (toolCalls.length === 0) {
        logger.info('AI agent completed without additional tool calls', {
          userId: options.userId,
          documentId: options.documentId,
          iteration: i + 1,
        });
        const split = splitStaticThinking(response.output_text || '');
        emitThinkingDelta(options.onAgentEvent, split.thinking);
        emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex: i });
        return {
          content: split.visible,
          tokensUsed: response.usage ? {
            input: response.usage.input_tokens,
            output: response.usage.output_tokens,
          } : undefined,
        };
      }

      logger.info('AI agent requested retrieval tools', {
        userId: options.userId,
        documentId: options.documentId,
        iteration: i + 1,
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

        input.push({
          type: 'function_call_output',
          call_id: toolCall.call_id,
          output,
        });
      }
      emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex: i });
    }

    return {
      content: response?.output_text || 'I could not complete retrieval within the tool-call limit.',
      tokensUsed: response?.usage ? {
        input: response.usage.input_tokens,
        output: response.usage.output_tokens,
      } : undefined,
    };
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

    for (let i = 0; i < 6; i++) {
      emitAgentEvent(options.onAgentEvent, { type: 'turn-start', turnIndex: i });
      let completion: any;
      try {
        completion = await this.client.chat.completions.create({
          model: this.model,
          messages: chatMessages,
          tools: chatTools,
          tool_choice: 'auto',
          max_tokens: options.maxTokens || 2048,
        } as any);
      } catch (error) {
        this.handleSDKError(error);
      }

      lastUsage = completion.usage ? {
        input: completion.usage.prompt_tokens,
        output: completion.usage.completion_tokens,
      } : lastUsage;

      const assistantMessage = completion.choices?.[0]?.message || {};
      emitThinkingDelta(options.onAgentEvent, assistantMessage.reasoning_content || assistantMessage.reasoning || '');
      const toolCalls = assistantMessage.tool_calls || [];
      if (toolCalls.length === 0) {
        logger.info('AI agent completed without additional tool calls', {
          userId: options.userId,
          documentId: options.documentId,
          iteration: i + 1,
          transport: 'chat_completions',
        });
        const split = splitStaticThinking(assistantMessage.content || '');
        emitThinkingDelta(options.onAgentEvent, split.thinking);
        emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex: i });
        return {
          content: split.visible,
          tokensUsed: lastUsage,
        };
      }

      logger.info('AI agent requested retrieval tools', {
        userId: options.userId,
        documentId: options.documentId,
        iteration: i + 1,
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

        chatMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: output,
        });
      }
      emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex: i });
    }

    return {
      content: 'I could not complete retrieval within the tool-call limit.',
      tokensUsed: lastUsage,
    };
  }

  private async agentStreamChatCompletions(
    messages: { role: string; content: string }[],
    onChunk: (chunk: string) => void,
    options: AgentChatOptions
  ): Promise<{ content: string; tokensUsed?: { input: number; output: number } }> {
    const chatTools = this.buildChatCompletionTools();
    const chatMessages = this.buildChatCompletionMessages(messages, options.documentId);
    let lastUsage: { input: number; output: number } | undefined;

    for (let i = 0; i < 6; i++) {
      emitAgentEvent(options.onAgentEvent, { type: 'turn-start', turnIndex: i });
      let completion: any;
      try {
        completion = await this.client.chat.completions.create({
          model: this.model,
          messages: chatMessages,
          tools: chatTools,
          tool_choice: 'auto',
          max_tokens: options.maxTokens || 2048,
        } as any);
      } catch (error) {
        this.handleSDKError(error);
      }

      lastUsage = completion.usage ? {
        input: completion.usage.prompt_tokens,
        output: completion.usage.completion_tokens,
      } : lastUsage;

      const assistantMessage = completion.choices?.[0]?.message || {};
      emitThinkingDelta(options.onAgentEvent, assistantMessage.reasoning_content || assistantMessage.reasoning || '');
      const toolCalls = assistantMessage.tool_calls || [];
      if (toolCalls.length === 0) {
        logger.info('AI agent final response streaming started', {
          userId: options.userId,
          documentId: options.documentId,
          iteration: i + 1,
          transport: 'chat_completions',
        });
        const finalContent = await this.streamFinalChatCompletion(chatMessages, onChunk, options);
        emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex: i });
        return {
          content: finalContent,
          tokensUsed: lastUsage,
        };
      }

      logger.info('AI agent requested retrieval tools', {
        userId: options.userId,
        documentId: options.documentId,
        iteration: i + 1,
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

        chatMessages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: output,
        });
      }
      emitAgentEvent(options.onAgentEvent, { type: 'turn-end', turnIndex: i });
    }

    const fallback = 'I could not complete retrieval within the tool-call limit.';
    onChunk(fallback);
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
    try {
      stream = await this.client.chat.completions.create({
        model: this.model,
        messages: chatMessages,
        stream: true,
        max_tokens: options.maxTokens || 2048,
      } as any);
    } catch (error) {
      this.handleSDKError(error);
    }

    let fullContent = '';
    const thinkingSplitter = new ThinkingContentSplitter();
    for await (const chunk of stream) {
      const delta = chunk.choices?.[0]?.delta || {};
      const reasoning = delta.reasoning_content || delta.reasoning || '';
      emitThinkingDelta(options.onAgentEvent, reasoning);

      const content = delta.content || '';
      if (content) {
        const split = thinkingSplitter.push(content);
        emitThinkingDelta(options.onAgentEvent, split.thinking);
        if (split.visible) {
          fullContent += split.visible;
          onChunk(split.visible);
        }
      }
    }

    const flushed = thinkingSplitter.flush();
    emitThinkingDelta(options.onAgentEvent, flushed.thinking);
    if (flushed.visible) {
      fullContent += flushed.visible;
      onChunk(flushed.visible);
    }

    return fullContent;
  }

  private handleSDKError(error: unknown): never {
    const sdkError = error as any;
    logger.error('OpenAI API error', { status: sdkError?.status, error: sdkError });
    const detail = sdkError?.error?.message || sdkError?.message || '';
    const prefix = 'AI Provider: ';

    if (sdkError?.status === 401) {
      throw new AppError(502, detail ? `${prefix}${detail}` : 'Invalid API key. Please check your AI settings.');
    }
    if (sdkError?.status === 429) {
      throw new AppError(429, detail ? `${prefix}${detail}` : 'Rate limit exceeded. Please try again later.');
    }
    if (sdkError?.status === 404) {
      throw new AppError(400, detail ? `${prefix}${detail}` : `Model "${this.model}" not found. Please check your AI settings.`);
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

  private generateMockResponse(query: string): string {
    const lowerQuery = query.toLowerCase();

    if (lowerQuery.includes('grammar') || lowerQuery.includes('check')) {
      return 'I\'ve reviewed your text and found a few suggestions:\n\n1. Consider using active voice in paragraph 2\n2. The comma after "However" should be added\n3. "Their" should be "there" in line 5\n\nWould you like me to apply these corrections?';
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

function buildRetrievalInstructions(documentId: string): string {
  return `You are an AI writing assistant integrated into a document editor and PDF review system.

Use the retrieval tools as your source of truth. Do not rely only on preloaded summaries, selected text, or prior chat context when the user asks about the document or a linked PDF.

Routing:
- For the current written document, call getDocumentText for the full body and searchDocument for targeted keyword lookups.
- For uploaded reference PDFs, call listLinkedPapers first to discover paper IDs, then call getPaperContent with mode="search" (keyword), mode="page" (specific page), or mode="section" (named section like "Methods").
- If the answer requires multiple sources, call multiple tools and synthesize them.

Current scoped documentId: ${documentId}
Answer concisely. Mention when available evidence is incomplete or a tool returns no relevant data.`;
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
   * Get AI provider for a specific user (loads their settings from DB)
   */
  private static async getProviderForUser(userId: string): Promise<AIProvider> {
    const settings = await UserAISettingsModel.getByUserId(userId);
    if (!settings) {
      throw new AppError(400, 'Please configure your AI settings first');
    }
    return new OpenAIProvider({
      apiKey: settings.apiKey,
      baseUrl: settings.baseUrl,
      model: settings.model,
    });
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

    const provider = await this.getProviderForUser(userId);

    // Build simple messages without conversation history
    const messages: { role: string; content: string }[] = [
      { role: 'system', content: buildQuickActionSystemPrompt(request.context) },
      { role: 'user', content: request.message },
    ];

    // Get AI response
    const response = await provider.agentChat(messages, {
      userId,
      documentId: request.documentId,
    });

    logger.info('AI silent chat completed', {
      userId,
      documentId: request.documentId,
    });

    return {
      message: {
        id: `silent-${Date.now()}`,
        role: 'assistant',
        content: response.content,
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

      const provider = await this.getProviderForUser(userId);

      const messages: { role: string; content: string }[] = [
        { role: 'system', content: buildQuickActionSystemPrompt(request.context) },
        { role: 'user', content: request.message },
      ];

      const response = await provider.agentStreamChat(messages, onChunk, {
        userId,
        documentId: request.documentId,
      });

      logger.info('AI silent stream chat completed', {
        userId,
        documentId: request.documentId,
        bytes: response.content.length,
      });

      onComplete(response.content);
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

    // Get or create session
    const session = request.sessionId
      ? await AIModel.findSessionById(request.sessionId)
      : await AIModel.getOrCreateSession(request.documentId, userId);

    if (!session) {
      throw new AppError(404, 'Session not found');
    }

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
      // Add user message to session
      await AIModel.addMessage(session.id, 'user', request.message);

      // Build conversation history
      const messages: { role: string; content: string }[] = [
        { role: 'system', content: buildSystemPrompt(request.context) },
      ];

      // Add previous messages (last 10 for context)
      const recentMessages = session.messages.slice(-10);
      for (const msg of recentMessages) {
        messages.push({ role: msg.role, content: msg.content });
      }

      // Add current message
      messages.push({ role: 'user', content: request.message });

      // Get provider for user
      const provider = await this.getProviderForUser(userId);

      // Get AI response
      const response = await provider.agentChat(messages, {
        userId,
        documentId: request.documentId,
      });

      const responseTimeMs = Date.now() - startTime;

      // Add assistant message to session
      const assistantMessage = await AIModel.addMessage(
        session.id,
        'assistant',
        response.content,
        { logId: log.id }
      );

      // Get user's model for logging
      const userSettings = await UserAISettingsModel.getByUserId(userId);

      // Update log with response
      await AIModel.updateLogWithResponse(log.id, {
        response: response.content,
        responseTimeMs,
        tokensUsed: response.tokensUsed,
        modelVersion: userSettings?.model || 'unknown',
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

      // Get or create session
      const session = request.sessionId
        ? await AIModel.findSessionById(request.sessionId)
        : await AIModel.getOrCreateSession(request.documentId, userId);

      if (!session) {
        throw new AppError(404, 'Session not found');
      }

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

      // Add user message to session
      await AIModel.addMessage(session.id, 'user', request.message);

      // Build conversation history
      const messages: { role: string; content: string }[] = [
        { role: 'system', content: buildSystemPrompt(request.context) },
      ];

      // Add previous messages (last 10 for context)
      const recentMessages = session.messages.slice(-10);
      for (const msg of recentMessages) {
        messages.push({ role: msg.role, content: msg.content });
      }

      // Add current message
      messages.push({ role: 'user', content: request.message });

      // Get provider for user
      const provider = await this.getProviderForUser(userId);

      // Use the retrieval-capable agent and stream the final response once any
      // needed retrieval tool calls have completed.
      const response = await provider.agentStreamChat(messages, onChunk, {
        userId,
        documentId: request.documentId,
        onAgentEvent,
      });

      const responseTimeMs = Date.now() - startTime;

      // Add assistant message to session
      const assistantMessage = await AIModel.addMessage(
        session.id,
        'assistant',
        response.content,
        { logId: log.id }
      );

      // Get user's model for logging
      const userSettings = await UserAISettingsModel.getByUserId(userId);

      // Update log with response
      await AIModel.updateLogWithResponse(log.id, {
        response: response.content,
        responseTimeMs,
        tokensUsed: response.tokensUsed,
        modelVersion: userSettings?.model || 'unknown',
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

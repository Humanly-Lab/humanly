import { AIChatRequest, AIChatResponse, AgentEvent } from '@humanly/shared';
import { AIService, AgentEventSink } from './ai.service';

export interface AgentRunOptions {
  userId: string;
  request: AIChatRequest;
  onTextChunk: (chunk: string) => void;
  onAgentEvent?: AgentEventSink;
  onComplete: (response: AIChatResponse) => void;
  onError: (error: Error) => void;
}

/**
 * AgentRunner orchestrates an agentic chat turn: streaming the LLM response,
 * invoking retrieval tools, and surfacing every step as a typed AgentEvent so
 * the WebSocket layer can render a Cursor-style tool-call timeline in the UI.
 *
 * In this issue (#02) AgentRunner is a thin facade over AIService.streamChat
 * that hands the AgentEvent sink through to the tool-calling loop inside
 * OpenAIProvider. Future issues extend it with editor-write tools and
 * cursor/selection awareness, and may take over the loop directly so the
 * provider shrinks to a "single completion" surface.
 */
export class AgentRunner {
  static async run(options: AgentRunOptions): Promise<void> {
    await AIService.streamChat(
      options.userId,
      options.request,
      options.onTextChunk,
      options.onComplete,
      options.onError,
      options.onAgentEvent,
    );
  }
}

export type { AgentEvent };

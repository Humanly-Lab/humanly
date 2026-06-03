'use client';

import React, { useState, useRef, useEffect, useMemo, useCallback } from 'react';
import { X, Send, Sparkles, Loader2, StopCircle, Trash2, History, ChevronDown, ChevronRight, Plus, CheckCircle, ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { cn } from '@/lib/utils';
import { modelSupportsImage } from '@/lib/ai-models';
import { uploadChatImage, validateChatImage } from '@/lib/ai-chat-attachments';
import type { ChatImageAttachment } from '@humanly/shared';
import { useAI, useAILogs } from '@/hooks/use-ai';
import { useAIStore } from '@/stores/ai-store';
import { usePDFTextStore } from '@/stores/pdf-text-store';
import { AIChatMessage, AISuggestion, AIInteractionLog } from '@humanly/shared';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { MarkdownContent } from '@/components/markdown-content';
import { ReasoningBlock, ToolCallTimeline } from './tool-call-card';
import api from '@/lib/api-client';
import type { ToolCallEntry } from '@/stores/ai-store';

interface AIAssistantPanelProps {
  documentId: string;
  onClose: () => void;
  onApplySuggestion?: (suggestion: AISuggestion, text: string) => void;
  getSelection?: () => { text: string; start: number; end: number } | null;
  taskManaged?: boolean;
  lockedModel?: string;
  lockedBaseUrl?: string;
  insertAtCursor?: ((text: string, source: { messageId: string; logId?: string }) => void | Promise<void>) | null;
}

const QUICK_ACTION_PROMPT_PREFIXES = [
  'Fix any grammar, spelling, and punctuation errors in the following text.',
  'Improve the following text to make it clearer and more professional while keeping the same meaning.',
  'Simplify the following text to make it easier to understand while keeping the same meaning.',
  'Rewrite the following text in a more formal and professional tone.',
];

const QUICK_ACTION_HISTORY_LABEL_PREFIXES = [
  'Fix grammar:',
  'Improve writing:',
  'Simplify text:',
  'Make formal:',
];

const MAX_CHAT_IMAGE_ATTACHMENTS = 5;

function isQuickActionHistoryLog(log: AIInteractionLog): boolean {
  const query = log.query.trim();

  return QUICK_ACTION_PROMPT_PREFIXES.some((prefix) => query.startsWith(prefix))
    || QUICK_ACTION_HISTORY_LABEL_PREFIXES.some((prefix) => query.startsWith(prefix));
}

function isVisibleConversationHistoryLog(log: AIInteractionLog): boolean {
  const contextSnapshot = log.contextSnapshot as any;
  return Boolean(log.sessionId)
    && !contextSnapshot?.conversationDeleted
    && !isQuickActionHistoryLog(log);
}

function formatModelOptionLabel(baseUrl: string, modelId: string): string {
  const modality = modelSupportsImage(baseUrl, modelId) ? 'image+text' : 'text only';
  return `${modelId} (${modality})`;
}

function getImageInputUnsupportedMessage(modelId: string): string {
  return `Model "${modelId || 'Current model'}" doesn't accept image input. Switch to a vision-capable model to attach images.`;
}

function dataTransferHasFiles(dataTransfer: DataTransfer): boolean {
  return Array.from(dataTransfer.types || []).includes('Files');
}

function filesFromList(fileList: FileList | File[] | null | undefined): File[] {
  return fileList ? Array.from(fileList) : [];
}

function getImageFilesFromDataTransfer(dataTransfer: DataTransfer): File[] {
  const filesFromItems = Array.from(dataTransfer.items || [])
    .filter((item) => item.kind === 'file' && item.type.startsWith('image/'))
    .map((item) => item.getAsFile())
    .filter((file): file is File => Boolean(file));

  if (filesFromItems.length > 0) {
    return filesFromItems;
  }

  return filesFromList(dataTransfer.files).filter((file) => file.type.startsWith('image/'));
}

export function AIAssistantPanel({
  documentId,
  onClose,
  onApplySuggestion,
  getSelection,
  taskManaged = false,
  lockedModel,
  lockedBaseUrl,
  insertAtCursor,
}: AIAssistantPanelProps) {
  const [input, setInput] = useState('');
  // Pending image attachments staged in the input bar. Uploaded as soon as
  // the user picks them so the websocket frame only carries a storageKey
  // (#93). Cleared on send / cancel.
  const [pendingAttachments, setPendingAttachments] = useState<ChatImageAttachment[]>([]);
  const [attachmentUploading, setAttachmentUploading] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [imageDragActive, setImageDragActive] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [historyPopoverOpen, setHistoryPopoverOpen] = useState(false);
  const [sessionPendingDelete, setSessionPendingDelete] = useState<string | null>(null);
  const [isDeletingSession, setIsDeletingSession] = useState(false);
  const [hasAISettings, setHasAISettings] = useState<boolean | null>(null); // null = loading
  const [currentModel, setCurrentModel] = useState('');
  const [currentBaseUrl, setCurrentBaseUrl] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const checkAISettings = useCallback(async () => {
    if (taskManaged) {
      setHasAISettings(true);
      setCurrentModel(lockedModel || '');
      setCurrentBaseUrl(lockedBaseUrl || '');
      return;
    }

    try {
      const res: any = await api.get('/ai/settings');
      const hasKey = res.data?.hasApiKey === true;
      setHasAISettings(hasKey);
      if (hasKey) {
        setCurrentModel(lockedModel || res.data.model || '');
        setCurrentBaseUrl(lockedBaseUrl || res.data.baseUrl || '');
      }
    } catch {
      setHasAISettings(false);
    }
  }, [lockedBaseUrl, lockedModel, taskManaged]);

  // Check if the user has a usable key. Model/provider are document-bound
  // when a writing environment was configured, so the editor does not expose
  // mutable AI settings or a model switcher.
  useEffect(() => {
    checkAISettings();
  }, [checkAISettings]);

  const {
    messages,
    isStreaming,
    streamingContent,
    streamingMessageId,
    suggestions,
    toolCallTimelines,
    thinkingByMessageId,
    isLoading,
    error,
    sendMessage,
    cancelStream,
    clearMessages,
    startNewChat,
    loadSession,
    viewLogsAsMessages,
    deleteSession: deleteChatSession,
    clearError,
  } = useAI(documentId);

  const { logs, isLoading: logsLoading, loadMore, hasMore, refresh: refreshLogs } = useAILogs(documentId);

  const chatHistoryLogs = useMemo(
    () => logs.filter(isVisibleConversationHistoryLog),
    [logs]
  );

  const quotedText = useAIStore((state) => state.quotedText);
  const clearQuotedText = useAIStore((state) => state.clearQuotedText);

  // Get PDF text data for context
  const getPDFText = usePDFTextStore((state) => state.getPDFText);
  const pdfTextData = getPDFText(documentId);

  // Calculate unique session count from logs
  const sessionCount = useMemo(() => {
    const uniqueSessions = new Set<string>();
    chatHistoryLogs.forEach(log => {
      const key = log.sessionId || `standalone-${log.id}`;
      uniqueSessions.add(key);
    });
    return uniqueSessions.size;
  }, [chatHistoryLogs]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, streamingContent]);

  // Focus input when panel opens
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  // Focus input when quoted text arrives
  useEffect(() => {
    if (quotedText) {
      setTimeout(() => {
        textareaRef.current?.focus();
      }, 100);
    }
  }, [quotedText]);

  // Capability gating mirrors the backend matrix (#93). Disables the
  // image picker and switch-blocking modal for unknown providers (which we
  // safe-default to text-only) and for whitelisted text-only models.
  const currentSupportsImage = useMemo(
    () => modelSupportsImage(currentBaseUrl, currentModel),
    [currentBaseUrl, currentModel],
  );

  const stageImageFiles = useCallback(async (files: File[]) => {
    if (files.length === 0) return;

    setAttachmentError(null);

    if (!currentSupportsImage) {
      setAttachmentError(getImageInputUnsupportedMessage(currentModel));
      return;
    }

    const remainingSlots = MAX_CHAT_IMAGE_ATTACHMENTS - pendingAttachments.length;
    if (files.length > remainingSlots) {
      setAttachmentError(`At most ${MAX_CHAT_IMAGE_ATTACHMENTS} images can be attached per message.`);
      return;
    }

    for (const file of files) {
      const validation = validateChatImage(file);
      if (!validation.ok) {
        setAttachmentError(validation.reason);
        return;
      }
    }

    setAttachmentUploading(true);
    try {
      const descriptors = await Promise.all(files.map((file) => uploadChatImage(file)));
      setPendingAttachments((prev) => [...prev, ...descriptors]);
    } catch (err: any) {
      setAttachmentError(err?.message || 'Failed to upload image');
    } finally {
      setAttachmentUploading(false);
    }
  }, [currentModel, currentSupportsImage, pendingAttachments.length]);

  const handlePickAttachment = () => {
    setAttachmentError(null);
    fileInputRef.current?.click();
  };

  const handleAttachmentChosen = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    // Reset the input so picking the same file twice still fires `change`.
    e.target.value = '';
    if (!file) return;
    await stageImageFiles([file]);
  };

  const handleRemoveAttachment = (storageKey: string) => {
    setPendingAttachments((prev) => prev.filter((a) => a.storageKey !== storageKey));
  };

  const handleSubmit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const hasText = Boolean(input.trim());
    const hasAttachments = pendingAttachments.length > 0;
    if ((!hasText && !hasAttachments) || isStreaming) return;

    // Hard refuse if a text-only model is selected with images staged.
    if (hasAttachments && !currentSupportsImage) {
      setAttachmentError(getImageInputUnsupportedMessage(currentModel));
      return;
    }

    // Build context. Full document/PDF retrieval now happens server-side through
    // Server-side tool calls handle full document and PDF retrieval.
    const context: any = {};
    if (getSelection) {
      const selection = getSelection();
      if (selection && selection.text) {
        context.selection = selection;
      }
    }

    if (pdfTextData && !pdfTextData.error && !pdfTextData.isExtracting) {
      console.log(`[AI Assistant] PDF available (${pdfTextData.numPages} pages); using server-side retrieval tools instead of preloaded PDF context`);
    } else {
      console.log('[AI Assistant] Using server-side document retrieval tools instead of preloaded full document context');
    }

    // Include quoted text as context
    let messageToSend = input.trim();
    if (quotedText) {
      context.selectedText = quotedText;
      messageToSend = `Regarding this text:\n"${quotedText}"\n\n${messageToSend}`;
    }

    sendMessage(
      messageToSend,
      Object.keys(context).length > 0 ? context : undefined,
      pendingAttachments.length > 0 ? pendingAttachments : undefined,
    );
    setInput('');
    setPendingAttachments([]);
    setAttachmentError(null);
    clearQuotedText();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const handlePasteImage = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const imageFiles = getImageFilesFromDataTransfer(event.clipboardData);
    if (imageFiles.length === 0) return;

    event.preventDefault();
    void stageImageFiles(imageFiles);
  };

  const handleAttachmentDragOver = (event: React.DragEvent<HTMLDivElement>) => {
    if (!dataTransferHasFiles(event.dataTransfer)) return;

    event.preventDefault();
    event.stopPropagation();
    event.dataTransfer.dropEffect = currentSupportsImage ? 'copy' : 'none';
    setImageDragActive(true);
  };

  const handleAttachmentDragLeave = (event: React.DragEvent<HTMLDivElement>) => {
    const relatedTarget = event.relatedTarget;
    if (relatedTarget instanceof Node && event.currentTarget.contains(relatedTarget)) {
      return;
    }
    setImageDragActive(false);
  };

  const handleAttachmentDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (!dataTransferHasFiles(event.dataTransfer)) return;

    event.preventDefault();
    event.stopPropagation();
    setImageDragActive(false);

    const imageFiles = getImageFilesFromDataTransfer(event.dataTransfer);
    if (imageFiles.length === 0) {
      setAttachmentError('Drop an image file to attach it to chat.');
      return;
    }

    void stageImageFiles(imageFiles);
  };

  const handleApplySuggestion = (suggestion: AISuggestion) => {
    if (onApplySuggestion && suggestion.suggestedText) {
      onApplySuggestion(suggestion, suggestion.suggestedText);
    }
  };

  const handleNewChat = async () => {
    await startNewChat();
    refreshLogs();
    textareaRef.current?.focus();
  };

  // Handle clearing chat - also refreshes logs to update history
  const handleClearChat = async () => {
    await clearMessages();
    // Refresh logs to update the chat history list
    refreshLogs();
  };

  const handleOpenHistory = () => {
    refreshLogs();
    setHistoryPopoverOpen(true);
  };

  const handleSelectHistorySession = async (sessionId: string) => {
    await loadSession(sessionId);
    setHistoryPopoverOpen(false);
  };

  const handleSelectHistoryLogs = (logs: AIInteractionLog[]) => {
    viewLogsAsMessages(logs);
    setHistoryPopoverOpen(false);
  };

  const handleRequestDeleteHistorySession = (sessionId: string) => {
    setSessionPendingDelete(sessionId);
  };

  const handleConfirmDeleteHistorySession = async () => {
    if (!sessionPendingDelete) return;

    setIsDeletingSession(true);
    try {
      await deleteChatSession(sessionPendingDelete);
      await refreshLogs();
      setSessionPendingDelete(null);
    } finally {
      setIsDeletingSession(false);
    }
  };

  const streamingToolCalls = streamingMessageId ? toolCallTimelines[streamingMessageId] : undefined;
  const hasStreamingToolCalls = Boolean(streamingToolCalls?.length);
  const streamingThinking = streamingMessageId ? thinkingByMessageId?.[streamingMessageId] : undefined;
  const hasStreamingThinking = Boolean(streamingThinking?.trim());

  return (
    <div className="flex h-full w-full flex-col bg-background min-w-0 overflow-hidden">
      {/* Header - Match Editor style */}
      <div className="flex items-center justify-between px-4 py-3 border-b bg-background shrink-0 min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="h-4 w-4 text-primary shrink-0" />
          <span className="font-medium text-sm truncate">AI Assistant</span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {/* New Chat Button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleNewChat}
            title="New Chat"
          >
            <Plus className="h-4 w-4" />
          </Button>

          {/* History Button */}
          <Button
            variant="ghost"
            size="sm"
            className="h-8 w-8 p-0"
            onClick={handleOpenHistory}
            title="Chat History"
          >
            <History className="h-4 w-4" />
          </Button>

          {/* History Dialog */}
          <Dialog open={historyPopoverOpen} onOpenChange={setHistoryPopoverOpen}>
            <DialogContent className="max-w-md p-0 max-h-[80vh] flex flex-col">
              <DialogHeader className="px-4 py-3 border-b shrink-0">
                <DialogTitle className="text-sm font-semibold">Chat History</DialogTitle>
                {sessionCount > 0 && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {sessionCount} conversation{sessionCount !== 1 ? 's' : ''}
                  </p>
                )}
              </DialogHeader>

              {/* History List - scrollable */}
              <div className="flex-1 overflow-hidden">
                <ChatHistoryList
                  logs={chatHistoryLogs}
                  isLoading={logsLoading}
                  hasMore={hasMore}
                  onLoadMore={loadMore}
                  onSelectSession={handleSelectHistorySession}
                  onSelectLogs={handleSelectHistoryLogs}
                  onDeleteSession={handleRequestDeleteHistorySession}
                />
              </div>
            </DialogContent>
          </Dialog>

          <AlertDialog
            open={!!sessionPendingDelete}
            onOpenChange={(open) => {
              if (!open && !isDeletingSession) {
                setSessionPendingDelete(null);
              }
            }}
          >
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete this conversation?</AlertDialogTitle>
                <AlertDialogDescription>
                  This permanently deletes the selected AI chat session from the database.
                  This action cannot be undone.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={isDeletingSession}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={(event) => {
                    event.preventDefault();
                    handleConfirmDeleteHistorySession();
                  }}
                  disabled={isDeletingSession}
                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                >
                  {isDeletingSession ? 'Deleting...' : 'Delete permanently'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>

          {/* Close Button */}
          <Button variant="ghost" size="sm" className="h-8 w-8 p-0" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* Messages Area - Scrollable with flex-1 to fill available space */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden min-h-0 w-full">
        <div className="p-4 space-y-4 w-full min-w-0">
          {/* No AI settings configured banner */}
          {hasAISettings === false && (
            <div className="rounded-lg border border-amber-200 bg-amber-50/50 p-4 text-center">
              <Sparkles className="h-8 w-8 text-amber-500 mx-auto mb-2" />
              <h3 className="font-medium text-sm mb-1">AI unavailable</h3>
              <p className="text-xs text-muted-foreground mb-3 max-w-[220px] mx-auto">
                This document&apos;s AI configuration is locked, but no usable API key is available.
              </p>
            </div>
          )}

          {messages.length === 0 && !isStreaming && hasAISettings !== false && (
            <div className="text-center py-12">
              <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h3 className="font-medium text-sm mb-1">How can I help?</h3>
              <p className="text-xs text-muted-foreground max-w-[200px] mx-auto">
                Ask me about grammar, style, or let me help you rewrite content.
              </p>
            </div>
          )}

          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              message={message}
              toolCalls={toolCallTimelines?.[message.id]}
              thinking={thinkingByMessageId?.[message.id]}
              insertAtCursor={insertAtCursor}
            />
          ))}

          {/* Streaming message */}
          {isStreaming && (streamingContent || hasStreamingToolCalls || hasStreamingThinking) && streamingMessageId && (
            <MessageBubble
              message={{
                id: streamingMessageId,
                role: 'assistant',
                content: streamingContent,
                timestamp: new Date(),
              }}
              isStreaming
              toolCalls={streamingToolCalls}
              thinking={streamingThinking}
              insertAtCursor={insertAtCursor}
            />
          )}

          {/* Loading indicator */}
          {isStreaming && !streamingContent && !hasStreamingToolCalls && !hasStreamingThinking && (
            <div className="flex min-w-0 w-full justify-start">
              <div
                className="max-w-[85%] rounded-lg rounded-bl-md bg-muted px-4 py-2.5 text-sm text-muted-foreground"
                role="status"
                aria-live="polite"
              >
                <div className="flex items-center">
                  <span className="humanly-thinking-shimmer font-medium">Thinking</span>
                </div>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Suggestions - Fixed at bottom above input */}
      {suggestions.length > 0 && (
        <div className="border-t px-4 py-3 bg-muted/20 shrink-0 w-full min-w-0">
          <p className="mb-2 humanly-eyebrow text-[10px]">Suggestions</p>
          <div className="space-y-2 min-w-0">
            {suggestions.filter(s => !s.applied).map((suggestion) => (
              <div
                key={suggestion.id}
                className="flex items-start justify-between gap-2 rounded-lg border bg-background p-2.5 min-w-0"
              >
                <div className="flex-1 min-w-0 overflow-hidden">
                  {suggestion.explanation && (
                    <p className="text-xs text-muted-foreground mb-1 break-words">
                      {suggestion.explanation}
                    </p>
                  )}
                  {suggestion.suggestedText && (
                    <p className="text-xs bg-muted/50 px-1.5 py-0.5 rounded truncate">
                      {suggestion.suggestedText}
                    </p>
                  )}
                </div>
                <Button
                  size="sm"
                  variant="secondary"
                  className="h-7 text-xs shrink-0"
                  onClick={() => handleApplySuggestion(suggestion)}
                >
                  Apply
                </Button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Error - Fixed at bottom above input */}
      {error && (
        <div className="border-t px-4 py-3 shrink-0 w-full min-w-0">
          <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 text-xs text-destructive flex items-center justify-between gap-2 min-w-0">
            <span className="break-words flex-1 min-w-0">{error}</span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-destructive hover:text-destructive shrink-0"
              onClick={clearError}
            >
              Dismiss
            </Button>
          </div>
        </div>
      )}

      {/* Input Area - Fixed (sticky) at bottom */}
      <div
        data-testid="ai-chat-input-stack"
        className={cn(
          'flex flex-col gap-2.5 border-t p-4 bg-background shrink-0 w-full min-w-0',
          imageDragActive && (
            currentSupportsImage
              ? 'ring-2 ring-primary/25 bg-muted/20'
              : 'ring-2 ring-destructive/25'
          ),
        )}
        onDragOver={handleAttachmentDragOver}
        onDragLeave={handleAttachmentDragLeave}
        onDrop={handleAttachmentDrop}
      >
        {/* PDF context indicator */}
        {pdfTextData && !pdfTextData.error && !pdfTextData.isExtracting && (
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-[#c8d4c8] bg-[#eef3ed] p-2">
            <CheckCircle className="h-3 w-3 shrink-0 text-[#58715f]" />
            <p className="text-[10px] text-[#58715f]">
              PDF context available ({pdfTextData.numPages} pages)
            </p>
          </div>
        )}

        {/* Quoted text block */}
        {quotedText && (
          <div className="relative min-w-0 rounded-lg border border-border/70 bg-muted/35 p-2.5">
            <div className="flex items-start gap-2 min-w-0">
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="mb-1 humanly-eyebrow text-[10px]">
                  Selected text
                </p>
                <p className="text-xs text-muted-foreground line-clamp-3 italic break-words">
                  &ldquo;{quotedText}&rdquo;
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-5 w-5 p-0 shrink-0 text-muted-foreground hover:text-foreground"
                onClick={clearQuotedText}
              >
                <X className="h-3 w-3" />
              </Button>
            </div>
          </div>
        )}
        {/* Quick model selector */}
        {currentModel && (
          <div className="rounded-lg border bg-muted/40 px-2 py-1.5 text-[11px] text-muted-foreground">
            AI model: {formatModelOptionLabel(currentBaseUrl, currentModel)}
          </div>
        )}
        {/* Pending image attachment chips (#93). Each chip is removable
            before sending; image bytes are already uploaded by the time
            they appear here. */}
        {(pendingAttachments.length > 0 || attachmentError || attachmentUploading) && (
          <div
            data-testid="ai-chat-attachment-row"
            className="flex flex-wrap items-center gap-1.5 text-xs"
          >
            {pendingAttachments.map((a) => (
              <div
                key={a.storageKey}
                className="flex items-center gap-1.5 rounded-lg border border-border bg-muted px-2 py-1"
              >
                <ImageIcon className="h-3 w-3 text-muted-foreground" />
                <span className="max-w-[180px] truncate" title={a.filename}>
                  {a.filename ?? 'image'}
                </span>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground"
                  onClick={() => handleRemoveAttachment(a.storageKey)}
                  aria-label="Remove attachment"
                >
                  <X className="h-3 w-3" />
                </button>
              </div>
            ))}
            {attachmentUploading && (
              <span className="text-muted-foreground inline-flex items-center gap-1">
                <Loader2 className="h-3 w-3 animate-spin" />
                Uploading…
              </span>
            )}
            {attachmentError && (
              <span className="text-destructive">{attachmentError}</span>
            )}
          </div>
        )}
        <form
          data-testid="ai-chat-input-form"
          onSubmit={handleSubmit}
          className="flex gap-2 min-w-0"
        >
          <div className="flex-1 relative min-w-0">
            <Textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={handlePasteImage}
              placeholder={quotedText ? "Ask a question about the selected text..." : "Type your message..."}
              className="min-h-[80px] max-h-[160px] resize-none text-sm w-full"
              disabled={isStreaming}
            />
          </div>
          <div className="flex flex-col gap-1.5 shrink-0">
            {/* Hidden file input, triggered by the image picker button */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/jpg,image/webp,image/gif"
              className="hidden"
              onChange={handleAttachmentChosen}
            />
            {/* Native title attribute (not Tooltip primitive) so this works
                inside test renders that omit the TooltipProvider wrap. */}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-9 w-9 p-0"
              disabled={!currentSupportsImage || isStreaming || attachmentUploading}
              onClick={handlePickAttachment}
              aria-label="Attach image"
              title={
                currentSupportsImage
                  ? 'Attach image (png/jpeg/webp/gif, ≤10 MB)'
                  : `"${currentModel || 'Current model'}" doesn't accept image input`
              }
            >
              <ImageIcon className="h-4 w-4" />
            </Button>
            {isStreaming ? (
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="h-9 w-9 p-0"
                onClick={cancelStream}
              >
                <StopCircle className="h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                size="sm"
                className="h-9 w-9 p-0"
                disabled={(!input.trim() && pendingAttachments.length === 0) || isLoading || attachmentUploading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
              </Button>
            )}
            {messages.length > 0 && (
              <Button
                type="button"
                size="sm"
                variant="ghost"
                className="h-9 w-9 p-0"
                onClick={handleClearChat}
                title="Delete chat"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

// Message Bubble Component - Clean minimal style
interface MessageBubbleProps {
  message: AIChatMessage;
  isStreaming?: boolean;
  toolCalls?: ToolCallEntry[];
  thinking?: string;
  insertAtCursor?: ((text: string, source: { messageId: string; logId?: string }) => void | Promise<void>) | null;
}

function MessageBubble({ message, isStreaming, toolCalls, thinking, insertAtCursor }: MessageBubbleProps) {
  const isUser = message.role === 'user';
  const canInsert = !isUser && !isStreaming && message.content.trim().length > 0;

  return (
    <div className={cn('flex min-w-0 w-full', isUser ? 'justify-end' : 'justify-start')}>
      <div
        className={cn(
          'max-w-[85%] min-w-0 rounded-lg px-4 py-2.5 text-sm overflow-hidden',
          isUser
            ? 'bg-primary text-primary-foreground rounded-br-md'
            : 'bg-muted rounded-bl-md'
        )}
      >
        {isUser ? (
          <div className="whitespace-pre-wrap break-words overflow-wrap-anywhere leading-relaxed min-w-0">
            {message.content}
          </div>
        ) : (
          <div className="min-w-0">
            <ReasoningBlock thinking={thinking} />
            <ToolCallTimeline entries={toolCalls} />
            <MarkdownContent
              trailingContent={isStreaming ? (
                <span className="inline-block w-1.5 h-4 ml-0.5 bg-current animate-pulse rounded-sm" />
              ) : null}
            >
              {message.content}
            </MarkdownContent>
            {canInsert && (
              <InsertAtCursorButton
                disabled={!insertAtCursor}
                onInsert={() => insertAtCursor?.(message.content, {
                  messageId: message.id,
                  logId: message.metadata?.logId,
                })}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

interface InsertAtCursorButtonProps {
  disabled: boolean;
  onInsert: () => void | Promise<void>;
}

function InsertAtCursorButton({ disabled, onInsert }: InsertAtCursorButtonProps) {
  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="mt-2 inline-flex">
            <Button
              type="button"
              size="sm"
              variant="ghost"
              disabled={disabled}
              className="h-7 gap-1.5 px-2 text-[11px] text-muted-foreground hover:text-foreground"
              onClick={onInsert}
            >
              <Plus className="h-3.5 w-3.5" />
              Insert at cursor
            </Button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p>{disabled ? 'Open this document in the editor to insert' : 'Insert this response at the editor cursor'}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// Chat History List - In Dialog
interface ChatHistoryListProps {
  logs: AIInteractionLog[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  onSelectSession?: (sessionId: string) => void;
  onSelectLogs?: (logs: AIInteractionLog[]) => void;
  onDeleteSession?: (sessionId: string) => void;
}

function ChatHistoryList({
  logs,
  isLoading,
  hasMore,
  onLoadMore,
  onSelectSession,
  onSelectLogs,
  onDeleteSession,
}: ChatHistoryListProps) {
  // Group logs by session
  const groupedLogs = useMemo(() => {
    const groups: { sessionId: string | null; date: string; logs: AIInteractionLog[] }[] = [];
    const sessionMap = new Map<string, AIInteractionLog[]>();

    logs.forEach(log => {
      const key = log.sessionId || `standalone-${log.id}`;
      if (!sessionMap.has(key)) {
        sessionMap.set(key, []);
      }
      sessionMap.get(key)!.push(log);
    });

    // Sort sessions by most recent log
    const sortedSessions = Array.from(sessionMap.entries()).sort((a, b) => {
      const aTime = new Date(a[1][0].timestamp).getTime();
      const bTime = new Date(b[1][0].timestamp).getTime();
      return bTime - aTime;
    });

    sortedSessions.forEach(([sessionId, sessionLogs]) => {
      const firstLog = sessionLogs[0];
      const date = new Date(firstLog.timestamp).toLocaleDateString(undefined, {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });
      groups.push({
        sessionId: sessionId.startsWith('standalone-') ? null : sessionId,
        date,
        logs: sessionLogs,
      });
    });

    return groups;
  }, [logs]);

  if (isLoading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-32 text-muted-foreground p-4">
        <History className="h-8 w-8 opacity-50 mb-2" />
        <p className="text-sm font-medium">No chat history yet</p>
        <p className="text-xs text-center mt-1">
          Your AI conversations will appear here
        </p>
      </div>
    );
  }

  return (
    <ScrollArea className="h-full max-h-[60vh]">
      <div className="p-2 space-y-1">
        {groupedLogs.map((group, groupIdx) => (
          <ChatSessionItem
            key={group.sessionId || groupIdx}
            sessionId={group.sessionId}
            date={group.date}
            logs={group.logs}
            onSelect={onSelectSession}
            onSelectLogs={onSelectLogs}
            onDelete={onDeleteSession}
          />
        ))}

        {hasMore && (
          <div className="flex justify-center py-2">
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={onLoadMore}
              disabled={isLoading}
            >
              {isLoading && <Loader2 className="h-3 w-3 animate-spin mr-1.5" />}
              Load more
            </Button>
          </div>
        )}
      </div>
    </ScrollArea>
  );
}

// Chat Session Item - Clickable list item
interface ChatSessionItemProps {
  sessionId: string | null;
  date: string;
  logs: AIInteractionLog[];
  onSelect?: (sessionId: string) => void;
  onSelectLogs?: (logs: AIInteractionLog[]) => void;
  onDelete?: (sessionId: string) => void;
}

function ChatSessionItem({ sessionId, date, logs, onSelect, onSelectLogs, onDelete }: ChatSessionItemProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const firstQuery = logs[0]?.query || 'Chat session';
  const messageCount = logs.length;
  const time = new Date(logs[0].timestamp).toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  });

  const handleClick = () => {
    if (sessionId && onSelect) {
      onSelect(sessionId);
    } else if (!sessionId && onSelectLogs) {
      onSelectLogs(logs);
    }
  };

  return (
    <div className="rounded-lg border bg-card overflow-hidden hover:bg-accent/50 transition-colors">
      <div
        role="button"
        tabIndex={0}
        className="w-full p-3 text-left"
        onClick={handleClick}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            handleClick();
          }
        }}
      >
        <div className="flex items-start gap-2">
          <div
            className="mt-0.5 cursor-pointer"
            onClick={(e) => {
              e.stopPropagation();
              setIsExpanded(!isExpanded);
            }}
          >
            {isExpanded ? (
              <ChevronDown className="h-4 w-4 text-muted-foreground" />
            ) : (
              <ChevronRight className="h-4 w-4 text-muted-foreground" />
            )}
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="humanly-eyebrow text-[10px]">{date}</span>
              <span className="text-[10px] text-muted-foreground">{time}</span>
              <Badge variant="secondary" className="h-4 px-1 text-[10px] font-normal ml-auto">
                {messageCount}
              </Badge>
              {sessionId && onDelete && (
                <span
                  role="button"
                  tabIndex={0}
                  aria-label="Delete conversation"
                  title="Delete conversation"
                  className="inline-flex h-5 w-5 items-center justify-center rounded-sm text-muted-foreground hover:bg-destructive/10 hover:text-destructive focus:outline-none focus:ring-2 focus:ring-ring"
                  onClick={(event) => {
                    event.stopPropagation();
                    onDelete(sessionId);
                  }}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      event.stopPropagation();
                      onDelete(sessionId);
                    }
                  }}
                >
                  <X className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
            <p className="text-sm truncate font-medium">{firstQuery}</p>
          </div>
        </div>
      </div>

      {isExpanded && (
        <div className="border-t bg-muted/20 p-3 space-y-2 max-h-[200px] overflow-y-auto">
          {logs.map((log) => (
            <div key={log.id} className="space-y-1.5">
              {/* User Query */}
              <div className="flex justify-end">
                <div className="max-w-[85%] rounded-xl rounded-br-sm bg-primary text-primary-foreground px-3 py-1.5 text-xs">
                  {log.query}
                </div>
              </div>

              {/* AI Response */}
              {log.response && (
                <div className="flex justify-start">
                  <div className="max-w-[85%] rounded-xl rounded-bl-sm bg-background border px-3 py-1.5 text-xs">
                    <p className="whitespace-pre-wrap line-clamp-3">{log.response}</p>
                    {log.modificationsApplied && (
                      <Badge variant="secondary" className="mt-1.5 h-4 text-[9px]">
                        Changes applied
                      </Badge>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

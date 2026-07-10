'use client';

import { useEffect, useCallback } from 'react';
import { useAIStore } from '@/stores/ai-store';
import { shallow } from 'zustand/shallow';
import { waitForDocumentScopedAccessTokenReady } from '@/lib/api-client';
import { AISuggestion, AIChatRequest } from '@humanly/shared';

function waitForDocumentScopedAuthReady(documentId: string, onReady: () => void): () => void {
  let cancelled = false;
  void waitForDocumentScopedAccessTokenReady(documentId).then(() => {
    if (!cancelled) {
      onReady();
    }
  });

  return () => {
    cancelled = true;
  };
}

/**
 * Hook for AI Assistant functionality
 */
export function useAI(documentId: string) {
  const {
    currentSession,
    messages,
    isStreaming,
    streamingContent,
    streamingMessageId,
    activeSuggestions,
    toolCallTimelines,
    thinkingByMessageId,
    isPanelOpen,
    activeTab,
    isLoading,
    error,
    openPanel,
    closePanel,
    setActiveTab,
    sendMessage,
    sendMessageViaSocket,
    cancelStream,
    clearMessages,
    startNewChat,
    initSession,
    loadSession,
    viewLogsAsMessages,
    closeSession,
    deleteSession,
    applySuggestion,
    dismissSuggestion,
    clearSuggestions,
    setupSocketListeners,
    cleanupSocketListeners,
    clearError,
    reset,
  } = useAIStore(
    (state) => ({
      currentSession: state.currentSession,
      messages: state.messages,
      isStreaming: state.isStreaming,
      streamingContent: state.streamingContent,
      streamingMessageId: state.streamingMessageId,
      activeSuggestions: state.activeSuggestions,
      toolCallTimelines: state.toolCallTimelines,
      thinkingByMessageId: state.thinkingByMessageId,
      isPanelOpen: state.isPanelOpen,
      activeTab: state.activeTab,
      isLoading: state.isLoading,
      error: state.error,
      openPanel: state.openPanel,
      closePanel: state.closePanel,
      setActiveTab: state.setActiveTab,
      sendMessage: state.sendMessage,
      sendMessageViaSocket: state.sendMessageViaSocket,
      cancelStream: state.cancelStream,
      clearMessages: state.clearMessages,
      startNewChat: state.startNewChat,
      initSession: state.initSession,
      loadSession: state.loadSession,
      viewLogsAsMessages: state.viewLogsAsMessages,
      closeSession: state.closeSession,
      deleteSession: state.deleteSession,
      applySuggestion: state.applySuggestion,
      dismissSuggestion: state.dismissSuggestion,
      clearSuggestions: state.clearSuggestions,
      setupSocketListeners: state.setupSocketListeners,
      cleanupSocketListeners: state.cleanupSocketListeners,
      clearError: state.clearError,
      reset: state.reset,
    }),
    shallow
  );

  // Initialize socket listeners on mount
  useEffect(() => {
    setupSocketListeners();
    return () => {
      cleanupSocketListeners();
    };
  }, [setupSocketListeners, cleanupSocketListeners]);

  // Initialize session when panel opens
  useEffect(() => {
    if (!isPanelOpen || !documentId) return undefined;

    return waitForDocumentScopedAuthReady(documentId, () => {
      initSession(documentId);
    });
  }, [isPanelOpen, documentId, initSession]);

  // Send a message (uses WebSocket streaming).
  // Empty `message.trim()` is still allowed when attachments are present
  // — an image-only turn is a legitimate vision query (#93).
  const send = useCallback(
    (
      message: string,
      context?: AIChatRequest['context'],
      attachments?: AIChatRequest['attachments'],
    ) => {
      const hasAttachments = !!attachments && attachments.length > 0;
      if (!message.trim() && !hasAttachments) return;
      sendMessageViaSocket(documentId, message, context, attachments);
    },
    [documentId, sendMessageViaSocket]
  );

  // Send a message via REST (non-streaming)
  const sendSync = useCallback(
    async (
      message: string,
      context?: AIChatRequest['context'],
      attachments?: AIChatRequest['attachments'],
    ) => {
      const hasAttachments = !!attachments && attachments.length > 0;
      if (!message.trim() && !hasAttachments) return;
      await sendMessage(documentId, message, context, attachments);
    },
    [documentId, sendMessage]
  );

  // Apply a suggestion
  const apply = useCallback(
    async (logId: string, suggestion: AISuggestion, before: string, after: string) => {
      await applySuggestion(logId, suggestion, { before, after });
    },
    [applySuggestion]
  );

  // Toggle panel
  const togglePanel = useCallback(() => {
    if (isPanelOpen) {
      closePanel();
    } else {
      openPanel();
    }
  }, [isPanelOpen, openPanel, closePanel]);

  return {
    // State
    session: currentSession,
    messages,
    isStreaming,
    streamingContent,
    streamingMessageId,
    suggestions: activeSuggestions,
    toolCallTimelines,
    thinkingByMessageId,
    isPanelOpen,
    activeTab,
    isLoading,
    error,

    // Actions
    openPanel,
    closePanel,
    togglePanel,
    setActiveTab,
    sendMessage: send,
    sendMessageSync: sendSync,
    cancelStream,
    clearMessages,
    startNewChat,
    loadSession,
    viewLogsAsMessages,
    closeSession,
    deleteSession,
    applySuggestion: apply,
    dismissSuggestion,
    clearSuggestions,
    clearError,
    reset,
  };
}

/**
 * Hook for AI Logs
 */
export function useAILogs(documentId: string) {
  const {
    logs,
    logsTotal,
    isLoading,
    error,
    loadLogs,
    loadMoreLogs,
    clearError,
  } = useAIStore(
    (state) => ({
      logs: state.logs,
      logsTotal: state.logsTotal,
      isLoading: state.isLoading,
      error: state.error,
      loadLogs: state.loadLogs,
      loadMoreLogs: state.loadMoreLogs,
      clearError: state.clearError,
    }),
    shallow
  );

  // Load logs when documentId changes
  useEffect(() => {
    if (!documentId) return undefined;

    return waitForDocumentScopedAuthReady(documentId, () => {
      loadLogs(documentId);
    });
  }, [documentId, loadLogs]);

  const loadMore = useCallback(() => {
    loadMoreLogs(documentId);
  }, [documentId, loadMoreLogs]);

  const refresh = useCallback(() => {
    loadLogs(documentId, 0, 20);
  }, [documentId, loadLogs]);

  const hasMore = logs.length < logsTotal;

  return {
    logs,
    total: logsTotal,
    hasMore,
    isLoading,
    error,
    loadMore,
    refresh,
    clearError,
  };
}

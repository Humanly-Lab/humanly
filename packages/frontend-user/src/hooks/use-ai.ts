'use client';

import { useEffect, useCallback } from 'react';
import { useAIStore } from '@/stores/ai-store';
import { AISuggestion, AIChatRequest } from '@humanly/shared';

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
    applySuggestion,
    dismissSuggestion,
    clearSuggestions,
    setupSocketListeners,
    cleanupSocketListeners,
    clearError,
    reset,
  } = useAIStore();

  // Initialize socket listeners on mount
  useEffect(() => {
    setupSocketListeners();
    return () => {
      cleanupSocketListeners();
    };
  }, [setupSocketListeners, cleanupSocketListeners]);

  // Initialize session when panel opens
  useEffect(() => {
    if (isPanelOpen && documentId) {
      initSession(documentId);
    }
  }, [isPanelOpen, documentId, initSession]);

  // Send a message (uses WebSocket streaming)
  const send = useCallback(
    (message: string, context?: AIChatRequest['context']) => {
      if (!message.trim()) return;
      sendMessageViaSocket(documentId, message, context);
    },
    [documentId, sendMessageViaSocket]
  );

  // Send a message via REST (non-streaming)
  const sendSync = useCallback(
    async (message: string, context?: AIChatRequest['context']) => {
      if (!message.trim()) return;
      await sendMessage(documentId, message, context);
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
  } = useAIStore();

  // Load logs when documentId changes
  useEffect(() => {
    if (documentId) {
      loadLogs(documentId);
    }
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

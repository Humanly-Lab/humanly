'use client';

import React, { useState, useEffect } from 'react';
import type { SelectionReplacementResult } from '@humanly/editor';
import { Sparkles, Check, Wand2, BookOpen, Loader2, MessageSquare, AlertCircle, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import api from '@/lib/api-client';

interface SelectionInfo {
  text: string;
  start: number;
  end: number;
  rect: DOMRect;
}

interface AISelectionMenuProps {
  documentId: string;
  selection: SelectionInfo;
  onClose: () => void;
  replaceSelection: (newText: string, keepOpen?: boolean) => SelectionReplacementResult | undefined;
  cancelAIAction: () => void;
  undoLastAction: () => void;
  onActionApplied?: (
    actionType: ActionType,
    originalText: string,
    newText: string,
    replacementResult?: SelectionReplacementResult
  ) => void;
  onAskAI?: (selectedText: string) => void;
  taskManaged?: boolean;
}

export type ActionType = 'grammar' | 'improve' | 'simplify' | 'formal';

interface SuggestionState {
  actionType: ActionType;
  actionLabel: string;
  originalText: string;
  suggestedText: string;
  logId?: string;
  isStreaming?: boolean;
}

// Define the available AI actions with their prompts and icons
const ACTIONS: { type: ActionType; label: string; icon: React.ReactNode; prompt: string }[] = [
  {
    type: 'grammar',
    label: 'Fix grammar',
    icon: <Check className="h-3.5 w-3.5" />,
    prompt: 'Fix any grammar, spelling, and punctuation errors in the following text. Only return the corrected text without any explanation:',
  },
  {
    type: 'improve',
    label: 'Improve writing',
    icon: <Wand2 className="h-3.5 w-3.5" />,
    prompt: 'Improve the following text to make it clearer and more professional while keeping the same meaning. Only return the improved text without any explanation:',
  },
  {
    type: 'simplify',
    label: 'Simplify',
    icon: <BookOpen className="h-3.5 w-3.5" />,
    prompt: 'Simplify the following text to make it easier to understand while keeping the same meaning. Only return the simplified text without any explanation:',
  },
  {
    type: 'formal',
    label: 'Make formal',
    icon: <Sparkles className="h-3.5 w-3.5" />,
    prompt: 'Rewrite the following text in a more formal and professional tone. Only return the formal text without any explanation:',
  },
];

export function AISelectionMenu({
  documentId,
  selection,
  onClose,
  replaceSelection,
  cancelAIAction,
  onActionApplied,
  onAskAI,
  taskManaged = false,
}: AISelectionMenuProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<ActionType | null>(null);
  const [suggestionState, setSuggestionState] = useState<SuggestionState | null>(null);
  const [hasAISettings, setHasAISettings] = useState<boolean | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Check if user has AI settings configured
  useEffect(() => {
    if (taskManaged) {
      setHasAISettings(true);
      return;
    }

    let cancelled = false;
    api.get('/ai/settings').then((res: any) => {
      if (!cancelled) {
        setHasAISettings(!!res?.data);
      }
    }).catch(() => {
      if (!cancelled) {
        setHasAISettings(false);
      }
    });
    return () => { cancelled = true; };
  }, [taskManaged]);

  const handleAction = async (action: typeof ACTIONS[number]) => {
    if (isLoading) return;

    // Check if AI settings are configured
    if (hasAISettings === false) {
      setShowWarning(true);
      return;
    }

    setIsLoading(true);
    setLoadingAction(action.type);
    setErrorMessage(null);
    setSuggestionState({
      actionType: action.type,
      actionLabel: action.label,
      originalText: selection.text,
      suggestedText: '',
      isStreaming: true,
    });

    try {
      const result = await api.post<{
        success: boolean;
        data: {
          message: { id: string; role: string; content: string };
        };
      }>('/ai/chat', {
        documentId,
        message: `${action.prompt}\n\n"${selection.text}"`,
        silent: true,
        context: {
          selectedText: selection.text,
        },
      }, {
        timeout: 120000,
      });

      const improvedText = (result.data?.message?.content || '').trim();
      if (!improvedText) {
        throw new Error('AI response was empty');
      }

      setSuggestionState({
        actionType: action.type,
        actionLabel: action.label,
        originalText: selection.text,
        suggestedText: improvedText.replace(/^["']|["']$/g, ''),
        logId: undefined,
        isStreaming: false,
      });
      setIsLoading(false);
      setLoadingAction(null);
    } catch (error: any) {
      console.error('AI action failed:', error);
      const msg = error?.response?.data?.error || error?.message || 'AI request failed';
      setErrorMessage(msg);
      setSuggestionState(null);
      cancelAIAction();
      setIsLoading(false);
      setLoadingAction(null);
    }
  };

  const handleKeep = async () => {
    if (!suggestionState) return;

    const improvedText = suggestionState.suggestedText.trim();
    if (!improvedText) {
      setErrorMessage('AI response was empty');
      return;
    }

    const replacementResult = replaceSelection(improvedText, true);

    // Track the action in event history (local tracking)
    if (onActionApplied) {
      onActionApplied(
        suggestionState.actionType,
        suggestionState.originalText,
        suggestionState.suggestedText,
        replacementResult
      );
    }

    // Track acceptance in the backend
    try {
      await api.post('/ai/selection-action', {
        documentId,
        logId: suggestionState.logId,
        actionType: suggestionState.actionType,
        originalText: suggestionState.originalText,
        suggestedText: suggestionState.suggestedText,
        decision: 'accepted',
      });
    } catch (error) {
      // Don't block the user flow if tracking fails
    }

    setSuggestionState(null);
    onClose();
  };

  const handleUndo = async () => {
    if (!suggestionState) return;

    // Track rejection in the backend
    try {
      await api.post('/ai/selection-action', {
        documentId,
        logId: suggestionState.logId,
        actionType: suggestionState.actionType,
        originalText: suggestionState.originalText,
        suggestedText: suggestionState.suggestedText,
        decision: 'rejected',
      });
    } catch (error) {
      // Don't block the user flow if tracking fails
    }

    setSuggestionState(null);
    cancelAIAction();
    onClose();
  };

  // Suggestion mode: show compact Undo / Keep bar
  if (suggestionState) {
    return (
      <div
        className={cn(
          'min-w-[320px] max-w-[480px] rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg p-3',
          'animate-in fade-in-0 zoom-in-95 duration-150'
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-foreground">
            {suggestionState.actionLabel}
          </div>
          {suggestionState.isStreaming ? (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generating...
            </div>
          ) : null}
        </div>
        <div className="max-h-40 overflow-y-auto rounded-md bg-muted/40 p-2 text-xs whitespace-pre-wrap text-foreground">
          {suggestionState.suggestedText || 'Waiting for AI response...'}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs font-medium gap-1.5 hover:bg-muted"
            onClick={handleUndo}
          >
            <Undo2 className="h-3.5 w-3.5" />
            {suggestionState.isStreaming ? 'Cancel' : 'Discard'}
          </Button>
          <Button
            size="sm"
            className="h-8 px-3 text-xs font-medium gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleKeep}
            disabled={suggestionState.isStreaming || !suggestionState.suggestedText.trim()}
          >
            <Check className="h-3.5 w-3.5" />
            Apply
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={cn(
        'relative flex items-center gap-0.5 rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg p-1',
        'animate-in fade-in-0 zoom-in-95 duration-150'
      )}
    >
      {ACTIONS.map((action) => (
        <Button
          key={action.type}
          variant="ghost"
          size="sm"
          className={cn(
            'h-8 px-2.5 text-xs font-medium gap-1.5',
            'hover:bg-violet-50 hover:text-violet-700',
            loadingAction === action.type && 'bg-violet-50 text-violet-700'
          )}
          onClick={() => handleAction(action)}
          disabled={isLoading}
        >
          {loadingAction === action.type ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            action.icon
          )}
          {action.label}
        </Button>
      ))}
      {onAskAI && (
        <>
          <div className="w-px h-5 bg-border mx-0.5" />
          <Button
            variant="ghost"
            size="sm"
            className={cn(
              'h-8 px-2.5 text-xs font-medium gap-1.5',
              'hover:bg-violet-50 hover:text-violet-700'
            )}
            onClick={() => {
              if (hasAISettings === false) {
                setShowWarning(true);
                return;
              }
              onAskAI(selection.text);
            }}
            disabled={isLoading}
          >
            <MessageSquare className="h-3.5 w-3.5" />
            Ask AI
          </Button>
        </>
      )}

      {/* Error: AI call failed */}
      {errorMessage && (
        <div className="absolute top-full left-0 mt-2 w-72 rounded-lg border border-red-200 bg-background shadow-lg p-3 z-50">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-red-500 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-foreground">AI request failed</p>
              <p className="text-muted-foreground mt-0.5">{errorMessage}</p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs mt-1.5"
                onClick={() => setErrorMessage(null)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Warning: AI settings not configured */}
      {showWarning && (
        <div className="absolute top-full left-0 mt-2 w-72 rounded-lg border bg-background shadow-lg p-3 z-50">
          <div className="flex items-start gap-2">
            <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
            <div className="text-xs">
              <p className="font-medium text-foreground">AI not configured</p>
              <p className="text-muted-foreground mt-0.5">
                Please configure your AI settings (API Key, Base URL, Model) in the AI panel first.
              </p>
              <Button
                variant="ghost"
                size="sm"
                className="h-6 px-2 text-xs mt-1.5"
                onClick={() => setShowWarning(false)}
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

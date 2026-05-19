'use client';

import React, { useState, useEffect, useRef } from 'react';
import type { SelectionReplacementResult } from '@humanly/editor';
import { Sparkles, Check, Wand2, BookOpen, Loader2, MessageSquare, AlertCircle, Undo2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import api, { type HumanlyAxiosRequestConfig } from '@/lib/api-client';
import { useAIStore } from '@/stores/ai-store';
import { QuickActionDiff } from './quick-action-diff';

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
  // Lazy accessor for the document's current plain text. Used to compute
  // a ±200 char window around the selection so the backend system prompt
  // can instruct the model to preserve author voice.
  getDocumentPlainText?: () => string;
  documentTitle?: string;
  // Wired by the host so keyboard shortcuts (Cmd+Shift+1/2/3/4) can fire
  // the same action handlers as the dropdown clicks. The menu calls this
  // on mount/unmount with a trigger callback, and the host stores it for
  // its own keydown listener.
  registerActionTrigger?: (trigger: ((type: ActionType) => void) | null) => void;
}

const SURROUNDING_PRE_MAX = 200;
const SURROUNDING_POST_MAX = 200;
const BACKGROUND_REQUEST_CONFIG: HumanlyAxiosRequestConfig = { skipAuthRedirect: true };

/**
 * Slice `before` / `after` windows around the selection offsets, capped at
 * SURROUNDING_PRE_MAX / SURROUNDING_POST_MAX characters. Char-window v1;
 * sentence/paragraph-aware clipping is deliberately out of scope here.
 */
function computeSurrounding(plainText: string, start: number, end: number) {
  return {
    before: plainText.slice(Math.max(0, start - SURROUNDING_PRE_MAX), start),
    after: plainText.slice(end, end + SURROUNDING_POST_MAX),
  };
}

export type ActionType = 'grammar' | 'improve' | 'simplify' | 'formal';

interface ReviewState {
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
  getDocumentPlainText,
  documentTitle,
  registerActionTrigger,
}: AISelectionMenuProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadingAction, setLoadingAction] = useState<ActionType | null>(null);
  const [reviewState, setReviewState] = useState<ReviewState | null>(null);
  const [hasAISettings, setHasAISettings] = useState<boolean | null>(null);
  const [showWarning, setShowWarning] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Latest handleAction is captured via a ref so the trigger we register
  // with the host stays referentially stable across re-renders. Without
  // this the host would have to thread a deps-changing callback through
  // a keydown listener.
  const handleActionRef = useRef<((action: typeof ACTIONS[number]) => Promise<void>) | null>(null);

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
    setReviewState({
      actionType: action.type,
      actionLabel: action.label,
      originalText: selection.text,
      suggestedText: '',
      isStreaming: true,
    });

    // Build the surrounding-context window if the host wired it in. Falls
    // back to no context, in which case the backend prompt builder emits
    // the base instruction without voice-preservation guidance.
    const plainText = getDocumentPlainText?.();
    const surroundingContext = plainText
      ? {
          ...computeSurrounding(plainText, selection.start, selection.end),
          documentTitle: documentTitle ?? '',
        }
      : undefined;

    try {
      const streamSilent = useAIStore.getState().streamSilent;
      let buffer = '';
      const finalText = await streamSilent(
        documentId,
        `${action.prompt}\n\n"${selection.text}"`,
        {
          selectedText: selection.text,
          surroundingContext,
        },
        (chunk) => {
          buffer += chunk;
          setReviewState((prev) =>
            prev
              ? {
                  ...prev,
                  suggestedText: buffer,
                }
              : prev,
          );
        },
      );

      const trimmed = (finalText || '').trim().replace(/^["']|["']$/g, '');
      if (!trimmed) {
        throw new Error('AI response was empty');
      }

      setReviewState({
        actionType: action.type,
        actionLabel: action.label,
        originalText: selection.text,
        suggestedText: trimmed,
        logId: undefined,
        isStreaming: false,
      });
      setIsLoading(false);
      setLoadingAction(null);
    } catch (error: any) {
      console.error('AI action failed:', error);
      const msg = error?.response?.data?.error || error?.message || 'AI request failed';
      setErrorMessage(msg);
      setReviewState(null);
      cancelAIAction();
      setIsLoading(false);
      setLoadingAction(null);
    }
  };

  // Keep the trigger ref pointing at the latest handleAction closure so the
  // host's keyboard handler always invokes the freshest version (state for
  // hasAISettings, isLoading, etc. read from the captured closure).
  handleActionRef.current = handleAction;

  // Register / unregister the keyboard trigger with the host on mount /
  // unmount. The host (document page) calls the trigger when the user
  // presses Cmd/Ctrl+Shift+1..4 while a selection is active.
  useEffect(() => {
    if (!registerActionTrigger) return;
    const trigger = (type: ActionType) => {
      const action = ACTIONS.find((a) => a.type === type);
      if (!action) return;
      handleActionRef.current?.(action);
    };
    registerActionTrigger(trigger);
    return () => registerActionTrigger(null);
  }, [registerActionTrigger]);

  const handleKeep = async () => {
    if (!reviewState) return;

    const improvedText = reviewState.suggestedText.trim();
    if (!improvedText) {
      setErrorMessage('AI response was empty');
      return;
    }

    const replacementResult = replaceSelection(improvedText, true);

    // Track the action in event history (local tracking)
    if (onActionApplied) {
      onActionApplied(
        reviewState.actionType,
        reviewState.originalText,
        reviewState.suggestedText,
        replacementResult
      );
    }

    // Track acceptance in the backend
    try {
      await api.post('/ai/selection-action', {
        documentId,
        logId: reviewState.logId,
        actionType: reviewState.actionType,
        originalText: reviewState.originalText,
        suggestedText: reviewState.suggestedText,
        decision: 'accepted',
      }, BACKGROUND_REQUEST_CONFIG);
    } catch (error) {
      // Don't block the user flow if tracking fails
    }

    setReviewState(null);
    onClose();
  };

  const handleUndo = async () => {
    if (!reviewState) return;

    const wasStreaming = !!reviewState.isStreaming;

    if (wasStreaming) {
      // Stop the in-flight silent stream on the server. cancelSilentStream
      // emits ai:cancel against the SILENT_SESSION_ID sentinel; the backend
      // handler stops generation. We skip the /ai/selection-action POST
      // because no completed suggestion existed to accept or reject.
      useAIStore.getState().cancelSilentStream();
    } else {
      // Track rejection of a completed suggestion in the backend
      try {
        await api.post('/ai/selection-action', {
          documentId,
          logId: reviewState.logId,
          actionType: reviewState.actionType,
          originalText: reviewState.originalText,
          suggestedText: reviewState.suggestedText,
          decision: 'rejected',
        }, BACKGROUND_REQUEST_CONFIG);
      } catch (error) {
        // Don't block the user flow if tracking fails
      }
    }

    setReviewState(null);
    setIsLoading(false);
    setLoadingAction(null);
    cancelAIAction();
    onClose();
  };

  // Review mode: show compact Undo / Keep bar
  if (reviewState) {
    return (
      <div
        className={cn(
          'min-w-[320px] max-w-[480px] rounded-lg border bg-background/95 backdrop-blur-sm shadow-lg p-3',
          'animate-in fade-in-0 zoom-in-95 duration-150'
        )}
      >
        <div className="mb-2 flex items-center justify-between gap-3">
          <div className="text-xs font-medium text-foreground">
            {reviewState.actionLabel}
          </div>
          {reviewState.isStreaming ? (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Generating...
            </div>
          ) : null}
        </div>
        <div className="max-h-40 overflow-y-auto rounded-md bg-muted/40 p-2 text-xs whitespace-pre-wrap text-foreground">
          {reviewState.isStreaming
            ? reviewState.suggestedText || 'Waiting for AI response...'
            : (
              <QuickActionDiff
                before={reviewState.originalText}
                after={reviewState.suggestedText}
              />
            )}
        </div>
        <div className="mt-3 flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 px-3 text-xs font-medium gap-1.5 hover:bg-muted"
            onClick={handleUndo}
          >
            <Undo2 className="h-3.5 w-3.5" />
            {reviewState.isStreaming ? 'Cancel' : 'Discard'}
          </Button>
          <Button
            size="sm"
            className="h-8 px-3 text-xs font-medium gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white"
            onClick={handleKeep}
            disabled={reviewState.isStreaming || !reviewState.suggestedText.trim()}
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
                Please configure your AI settings (API Key, Provider, Model) in the AI panel first.
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

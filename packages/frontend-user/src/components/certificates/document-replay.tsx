'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, RotateCcw, Loader2, Clock, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { DocumentViewer } from './document-viewer';

interface EditEvent {
  timestamp: string;
  editorState: any;
  eventType?: string;
  textBefore?: string;
  textAfter?: string;
  selectionStart?: number;
  selectionEnd?: number;
  metadata?: {
    actionType?: string;
    selectedText?: string;
    originalText?: string;
    newText?: string;
    [key: string]: any;
  };
}

interface DocumentReplayProps {
  token: string;
  accessCode?: string;
  className?: string;
}

const AI_ACTION_FLASH_STYLES: Record<string, { overlay: string; border: string }> = {
  grammar: {
    overlay: 'bg-[#dfe6dc]/55',
    border: 'ring-[#c8d4c8]',
  },
  improve: {
    overlay: 'bg-[#dfe6dc]/55',
    border: 'ring-[#c8d4c8]',
  },
  simplify: {
    overlay: 'bg-amber-200/50',
    border: 'ring-amber-300',
  },
  formal: {
    overlay: 'bg-[#eadfd6]/55',
    border: 'ring-[#d6bba8]',
  },
};

const AI_ACTION_LABELS: Record<string, string> = {
  grammar: 'Fix grammar',
  improve: 'Improve writing',
  simplify: 'Simplify',
  formal: 'Make formal',
};

function getAIActionLabel(actionType?: string) {
  if (!actionType) return 'AI quick action';
  return AI_ACTION_LABELS[actionType] ?? actionType.replace(/_/g, ' ');
}

function getActionResultText(event: EditEvent) {
  if (event.metadata?.newText) return event.metadata.newText;

  if (
    typeof event.selectionStart === 'number'
    && typeof event.selectionEnd === 'number'
    && event.textAfter
  ) {
    const replacement = event.textAfter.slice(event.selectionStart, event.selectionEnd);
    if (replacement) return replacement;
  }

  return event.textAfter || '';
}

export function DocumentReplay({ token, accessCode, className = '' }: DocumentReplayProps) {
  const [editHistory, setEditHistory] = useState<EditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [useRealIntervals, setUseRealIntervals] = useState(false); // Default to uniform timing
  const [uniformSpeed, setUniformSpeed] = useState(2); // Default 2x for uniform timing
  const [flashingActionType, setFlashingActionType] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const scrubActiveRef = useRef(false);
  const playbackSpeed = useRealIntervals ? 1 : uniformSpeed;

  // Fetch edit history
  useEffect(() => {
    async function fetchHistory() {
      try {
        setIsLoading(true);
        setError(null);

        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL ||
          (process.env.NODE_ENV === 'production' ? '/api/v1' : 'http://localhost:3001/api/v1');
        // Protected certificates require the access code so the server can
        // confirm the viewer already unlocked the certificate.
        const response = await fetch(`${apiUrl}/certificates/verify/${token}/history`, {
          headers: accessCode ? { 'X-Access-Code': accessCode } : undefined,
        });

        if (!response.ok) {
          throw new Error('Failed to load edit history');
        }

        const data = await response.json();
        setEditHistory(data.data.editHistory || []);
      } catch (err: any) {
        setError(err.message || 'An error occurred while loading edit history');
        console.error('Error fetching edit history:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchHistory();
  }, [token, accessCode]);

  // Auto-play logic with real intervals
  useEffect(() => {
    if (!isPlaying || editHistory.length === 0 || !useRealIntervals) {
      return;
    }

    // Capture the starting index when effect begins
    const startIdx = currentIndex;
    let localIdx = startIdx;
    let timeoutId: NodeJS.Timeout | null = null;

    const scheduleNext = () => {
      if (localIdx >= editHistory.length - 1) {
        setIsPlaying(false);
        return;
      }

      const nextIdx = localIdx + 1;
      const currentTime = new Date(editHistory[localIdx].timestamp).getTime();
      const nextTime = new Date(editHistory[nextIdx].timestamp).getTime();
      const realDelay = nextTime - currentTime;
      const adjustedDelay = Math.min(Math.max(realDelay, 10), 5000);

      timeoutId = setTimeout(() => {
        localIdx = nextIdx;
        setCurrentIndex(nextIdx);
        scheduleNext();
      }, adjustedDelay);
    };

    scheduleNext();

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, editHistory, useRealIntervals]);

  // Auto-play logic with uniform intervals
  useEffect(() => {
    if (!isPlaying || editHistory.length === 0 || useRealIntervals) {
      return;
    }

    const baseDelay = 100;
    const delay = baseDelay / uniformSpeed;

    const intervalId = setInterval(() => {
      setCurrentIndex((prev) => {
        if (prev >= editHistory.length - 1) {
          setIsPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, delay);

    return () => clearInterval(intervalId);
  }, [isPlaying, uniformSpeed, editHistory.length, useRealIntervals]);

  const handlePlayPause = useCallback(() => {
    if (currentIndex >= editHistory.length - 1) {
      // If at the end, restart from beginning
      setCurrentIndex(0);
      setIsPlaying(true);
    } else {
      setIsPlaying((prev) => !prev);
    }
  }, [currentIndex, editHistory.length]);

  const handleRestart = useCallback(() => {
    setCurrentIndex(0);
    setIsPlaying(false);
  }, []);

  const seekToIndex = useCallback((index: number) => {
    if (editHistory.length === 0) return;
    if (!Number.isFinite(index)) return;

    const maxIndex = editHistory.length - 1;
    const nextIndex = Math.min(Math.max(index, 0), maxIndex);
    setCurrentIndex(nextIndex);
    setIsPlaying(false);
  }, [editHistory.length]);

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const nextIndex = Number.parseInt(e.target.value, 10);
    if (!Number.isFinite(nextIndex)) return;
    seekToIndex(nextIndex);
  }, [seekToIndex]);

  const handleSliderPointerSeek = useCallback((e: React.PointerEvent<HTMLInputElement>) => {
    if (editHistory.length <= 1) {
      seekToIndex(0);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    if (!Number.isFinite(e.clientX)) return;

    const position = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const nextIndex = Math.round((position / rect.width) * (editHistory.length - 1));
    seekToIndex(nextIndex);
  }, [editHistory.length, seekToIndex]);

  const handleSliderMouseSeek = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    if (scrubActiveRef.current) return;
    if (editHistory.length <= 1) {
      seekToIndex(0);
      return;
    }

    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    if (!Number.isFinite(e.clientX)) return;

    const position = Math.min(Math.max(e.clientX - rect.left, 0), rect.width);
    const nextIndex = Math.round((position / rect.width) * (editHistory.length - 1));
    seekToIndex(nextIndex);
  }, [editHistory.length, seekToIndex]);

  const handleSliderClick = useCallback((e: React.MouseEvent<HTMLInputElement>) => {
    handleSliderMouseSeek(e);
  }, [handleSliderMouseSeek]);

  const handleSliderKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (editHistory.length <= 1) return;

    if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
      e.preventDefault();
      seekToIndex(currentIndex + 1);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
      e.preventDefault();
      seekToIndex(currentIndex - 1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      seekToIndex(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      seekToIndex(editHistory.length - 1);
    }
  }, [currentIndex, editHistory.length, seekToIndex]);

  const handleSpeedChange = useCallback(() => {
    if (useRealIntervals) {
      return;
    }

    const speeds = [0.5, 1, 2, 4, 8];
    const currentSpeedIndex = speeds.indexOf(uniformSpeed);
    const nextSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
    setUniformSpeed(speeds[nextSpeedIndex]);
  }, [uniformSpeed, useRealIntervals]);

  useEffect(() => {
    const actionType = editHistory[currentIndex]?.metadata?.actionType;

    if (editHistory[currentIndex]?.eventType !== 'ai_selection_action' || !actionType) {
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setFlashingActionType(actionType);

    const flashDurationMs = 1000 / playbackSpeed;
    timeoutRef.current = setTimeout(() => {
      setFlashingActionType(null);
      timeoutRef.current = null;
    }, flashDurationMs);
  }, [currentIndex, editHistory, playbackSpeed]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <p className="ml-3 text-muted-foreground">Loading edit history...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
        <p className="text-sm text-destructive">{error}</p>
      </div>
    );
  }

  if (editHistory.length === 0) {
    return (
      <div className="p-4 bg-muted/30 border rounded-lg">
        <p className="text-sm text-muted-foreground">No edit history available</p>
      </div>
    );
  }

  const currentState = editHistory[currentIndex];
  const progress = ((currentIndex / (editHistory.length - 1)) * 100).toFixed(0);
  const aiActionLabel = currentState.eventType === 'ai_selection_action'
    ? currentState.metadata?.actionType
      ? `AI: ${getAIActionLabel(currentState.metadata.actionType)}`
      : 'AI action'
    : null;
  const selectedText = currentState.metadata?.selectedText
    || (typeof currentState.selectionStart === 'number'
      && typeof currentState.selectionEnd === 'number'
      && currentState.textAfter
        ? currentState.textAfter.slice(currentState.selectionStart, currentState.selectionEnd)
        : '');
  const showSelectionSnapshot = currentState.eventType === 'select' && !!selectedText;
  const showQuickActionApplication = currentState.eventType === 'ai_selection_action';
  const quickActionLabel = getAIActionLabel(currentState.metadata?.actionType);
  const quickActionOriginalText = currentState.metadata?.originalText || selectedText || '';
  const quickActionResultText = getActionResultText(currentState);
  const flashStyle = flashingActionType
    ? AI_ACTION_FLASH_STYLES[flashingActionType]
    : undefined;

  // Helper to extract text from editor state
  const extractText = (editorState: any): string => {
    try {
      if (editorState?.root?.children) {
        return editorState.root.children
          .map((child: any) => {
            if (child.children) {
              return child.children
                .map((textNode: any) => textNode.text || '')
                .join('');
            }
            return '';
          })
          .join('\n');
      }
      return '';
    } catch {
      return '';
    }
  };

  const currentText = extractText(currentState.editorState);

  return (
    <div className={`space-y-3 sm:space-y-4 ${className}`}>
      <div
        className={`border rounded-lg overflow-hidden min-h-[200px] sm:min-h-[250px] relative bg-white dark:bg-gray-950 transition-shadow duration-200 ${
          flashStyle ? `ring-4 ${flashStyle.border}` : ''
        }`}
      >
        {/* Lexical viewer */}
        <div className="h-full">
          <DocumentViewer content={currentState.editorState} />
        </div>

        <div
          className={`pointer-events-none absolute inset-0 z-10 transition-opacity duration-300 ${
            flashStyle ? `${flashStyle.overlay} opacity-100` : 'opacity-0'
          }`}
        />

        {showSelectionSnapshot && (
          <div className="absolute left-1/2 top-4 z-20 w-[320px] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
            <p className="mb-2 humanly-eyebrow text-[10px]">
              Selection recorded
            </p>
            <p className="line-clamp-3 text-xs text-foreground/80">
              {selectedText}
            </p>
          </div>
        )}

        {showQuickActionApplication && (
          <div className="absolute left-1/2 top-4 z-20 w-[420px] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
            <div className="mb-3 flex items-start gap-2">
              <div className="mt-0.5 rounded-full bg-[#f1e8df] p-1.5 text-[#8a5f43]">
                <Sparkles className="h-3.5 w-3.5" />
              </div>
              <div>
                <p className="humanly-eyebrow text-[10px]">Replay evidence</p>
                <p className="text-sm font-semibold text-foreground">
                  AI quick action recorded: {quickActionLabel}
                </p>
                <p className="text-[11px] text-muted-foreground">
                  This is a historical event from the certificate replay, not a live editor control.
                </p>
              </div>
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <p className="mb-1 humanly-eyebrow text-[10px]">
                  Selected text
                </p>
                <div className="rounded-md border bg-background px-3 py-2 text-xs text-foreground/80">
                  {quickActionOriginalText || 'No selected text recorded'}
                </div>
              </div>
              <div>
                <p className="mb-1 humanly-eyebrow text-[10px]">
                  Result
                </p>
                <div className="rounded-md border bg-background px-3 py-2 text-xs text-foreground/80">
                  {quickActionResultText || 'No result text recorded'}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Fallback plain text overlay for debugging */}
        {currentText && (
          <div className="absolute inset-0 pointer-events-none p-3 sm:p-4 text-xs sm:text-sm whitespace-pre-wrap opacity-0 hover:opacity-100 transition-opacity bg-white/95 dark:bg-gray-950/95 overflow-auto">
            {currentText}
          </div>
        )}

        {!currentText && (
          <div className="absolute inset-0 flex items-center justify-center text-xs sm:text-sm text-muted-foreground">
            <div className="text-center px-4">
              <p className="font-medium">Press the ▶ button below</p>
              <p className="text-[10px] sm:text-xs opacity-70 mt-1">to watch document creation</p>
            </div>
          </div>
        )}
        {currentIndex === 0 && (
          <div className="absolute top-1.5 left-1.5 sm:top-2 sm:left-2 text-[10px] sm:text-xs text-muted-foreground bg-muted/80 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded z-10">
            Frame 1 - Start
          </div>
        )}
        {aiActionLabel && (
          <div className="absolute top-1.5 right-1.5 z-10 rounded bg-[#f1e8df] px-1.5 py-0.5 text-[10px] font-medium capitalize text-[#8a5f43] sm:top-2 sm:right-2 sm:px-2 sm:py-1 sm:text-xs">
            {aiActionLabel}
          </div>
        )}
        {currentText && (
          <div className="absolute bottom-1.5 right-1.5 sm:bottom-2 sm:right-2 text-[10px] sm:text-xs text-muted-foreground bg-muted/80 px-1.5 py-0.5 sm:px-2 sm:py-1 rounded z-10">
            {currentText.length} chars
          </div>
        )}
      </div>

      <div className="space-y-2 sm:space-y-3 p-3 sm:p-4 bg-muted/30 border rounded-lg">
        <div className="flex items-center gap-2 sm:gap-3">
          <Button
            variant="outline"
            size="icon"
            onClick={handlePlayPause}
            onTouchEnd={(e) => {
              e.preventDefault();
              handlePlayPause();
            }}
            aria-label={isPlaying ? 'Pause replay' : currentIndex >= editHistory.length - 1 ? 'Replay from start' : 'Play replay'}
            title={isPlaying ? 'Pause replay' : currentIndex >= editHistory.length - 1 ? 'Replay from start' : 'Play replay'}
            className="h-10 w-10 flex-shrink-0"
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          >
            {isPlaying ? (
              <Pause className="h-4 w-4" />
            ) : (
              <Play className="h-4 w-4" />
            )}
          </Button>

          <Button
            variant="outline"
            size="icon"
            onClick={handleRestart}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleRestart();
            }}
            aria-label="Restart replay"
            title="Restart replay"
            className="h-10 w-10 flex-shrink-0"
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          >
            <RotateCcw className="h-4 w-4" />
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={handleSpeedChange}
            onTouchEnd={(e) => {
              e.preventDefault();
              handleSpeedChange();
            }}
            disabled={useRealIntervals}
            aria-label={useRealIntervals ? 'Real timing playback speed 1x' : `Uniform timing playback speed ${uniformSpeed}x`}
            title={useRealIntervals ? 'Real timing uses recorded intervals at 1x' : 'Change uniform playback speed'}
            className="h-10 px-3 text-sm flex-shrink-0"
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          >
            {useRealIntervals ? '1x' : `${uniformSpeed}x`}
          </Button>

          <div className="flex-1 flex items-center gap-2 sm:gap-3 min-w-0">
            <input
              type="range"
              value={currentIndex}
              onChange={handleSliderChange}
              max={editHistory.length - 1}
              min={0}
              step={1}
              aria-label="Replay frame"
              aria-valuetext={`Frame ${currentIndex + 1} of ${editHistory.length}`}
              onInput={handleSliderChange}
              onPointerDown={(e) => {
                scrubActiveRef.current = true;
                e.currentTarget.setPointerCapture?.(e.pointerId);
                handleSliderPointerSeek(e);
              }}
              onPointerMove={(e) => {
                if (scrubActiveRef.current) {
                  handleSliderPointerSeek(e);
                }
              }}
              onPointerUp={(e) => {
                scrubActiveRef.current = false;
                handleSliderPointerSeek(e);
              }}
              onPointerCancel={() => {
                scrubActiveRef.current = false;
              }}
              onMouseDown={handleSliderMouseSeek}
              onClick={handleSliderClick}
              onKeyDown={handleSliderKeyDown}
              className="flex-1 h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary min-w-0"
              style={{ touchAction: 'none' }}
            />
            <span className="text-xs sm:text-sm text-muted-foreground whitespace-nowrap">
              {currentIndex + 1} / {editHistory.length}
            </span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <div className="text-[10px] sm:text-xs text-muted-foreground">
              {progress}% complete • {new Date(currentState.timestamp).toLocaleString(undefined, {
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </div>
            <div className="flex items-center gap-2">
              <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
              <Label htmlFor="real-intervals" className="text-[10px] sm:text-xs text-muted-foreground cursor-pointer whitespace-nowrap">
                Real timing
              </Label>
              <Switch
                id="real-intervals"
                checked={useRealIntervals}
                onCheckedChange={(checked) => {
                  setUseRealIntervals(checked);
                  setIsPlaying(false);
                }}
                className="scale-75 sm:scale-100"
              />
            </div>
          </div>
          <div className="text-[9px] sm:text-[10px] text-muted-foreground/80 leading-tight">
            {useRealIntervals ? (
              <span>
                ⏱️ Real timing: Replays with authentic typing speed and pauses from original creation
              </span>
            ) : (
              <span>
                ⚡ Uniform timing: Shows each keystroke at consistent intervals for faster viewing
              </span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

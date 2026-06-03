'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Play, Pause, RotateCcw, Loader2, Clock } from 'lucide-react';
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

export function DocumentReplay({ token, className = '' }: DocumentReplayProps) {
  const [editHistory, setEditHistory] = useState<EditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [useRealIntervals, setUseRealIntervals] = useState(false); // Default to uniform timing
  const [speed, setSpeed] = useState(2); // Default 2x for uniform timing
  const [flashingActionType, setFlashingActionType] = useState<string | null>(null);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Fetch edit history
  useEffect(() => {
    async function fetchHistory() {
      try {
        setIsLoading(true);
        setError(null);

        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL ||
          (process.env.NODE_ENV === 'production' ? '/api/v1' : 'http://localhost:3001/api/v1');
        const response = await fetch(`${apiUrl}/certificates/verify/${token}/history`);

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
  }, [token]);

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
      const adjustedDelay = Math.min(Math.max(realDelay / speed, 10), 5000);

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
  }, [isPlaying, speed, editHistory, useRealIntervals]);

  // Auto-play logic with uniform intervals
  useEffect(() => {
    if (!isPlaying || editHistory.length === 0 || useRealIntervals) {
      return;
    }

    const baseDelay = 100;
    const delay = baseDelay / speed;

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
  }, [isPlaying, speed, editHistory.length, useRealIntervals]);

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

  const handleSliderChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    setCurrentIndex(parseInt(e.target.value));
    setIsPlaying(false);
  }, []);

  const handleSpeedChange = useCallback(() => {
    const speeds = [0.5, 1, 2, 4, 8];
    const currentSpeedIndex = speeds.indexOf(speed);
    const nextSpeedIndex = (currentSpeedIndex + 1) % speeds.length;
    setSpeed(speeds[nextSpeedIndex]);
  }, [speed]);

  useEffect(() => {
    const actionType = editHistory[currentIndex]?.metadata?.actionType;

    if (editHistory[currentIndex]?.eventType !== 'ai_selection_action' || !actionType) {
      return;
    }

    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    setFlashingActionType(actionType);

    const flashDurationMs = 1000 / speed;
    timeoutRef.current = setTimeout(() => {
      setFlashingActionType(null);
      timeoutRef.current = null;
    }, flashDurationMs);
  }, [currentIndex, editHistory, speed]);

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
      ? `AI: ${currentState.metadata.actionType}`
      : 'AI action'
    : null;
  const selectedText = currentState.metadata?.selectedText
    || (typeof currentState.selectionStart === 'number'
      && typeof currentState.selectionEnd === 'number'
      && currentState.textAfter
        ? currentState.textAfter.slice(currentState.selectionStart, currentState.selectionEnd)
        : '');
  const showQuickActions = currentState.eventType === 'select' && !!selectedText;
  const showQuickActionApplication = currentState.eventType === 'ai_selection_action';
  const quickActionLabel = currentState.metadata?.actionType
    ? currentState.metadata.actionType.charAt(0).toUpperCase() + currentState.metadata.actionType.slice(1)
    : null;
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

        {showQuickActions && (
          <div className="absolute left-1/2 top-4 z-20 w-[320px] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
            <p className="mb-2 humanly-eyebrow text-[10px]">
              Selected Text
            </p>
            <p className="mb-3 line-clamp-2 text-xs text-foreground/80">
              {selectedText}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {['Fix grammar', 'Improve writing', 'Simplify', 'Make formal'].map((label) => (
                <div
                  key={label}
                  className="rounded-md border bg-muted/40 px-2 py-1.5 text-center text-[11px] font-medium text-muted-foreground"
                >
                  {label}
                </div>
              ))}
            </div>
          </div>
        )}

        {showQuickActionApplication && (
          <div className="absolute left-1/2 top-4 z-20 w-[360px] max-w-[calc(100%-2rem)] -translate-x-1/2 rounded-xl border bg-background/95 p-3 shadow-lg backdrop-blur-sm">
            <div className="mb-3 flex flex-wrap gap-2">
              {[
                { key: 'grammar', label: 'Fix grammar' },
                { key: 'improve', label: 'Improve writing' },
                { key: 'simplify', label: 'Simplify' },
                { key: 'formal', label: 'Make formal' },
              ].map((action) => {
                const isActive = currentState.metadata?.actionType === action.key;
                return (
                  <div
                    key={action.key}
                    className={`rounded-md border px-2 py-1.5 text-[11px] font-medium ${
                      isActive
                        ? 'border-[#d6bba8] bg-[#f1e8df] text-[#8a5f43]'
                        : 'bg-muted/40 text-muted-foreground'
                    }`}
                  >
                    {action.label}
                  </div>
                );
              })}
            </div>
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <p className="mb-1 humanly-eyebrow text-[10px]">
                  Before
                </p>
                <div className="rounded-md border bg-background px-3 py-2 text-xs text-foreground/80">
                  {currentState.metadata?.originalText || currentState.textBefore || '—'}
                </div>
              </div>
              <div>
                <p className="mb-1 humanly-eyebrow text-[10px]">
                  After
                </p>
                <div className="rounded-md border bg-background px-3 py-2 text-xs text-foreground/80">
                  {currentState.metadata?.newText || currentState.textAfter || '—'}
                </div>
              </div>
            </div>
            {quickActionLabel && (
              <p className="mt-2 text-[11px] font-medium text-[#8a5f43]">
                {quickActionLabel} applied
              </p>
            )}
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
            className="h-10 px-3 text-sm flex-shrink-0"
            style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
          >
            {speed}x
          </Button>

          <div className="flex-1 flex items-center gap-2 sm:gap-3 min-w-0">
            <input
              type="range"
              value={currentIndex}
              onChange={handleSliderChange}
              max={editHistory.length - 1}
              min={0}
              step={1}
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
                  // Adjust speed when switching modes
                  setSpeed(checked ? 8 : 2);
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

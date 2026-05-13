'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Activity,
  Trash2,
  Wifi,
  WifiOff,
  Code,
  ArrowLeft,
  Play,
  Pause,
  Copy,
  Check,
  Info,
} from 'lucide-react';
import { EventType } from '@humanly/shared';
import { initializeSocket, disconnectSocket, getSocket } from '@/lib/socket-client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import Link from 'next/link';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import api from '@/lib/api-client';
import { TypingAnalyticsPanel } from '@/components/live-preview/TypingAnalyticsPanel';

// Connection status types
type ConnectionStatus = 'disconnected' | 'connecting' | 'connected' | 'error';

// Real-time event interface
interface RealtimeEvent {
  id: string;
  eventType: EventType;
  sessionId: string;
  userId: string;
  timestamp: string;
  fieldName?: string;
  keyCode?: string;
  keyChar?: string;
  textBefore?: string;
  textAfter?: string;
  cursorPosition?: number;
  metadata?: Record<string, any>;
}

// Event type colors
const EVENT_TYPE_COLORS: Partial<Record<EventType, string>> = {
  keydown: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  keyup: 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300',
  paste: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
  copy: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200',
  cut: 'bg-orange-100 text-orange-800 dark:bg-orange-900 dark:text-orange-200',
  focus: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200',
  blur: 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-200',
  input: 'bg-cyan-100 text-cyan-800 dark:bg-cyan-900 dark:text-cyan-200',
  delete: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200',
  select: 'bg-indigo-100 text-indigo-800 dark:bg-indigo-900 dark:text-indigo-200',
};

const MAX_EVENTS = 100;

export default function LivePreviewPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;

  // Connection state
  const [connectionStatus, setConnectionStatus] = useState<ConnectionStatus>('disconnected');
  const [connectionError, setConnectionError] = useState<string | null>(null);

  // Events state
  const [events, setEvents] = useState<RealtimeEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [totalEvents, setTotalEvents] = useState(0);

  // Analytics state
  const [analyticsResetKey, setAnalyticsResetKey] = useState(0);

  // Task token for WebSocket authentication
  const [taskToken, setTaskToken] = useState<string>('');

  // Demo input state
  const [demoText, setDemoText] = useState('');
  const [copiedEvent, setCopiedEvent] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout>();

  // Fetch task token for WebSocket authentication
  useEffect(() => {
    const fetchTaskToken = async () => {
      try {
        const response = await api.get<{
          success: boolean;
          data: { taskToken: string };
        }>(`/api/v1/tasks/${taskId}`);

        setTaskToken(response.data.taskToken);
      } catch (error) {
        console.error('Failed to fetch task token:', error);
      }
    };

    if (taskId) {
      fetchTaskToken();
    }
  }, [taskId]);

  // Connect to WebSocket
  useEffect(() => {
    if (!taskId || !taskToken) return;

    const connectToWebSocket = () => {
      try {
        setConnectionStatus('connecting');
        setConnectionError(null);

        initializeSocket();
        const socket = getSocket();

        if (!socket) {
          throw new Error('Failed to initialize socket');
        }

        // Listen for events
        socket.on('event-received', (data: any) => {
          console.log('Received event from WebSocket:', data);
          if (!isPaused && data.event) {
            const event: RealtimeEvent = {
              id: `${data.sessionId}-${Date.now()}`,
              eventType: data.event.eventType,
              sessionId: data.sessionId,
              userId: data.externalUserId || 'unknown',
              timestamp: data.event.timestamp,
              fieldName: data.event.targetElement,
              keyCode: data.event.keyCode,
              keyChar: data.event.keyChar,
              textBefore: data.event.textBefore,
              textAfter: data.event.textAfter,
              cursorPosition: data.event.cursorPosition,
              metadata: data.event.metadata,
            };

            setEvents(prev => {
              const newEvents = [event, ...prev].slice(0, MAX_EVENTS);
              return newEvents;
            });
            setTotalEvents(prev => prev + 1);
          }
        });

        socket.on('connect', () => {
          console.log('WebSocket connected, joining task:', taskId);
          setConnectionStatus('connected');
          setConnectionError(null);
          // Join task room after connection is established
          if (taskId && taskToken) {
            socket.emit('join-task', { taskId, token: taskToken });
          } else {
            console.error('Cannot join task: taskId or token is undefined', { taskId, taskToken });
          }
        });

        socket.on('disconnect', () => {
          setConnectionStatus('disconnected');
          // Attempt to reconnect after 3 seconds
          reconnectTimeoutRef.current = setTimeout(() => {
            connectToWebSocket();
          }, 3000);
        });

        socket.on('connect_error', (error) => {
          setConnectionStatus('error');
          setConnectionError(error.message || 'Connection failed');
        });

        // If already connected, join the room immediately
        if (socket.connected) {
          console.log('Socket already connected, joining task:', taskId);
          setConnectionStatus('connected');
          if (taskId && taskToken) {
            socket.emit('join-task', { taskId, token: taskToken });
          } else {
            console.error('Cannot join task: taskId or token is undefined', { taskId, taskToken });
          }
        }

      } catch (error) {
        setConnectionStatus('error');
        setConnectionError(error instanceof Error ? error.message : 'Connection failed');
      }
    };

    connectToWebSocket();

    return () => {
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      const socket = getSocket();
      if (socket && taskId) {
        socket.emit('leave-task', { taskId });
        disconnectSocket();
      }
    };
  }, [taskId, taskToken, isPaused]);

  // Track events from demo textarea (local only - not saved to database)
  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;

    const addLocalEvent = (eventType: EventType, additionalData: any = {}) => {
      // Generate event locally without sending to backend
      const event: RealtimeEvent = {
        id: `demo-${Date.now()}-${Math.random()}`,
        eventType,
        sessionId: 'demo-session',
        userId: 'demo-user',
        timestamp: new Date().toISOString(),
        fieldName: 'demo-input',
        keyCode: additionalData.keyCode,
        keyChar: additionalData.keyChar,
        textBefore: additionalData.textBefore,
        textAfter: additionalData.textAfter || textarea.value,
        cursorPosition: textarea.selectionStart,
        metadata: additionalData.metadata,
      };

      // Add to local state only
      if (!isPaused) {
        setEvents(prev => {
          const newEvents = [event, ...prev].slice(0, MAX_EVENTS);
          return newEvents;
        });
        setTotalEvents(prev => prev + 1);
      }
    };

    // Keydown handler
    const handleKeyDown = (e: KeyboardEvent) => {
      // Check if this is a delete action (Backspace or Delete key)
      if (e.key === 'Backspace' || e.key === 'Delete') {
        const textBefore = textarea.value;
        const cursorPos = textarea.selectionStart;
        const selectionEnd = textarea.selectionEnd;

        let deletedText = '';
        let textAfter = textBefore;

        if (cursorPos !== selectionEnd) {
          // Text is selected - will delete selection
          deletedText = textBefore.substring(cursorPos, selectionEnd);
          textAfter = textBefore.slice(0, cursorPos) + textBefore.slice(selectionEnd);
        } else if (e.key === 'Backspace' && cursorPos > 0) {
          // Backspace - delete character before cursor
          deletedText = textBefore.charAt(cursorPos - 1);
          textAfter = textBefore.slice(0, cursorPos - 1) + textBefore.slice(cursorPos);
        } else if (e.key === 'Delete' && cursorPos < textBefore.length) {
          // Delete - delete character after cursor
          deletedText = textBefore.charAt(cursorPos);
          textAfter = textBefore.slice(0, cursorPos) + textBefore.slice(cursorPos + 1);
        }

        addLocalEvent('delete', {
          keyCode: e.code,
          textBefore,
          textAfter,
          metadata: { deletedText },
        });
      } else {
        addLocalEvent('keydown', {
          keyCode: e.code,
          keyChar: e.key.length === 1 ? e.key : undefined,
        });
      }
    };

    // Keyup handler
    const handleKeyUp = (e: KeyboardEvent) => {
      addLocalEvent('keyup', {
        keyCode: e.code,
        keyChar: e.key.length === 1 ? e.key : undefined,
      });
    };

    // Input handler
    const handleInput = (e: Event) => {
      const target = e.target as HTMLTextAreaElement;
      setDemoText(target.value); // Sync React state with DOM input
      addLocalEvent('input', {
        textAfter: target.value,
      });
    };

    // Paste handler
    const handlePaste = (e: ClipboardEvent) => {
      const pastedText = e.clipboardData?.getData('text') || '';
      const textBefore = textarea.value;
      const cursorPos = textarea.selectionStart;
      const textAfter = textBefore.slice(0, cursorPos) + pastedText + textBefore.slice(textarea.selectionEnd);

      addLocalEvent('paste', {
        textBefore,
        textAfter,
        metadata: { pastedText },
      });
    };

    // Copy handler
    const handleCopy = (_e: ClipboardEvent) => {
      const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
      addLocalEvent('copy', {
        metadata: { copiedText: selectedText },
      });
    };

    // Cut handler
    const handleCut = (_e: ClipboardEvent) => {
      const selectedText = textarea.value.substring(textarea.selectionStart, textarea.selectionEnd);
      const textBefore = textarea.value;
      const textAfter = textBefore.slice(0, textarea.selectionStart) + textBefore.slice(textarea.selectionEnd);

      addLocalEvent('cut', {
        textBefore,
        textAfter,
        metadata: { cutText: selectedText },
      });
    };

    // Focus handler
    const handleFocus = () => {
      addLocalEvent('focus');
    };

    // Blur handler
    const handleBlur = () => {
      addLocalEvent('blur');
    };

    // Select handler
    const handleSelect = () => {
      const selectionStart = textarea.selectionStart;
      const selectionEnd = textarea.selectionEnd;

      // Only track if there's an actual selection (not just cursor position)
      if (selectionStart !== selectionEnd) {
        const selectedText = textarea.value.substring(selectionStart, selectionEnd);
        addLocalEvent('select', {
          metadata: {
            selectedText,
            selectionStart,
            selectionEnd,
            selectionLength: selectedText.length,
          },
        });
      }
    };

    // Attach event listeners
    textarea.addEventListener('keydown', handleKeyDown);
    textarea.addEventListener('keyup', handleKeyUp);
    textarea.addEventListener('input', handleInput);
    textarea.addEventListener('paste', handlePaste);
    textarea.addEventListener('copy', handleCopy);
    textarea.addEventListener('cut', handleCut);
    textarea.addEventListener('focus', handleFocus);
    textarea.addEventListener('blur', handleBlur);
    textarea.addEventListener('select', handleSelect);

    // Cleanup
    return () => {
      textarea.removeEventListener('keydown', handleKeyDown);
      textarea.removeEventListener('keyup', handleKeyUp);
      textarea.removeEventListener('input', handleInput);
      textarea.removeEventListener('paste', handlePaste);
      textarea.removeEventListener('copy', handleCopy);
      textarea.removeEventListener('cut', handleCut);
      textarea.removeEventListener('focus', handleFocus);
      textarea.removeEventListener('blur', handleBlur);
      textarea.removeEventListener('select', handleSelect);
    };
  }, [isPaused]);

  const handleClearEvents = () => {
    setEvents([]);
    setTotalEvents(0);
    setAnalyticsResetKey(prev => prev + 1); // Reset analytics
  };

  const handleResetAnalytics = () => {
    setAnalyticsResetKey(prev => prev + 1);
  };

  const togglePause = () => {
    setIsPaused(!isPaused);
  };

  const formatTimestamp = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleTimeString('en-US', {
      hour12: false,
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  const copyEventToClipboard = (event: RealtimeEvent) => {
    const eventData = JSON.stringify(event, null, 2);
    navigator.clipboard.writeText(eventData);
    setCopiedEvent(event.id);
    setTimeout(() => setCopiedEvent(null), 2000);
  };

  const getConnectionStatusColor = () => {
    switch (connectionStatus) {
      case 'connected':
        return 'text-green-600';
      case 'connecting':
        return 'text-yellow-600';
      case 'disconnected':
        return 'text-gray-400';
      case 'error':
        return 'text-red-600';
    }
  };

  const getConnectionStatusIcon = () => {
    return connectionStatus === 'connected' ? <Wifi className="h-4 w-4" /> : <WifiOff className="h-4 w-4" />;
  };

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Live Preview</h1>
          <p className="text-muted-foreground mt-2">
            Test and see events being captured in real-time
          </p>
        </div>
        <div className="flex gap-2">
          <Link href={`/tasks/${taskId}/snippets`}>
            <Button variant="outline">
              <Code className="h-4 w-4 mr-2" />
              Tracking Code
            </Button>
          </Link>
          <Button variant="outline" onClick={() => router.push(`/tasks/${taskId}`)}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            Back to Task
          </Button>
        </div>
      </div>

      {/* Connection Status */}
      <Alert variant={connectionStatus === 'connected' ? 'default' : 'destructive'}>
        <div className="flex items-center gap-2">
          <span className={getConnectionStatusColor()}>
            {getConnectionStatusIcon()}
          </span>
          <AlertTitle className="mb-0">
            {connectionStatus === 'connected' && 'Connected - Listening for events'}
            {connectionStatus === 'connecting' && 'Connecting to real-time stream...'}
            {connectionStatus === 'disconnected' && 'Disconnected - Attempting to reconnect...'}
            {connectionStatus === 'error' && `Connection Error: ${connectionError}`}
          </AlertTitle>
        </div>
      </Alert>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr,1fr,420px] gap-4 h-[calc(100vh-300px)] min-h-[600px]">
        {/* Left Side - Interactive Demo */}
        <Card className="flex flex-col h-full overflow-hidden">
          <CardHeader className="flex-shrink-0">
            <CardTitle>Interactive Demo</CardTitle>
            <CardDescription>
              Type in this field to see events captured in the middle →
            </CardDescription>
          </CardHeader>
          <CardContent className="flex-1 flex flex-col space-y-4 overflow-hidden">
            <Textarea
              ref={textareaRef}
              placeholder="Start typing here to see events and analytics in real-time...

Try:
• Typing normally
• Copy and paste (Ctrl/Cmd + C/V)
• Cut text (Ctrl/Cmd + X)
• Select text and use right-click menu
• Click in and out of this field (focus/blur)

All interactions are tracked and displayed with real-time analytics!"
              value={demoText}
              onChange={(e) => setDemoText(e.target.value)}
              className="flex-1 min-h-[400px] font-mono text-sm resize-none"
            />

            <Alert>
              <Info className="h-4 w-4" />
              <AlertTitle>Demo Mode - Data Not Saved</AlertTitle>
              <AlertDescription className="text-xs">
                This is a demonstration of event tracking. Events are generated locally for preview only
                and are NOT saved to the database. Use the tracking snippets to capture real data.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>

        {/* Right Side - Event Log */}
        <Card className="flex flex-col h-full overflow-hidden">
          <CardHeader className="flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <CardTitle>Event Log</CardTitle>
                <CardDescription>
                  {totalEvents} events captured {isPaused && '(Paused)'}
                </CardDescription>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={togglePause}
                >
                  {isPaused ? (
                    <>
                      <Play className="h-4 w-4 mr-2" />
                      Resume
                    </>
                  ) : (
                    <>
                      <Pause className="h-4 w-4 mr-2" />
                      Pause
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearEvents}
                  disabled={events.length === 0}
                >
                  <Trash2 className="h-4 w-4 mr-2" />
                  Clear
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="flex-1 p-0 overflow-hidden min-h-0">
            {events.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full p-8 text-center">
                <Activity className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="font-semibold mb-2">No Events Yet</h3>
                <p className="text-sm text-muted-foreground max-w-sm">
                  Start typing in the demo field on the left to see events appear here in real-time
                </p>
              </div>
            ) : (
              <ScrollArea className="h-full w-full" ref={scrollAreaRef}>
                <div className="space-y-2 p-4">
                  {events.map((event) => (
                    <div
                      key={event.id}
                      className="border rounded-lg p-3 hover:bg-accent/50 transition-colors"
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="flex items-center gap-2 flex-1">
                          <Badge
                            variant="secondary"
                            className={EVENT_TYPE_COLORS[event.eventType]}
                          >
                            {event.eventType}
                          </Badge>
                          <span className="text-xs text-muted-foreground font-mono">
                            {formatTimestamp(event.timestamp)}
                          </span>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => copyEventToClipboard(event)}
                          className="h-6 w-6 p-0"
                        >
                          {copiedEvent === event.id ? (
                            <Check className="h-3 w-3 text-green-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                        </Button>
                      </div>

                      <div className="space-y-1 text-xs">
                        {event.fieldName && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground font-medium">Field:</span>
                            <span className="font-mono">{event.fieldName}</span>
                          </div>
                        )}

                        {event.keyChar && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground font-medium">Key:</span>
                            <span className="font-mono bg-muted px-1 rounded">
                              {event.keyChar}
                            </span>
                          </div>
                        )}

                        {event.textAfter !== undefined && event.textAfter !== '' && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground font-medium">Text:</span>
                            <span className="font-mono text-xs break-all">
                              {event.textAfter.substring(0, 50)}
                              {event.textAfter.length > 50 && '...'}
                            </span>
                          </div>
                        )}

                        {event.cursorPosition !== undefined && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground font-medium">Cursor:</span>
                            <span className="font-mono">{event.cursorPosition}</span>
                          </div>
                        )}

                        {event.metadata && Object.keys(event.metadata).length > 0 && (
                          <div className="flex gap-2">
                            <span className="text-muted-foreground font-medium">Metadata:</span>
                            <span className="font-mono text-xs">
                              {JSON.stringify(event.metadata).substring(0, 50)}...
                            </span>
                          </div>
                        )}

                        <div className="flex gap-2">
                          <span className="text-muted-foreground font-medium">Session:</span>
                          <span className="font-mono text-xs">
                            {event.sessionId.substring(0, 8)}...
                          </span>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            )}
          </CardContent>
        </Card>

        {/* Right Side - Real-Time Analytics */}
        <TypingAnalyticsPanel
          events={events}
          taskId={taskId}
          resetKey={analyticsResetKey}
          onReset={handleResetAnalytics}
        />
      </div>

      {/* Info Section */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">How Event Tracking Works</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div>
              <h4 className="font-semibold mb-2">1. Capture Interactions</h4>
              <p className="text-muted-foreground">
                The tracking code captures every keystroke, paste, copy, cut, focus, and blur event as users interact with your forms.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">2. Send to Backend</h4>
              <p className="text-muted-foreground">
                Events are batched and sent to your backend API where they're stored in the database with session information.
              </p>
            </div>
            <div>
              <h4 className="font-semibold mb-2">3. Analyze & Export</h4>
              <p className="text-muted-foreground">
                View real-time sessions, analyze user behavior patterns, and export data in JSON/CSV formats for research.
              </p>
            </div>
          </div>
          <Alert className="mt-4">
            <Info className="h-4 w-4" />
            <AlertDescription className="text-xs">
              <strong>Note:</strong> This demo generates events locally for preview purposes only.
              To track real user data, add the tracking snippets to your surveys/forms using the "Tracking Code" button above.
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    </div>
  );
}

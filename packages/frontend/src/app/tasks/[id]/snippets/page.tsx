'use client';

import { useEffect, useState, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api-client';
import { TaskSnippetsResponse, getBrandText } from '@humanly/shared';
import { initializeSocket, disconnectSocket } from '@/lib/socket-client';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Copy, Check, Code, FileCode, Key, ArrowLeft, MessageSquare, Activity, Wifi, WifiOff, Play, Pause, ExternalLink, AlertCircle } from 'lucide-react';

type SnippetType = 'javascript' | 'iframe' | 'qualtrics' | 'token';

export default function TaskSnippetsPage() {
  const params = useParams();
  const router = useRouter();
  const taskId = params.id as string;
  const [snippets, setSnippets] = useState<TaskSnippetsResponse | null>(null);
  const [qualtricsSnippet, setQualtricsSnippet] = useState<string>('');
  const [, setQualtricsInstructions] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copiedSnippet, setCopiedSnippet] = useState<SnippetType | null>(null);
  const [activeTab, setActiveTab] = useState<SnippetType>('javascript');

  // Live preview state for Qualtrics testing
  const [isLivePreviewActive, setIsLivePreviewActive] = useState(false);
  const [liveEvents, setLiveEvents] = useState<any[]>([]);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  const [isPaused, setIsPaused] = useState(false);
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const fetchSnippets = async () => {
      try {
        setLoading(true);
        setError(null);
        // Fetch the task data first to get the token
        const taskResponse = await api.get<{
          success: boolean;
          data: TaskSnippetsResponse;
        }>(`/api/v1/tasks/${taskId}/snippet`);
        setSnippets(taskResponse.data);

        // Fetch Qualtrics-specific snippet from the new tracker endpoint
        if (taskResponse.data.taskToken) {
          try {
            // Call tracker endpoint directly (not through /api/v1)
            const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
            // Add cache-busting parameter to prevent browser caching
            const cacheBuster = Date.now();
            const response = await fetch(
              `${apiUrl}/tracker/snippet?taskToken=${taskResponse.data.taskToken}&type=qualtrics&_=${cacheBuster}`,
              {
                cache: 'no-store', // Prevent Next.js caching
                headers: {
                  'Cache-Control': 'no-cache', // Prevent browser caching
                },
              }
            );
            const qualtricsData = await response.json();
            if (qualtricsData.success) {
              setQualtricsSnippet(qualtricsData.data.snippet);
              setQualtricsInstructions(qualtricsData.data.instructions);
            }
          } catch (err) {
            console.error('Failed to fetch Qualtrics snippet:', err);
          }
        }
      } catch (err: any) {
        setError(err.message || 'Failed to load tracking snippets');
      } finally {
        setLoading(false);
      }
    };

    if (taskId) {
      fetchSnippets();
    }
  }, [taskId]);

  const copyToClipboard = async (text: string, type: SnippetType) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedSnippet(type);
      setTimeout(() => setCopiedSnippet(null), 2000);
    } catch (err) {
      console.error('Failed to copy to clipboard:', err);
    }
  };

  // Handle live preview toggle
  const toggleLivePreview = async () => {
    if (isLivePreviewActive) {
      // Disconnect
      disconnectSocket();
      setIsLivePreviewActive(false);
      setConnectionStatus('disconnected');
      setLiveEvents([]);
    } else {
      // Connect
      if (!snippets?.taskToken) {
        return;
      }

      try {
        setConnectionStatus('connecting');
        const socket = await initializeSocket();

        // Join task room for live events
        socket.emit('join-task', { taskId, taskToken: snippets.taskToken });

        // Listen for event-received events from backend
        socket.on('event-received', (data: any) => {
          if (!isPaused) {
            // Store full data including sessionId and userId
            const enrichedEvent = {
              ...data.event,
              sessionId: data.sessionId,
              externalUserId: data.externalUserId,
              timestamp: data.event.timestamp || Date.now(),
            };
            setLiveEvents((prev) => [enrichedEvent, ...prev].slice(0, 100));

            // Auto-scroll to top
            if (scrollAreaRef.current) {
              scrollAreaRef.current.scrollTop = 0;
            }
          }
        });

        // Connection status handlers
        socket.on('connect', () => {
          setConnectionStatus('connected');
        });

        socket.on('disconnect', () => {
          setConnectionStatus('disconnected');
        });

        setIsLivePreviewActive(true);
        setConnectionStatus('connected');
      } catch (err) {
        console.error('Failed to connect to live preview:', err);
        setConnectionStatus('disconnected');
      }
    }
  };

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isLivePreviewActive) {
        disconnectSocket();
      }
    };
  }, [isLivePreviewActive]);

  if (loading) {
    return (
      <div className="container mx-auto py-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/tasks/${taskId}`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Task
        </Button>
        <div className="flex items-center justify-center min-h-[400px]">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary mx-auto mb-4"></div>
            <p className="text-muted-foreground">Loading snippets...</p>
          </div>
        </div>
      </div>
    );
  }

  if (error || !snippets) {
    return (
      <div className="container mx-auto py-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/tasks/${taskId}`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Task
        </Button>
        <Alert variant="destructive">
          <AlertTitle>Error</AlertTitle>
          <AlertDescription>
            {error || 'Failed to load tracking snippets'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const tabs: Array<{ id: SnippetType; label: string; icon: any }> = [
    { id: 'javascript', label: 'JavaScript Snippet', icon: Code },
    { id: 'iframe', label: 'Iframe Embed', icon: FileCode },
    { id: 'qualtrics', label: 'Qualtrics Integration', icon: MessageSquare },
    { id: 'token', label: 'Task Token', icon: Key },
  ];

  return (
    <div className="container mx-auto py-8">
      <div className="mb-8">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push(`/tasks/${taskId}`)}
          className="mb-4"
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Back to Task
        </Button>
        <h1 className="text-3xl font-bold mb-2">Tracking Snippets</h1>
        <p className="text-muted-foreground">
          {getBrandText().integration.integrate} using these code snippets
        </p>
      </div>

      {copiedSnippet && (
        <Alert variant="success" className="mb-6">
          <Check className="h-4 w-4" />
          <AlertTitle>Copied!</AlertTitle>
          <AlertDescription>
            The snippet has been copied to your clipboard
          </AlertDescription>
        </Alert>
      )}

      <div className="mb-6 flex gap-2 border-b">
        {tabs.map((tab) => {
          const Icon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2 border-b-2 transition-colors ${
                activeTab === tab.id
                  ? 'border-primary text-primary font-medium'
                  : 'border-transparent text-muted-foreground hover:text-foreground'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {activeTab === 'javascript' && (
        <Card>
          <CardHeader>
            <CardTitle>JavaScript Tracking Snippet</CardTitle>
            <CardDescription>
              Add this snippet to your HTML page to start tracking user interactions
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-950 rounded-lg p-4 relative">
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 bg-slate-800 hover:bg-slate-700"
                onClick={() =>
                  copyToClipboard(snippets.javascriptSnippet, 'javascript')
                }
              >
                {copiedSnippet === 'javascript' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <pre className="text-sm text-slate-50 overflow-x-auto pr-12">
                <code>{snippets.javascriptSnippet}</code>
              </pre>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">How to use:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Copy the code snippet above</li>
                <li>
                  Paste it in the <code className="bg-muted px-1 py-0.5 rounded">&lt;head&gt;</code> or before the closing{' '}
                  <code className="bg-muted px-1 py-0.5 rounded">&lt;/body&gt;</code> tag
                </li>
                <li>
                  Replace <code className="bg-muted px-1 py-0.5 rounded">USER_ID</code> with your
                  user's unique identifier
                </li>
                <li>The tracker will automatically start recording interactions</li>
              </ol>
            </div>
            <Alert>
              <AlertDescription className="text-sm">
                <strong>Note:</strong> Make sure to initialize the tracker with a unique user ID
                for each user. This allows you to track individual user sessions and behavior.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {activeTab === 'iframe' && (
        <Card>
          <CardHeader>
            <CardTitle>Iframe Embed Code</CardTitle>
            <CardDescription>
              Embed your survey or form with automatic tracking enabled
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-950 rounded-lg p-4 relative">
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 bg-slate-800 hover:bg-slate-700"
                onClick={() => copyToClipboard(snippets.iframeSnippet, 'iframe')}
              >
                {copiedSnippet === 'iframe' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <pre className="text-sm text-slate-50 overflow-x-auto pr-12">
                <code>{snippets.iframeSnippet}</code>
              </pre>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">How to use:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Copy the iframe code snippet above</li>
                <li>Paste it where you want the embedded content to appear</li>
                <li>
                  Update the <code className="bg-muted px-1 py-0.5 rounded">src</code> attribute
                  with your survey or form URL
                </li>
                <li>
                  Add the <code className="bg-muted px-1 py-0.5 rounded">userId</code> parameter
                  to the URL with your user's unique identifier
                </li>
                <li>The iframe will automatically track interactions</li>
              </ol>
            </div>
            <Alert>
              <AlertDescription className="text-sm">
                <strong>Note:</strong> The iframe approach is ideal for embedding external
                surveys or forms. Ensure your external service allows iframe embedding and has
                appropriate CORS settings.
              </AlertDescription>
            </Alert>
          </CardContent>
        </Card>
      )}

      {activeTab === 'qualtrics' && (
        <Card>
          <CardHeader>
            <CardTitle>Qualtrics Integration</CardTitle>
            <CardDescription>
              Track all text inputs in your Qualtrics survey. No user ID setup needed - works immediately after pasting the code.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Quick test page link */}
            <Alert className="bg-blue-50 border-blue-200 dark:bg-blue-950 dark:border-blue-800">
              <ExternalLink className="h-4 w-4" />
              <AlertTitle>🚀 Quick Test Page</AlertTitle>
              <AlertDescription className="mt-2">
                <p className="text-sm mb-3">
                  Want to test the tracker before setting up Qualtrics? Use our interactive debug page with your task token.
                </p>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => {
                    const testUrl = `${process.env.NEXT_PUBLIC_API_URL || 'https://api.writehumanly.net'}/tracker/test-tracker-debug.html?token=${snippets?.taskToken}`;
                    window.open(testUrl, '_blank');
                  }}
                  className="gap-2"
                >
                  <ExternalLink className="h-4 w-4" />
                  Open Test Page
                </Button>
                <p className="text-xs text-muted-foreground mt-2">
                  This page includes: real-time event logging, "Force Flush" button for immediate testing, and detailed diagnostics
                </p>
              </AlertDescription>
            </Alert>

            {/* Step-by-step instructions */}
            <Alert>
              <Activity className="h-4 w-4" />
              <AlertTitle>Quick Setup - 3 Easy Steps</AlertTitle>
              <AlertDescription className="mt-2">
                <div className="space-y-3">
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      1
                    </div>
                    <div>
                      <p className="font-semibold">Copy the code below</p>
                      <p className="text-sm text-muted-foreground">Click the copy button on the code snippet</p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      2
                    </div>
                    <div>
                      <p className="font-semibold">Add to your Qualtrics survey</p>
                      <p className="text-sm text-muted-foreground">
                        In Qualtrics editor → Click <span className="font-mono bg-muted px-1 rounded">Look & Feel</span> (paint brush icon) →
                        Go to <span className="font-mono bg-muted px-1 rounded">General</span> tab →
                        Click <span className="font-mono bg-muted px-1 rounded">Edit</span> in Header section →
                        Paste the code → Click <span className="font-mono bg-muted px-1 rounded">Apply</span> and <span className="font-mono bg-muted px-1 rounded">Save</span>
                      </p>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-bold">
                      3
                    </div>
                    <div>
                      <p className="font-semibold">Test it with Live Preview below</p>
                      <p className="text-sm text-muted-foreground">
                        Click "Start Live Preview" → Open your survey → Type in any text field → See events in real-time!
                      </p>
                    </div>
                  </div>
                </div>
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Badge variant="default" className="bg-green-600">
                  ✓ Includes Diagnostic Logging
                </Badge>
                <span className="text-xs text-muted-foreground">
                  Code is ready to test - includes connection testing & detailed logs
                </span>
              </div>
              <div className="bg-slate-950 rounded-lg p-4 relative">
                <Button
                  variant="outline"
                  size="sm"
                  className="absolute top-2 right-2 bg-slate-800 hover:bg-slate-700"
                  onClick={() => copyToClipboard(qualtricsSnippet, 'qualtrics')}
                >
                  {copiedSnippet === 'qualtrics' ? (
                    <Check className="h-4 w-4" />
                  ) : (
                    <Copy className="h-4 w-4" />
                  )}
                </Button>
                <pre className="text-xs text-slate-50 overflow-x-auto pr-12">
                  <code>{qualtricsSnippet}</code>
                </pre>
              </div>
            </div>

            {/* Test Integration Section */}
            <div className="border-t pt-6 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="font-semibold text-lg flex items-center gap-2">
                    <Activity className="h-5 w-5 text-primary" />
                    Test Your Integration - Live Preview
                  </h4>
                  <p className="text-sm text-muted-foreground mt-1">
                    See events streaming in real-time as users type in your survey
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {connectionStatus === 'connected' && (
                    <Badge variant="default" className="flex items-center gap-1">
                      <Wifi className="h-3 w-3" />
                      Connected
                    </Badge>
                  )}
                  {connectionStatus === 'disconnected' && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <WifiOff className="h-3 w-3" />
                      Disconnected
                    </Badge>
                  )}
                  {connectionStatus === 'connecting' && (
                    <Badge variant="secondary" className="flex items-center gap-1">
                      <div className="animate-spin rounded-full h-3 w-3 border-b border-current"></div>
                      Connecting...
                    </Badge>
                  )}
                </div>
              </div>

              <Alert className="border-primary/50 bg-primary/5">
                <ExternalLink className="h-4 w-4" />
                <AlertTitle>Testing Steps</AlertTitle>
                <AlertDescription className="mt-2">
                  <div className="space-y-3">
                    <div className="flex gap-3 items-start">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold mt-0.5">
                        1
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">Click "Start Live Preview" button below</p>
                        <p className="text-xs text-muted-foreground">Wait for status to show "Connected"</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold mt-0.5">
                        2
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">Open your Qualtrics survey in a new tab</p>
                        <p className="text-xs text-muted-foreground">Make sure the tracking code is installed in the survey header</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold mt-0.5">
                        3
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">Open browser console (F12) in the survey tab</p>
                        <p className="text-xs text-muted-foreground">Look for "{getBrandText().integration.consoleMessages}" confirming tracker loaded</p>
                      </div>
                    </div>
                    <div className="flex gap-3 items-start">
                      <div className="flex-shrink-0 w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold mt-0.5">
                        4
                      </div>
                      <div className="flex-1">
                        <p className="font-medium text-sm">Type in any text field in the survey</p>
                        <p className="text-xs text-muted-foreground">Events will appear instantly in the Live Events panel below</p>
                      </div>
                    </div>
                  </div>
                </AlertDescription>
              </Alert>

              <div className="flex gap-2">
                <Button
                  onClick={toggleLivePreview}
                  disabled={connectionStatus === 'connecting'}
                  variant={isLivePreviewActive ? 'destructive' : 'default'}
                  className="flex-1"
                >
                  {connectionStatus === 'connecting' ? (
                    <>
                      <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-current mr-2"></div>
                      Connecting...
                    </>
                  ) : isLivePreviewActive ? (
                    <>
                      <WifiOff className="h-4 w-4 mr-2" />
                      Stop Live Preview
                    </>
                  ) : (
                    <>
                      <Activity className="h-4 w-4 mr-2" />
                      Start Live Preview
                    </>
                  )}
                </Button>
                {isLivePreviewActive && (
                  <Button
                    onClick={() => setIsPaused(!isPaused)}
                    variant="outline"
                  >
                    {isPaused ? (
                      <><Play className="h-4 w-4 mr-2" /> Resume</>
                    ) : (
                      <><Pause className="h-4 w-4 mr-2" /> Pause</>
                    )}
                  </Button>
                )}
              </div>

              {isLivePreviewActive && (
                <div className="border rounded-lg p-4 bg-slate-950">
                  <div className="flex items-center justify-between mb-2">
                    <h5 className="text-sm font-semibold text-slate-50">Live Events</h5>
                    <div className="text-xs text-slate-400">
                      {liveEvents.length} events
                    </div>
                  </div>

                  {liveEvents.length === 0 ? (
                    <div className="text-center py-8 text-slate-400 text-sm">
                      <Activity className="h-8 w-8 mx-auto mb-2 opacity-50" />
                      <p>Waiting for events...</p>
                      <p className="text-xs mt-1">Open your Qualtrics survey and start typing</p>
                    </div>
                  ) : (
                    <ScrollArea className="h-96" ref={scrollAreaRef}>
                      <div className="space-y-2">
                        {liveEvents.map((event, index) => (
                          <div
                            key={index}
                            className="bg-slate-900 rounded p-3 text-xs border border-slate-800 space-y-2"
                          >
                            <div className="flex items-center justify-between">
                              <Badge variant="secondary" className="text-xs">
                                {event.eventType || event.event_type}
                              </Badge>
                              <span className="text-slate-400 text-xs">
                                {new Date(event.timestamp).toLocaleTimeString()}
                              </span>
                            </div>

                            {/* User and Session Info */}
                            {(event.externalUserId || event.sessionId) && (
                              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800">
                                {event.externalUserId && (
                                  <div className="text-slate-400">
                                    <span className="text-slate-500">User ID:</span>{' '}
                                    <span className="font-mono text-xs">{event.externalUserId}</span>
                                  </div>
                                )}
                                {event.sessionId && (
                                  <div className="text-slate-400">
                                    <span className="text-slate-500">Session:</span>{' '}
                                    <span className="font-mono text-xs">{event.sessionId.substring(0, 8)}...</span>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* Event Details */}
                            <div className="space-y-1">
                              {event.keyChar && (
                                <div className="text-slate-300">
                                  <span className="text-slate-500">Key:</span>{' '}
                                  <span className="font-mono bg-slate-800 px-1.5 py-0.5 rounded">{event.keyChar}</span>
                                </div>
                              )}
                              {event.targetElement && (
                                <div className="text-slate-400">
                                  <span className="text-slate-500">Element:</span>{' '}
                                  <span className="font-mono text-xs">{event.targetElement}</span>
                                </div>
                              )}
                              {event.fieldName && (
                                <div className="text-slate-400">
                                  <span className="text-slate-500">Field:</span> {event.fieldName}
                                </div>
                              )}
                              {event.textAfter !== undefined && event.textAfter !== null && (
                                <div className="text-slate-400">
                                  <span className="text-slate-500">Text Length:</span> {event.textAfter.length} chars
                                </div>
                              )}
                              {event.cursorPosition !== undefined && event.cursorPosition !== null && (
                                <div className="text-slate-400">
                                  <span className="text-slate-500">Cursor:</span> {event.cursorPosition}
                                </div>
                              )}
                              {event.pastedContent && (
                                <div className="text-slate-300">
                                  <span className="text-slate-500">Pasted:</span>{' '}
                                  <span className="bg-slate-800 px-1.5 py-0.5 rounded">
                                    {event.pastedContent.substring(0, 50)}
                                    {event.pastedContent.length > 50 ? '...' : ''}
                                  </span>
                                </div>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    </ScrollArea>
                  )}
                </div>
              )}
            </div>

            {/* Troubleshooting */}
            <div className="border-t pt-4">
              <details className="group">
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between">
                    <h4 className="font-semibold text-sm flex items-center gap-2">
                      <AlertCircle className="h-4 w-4" />
                      Troubleshooting Common Issues
                    </h4>
                    <div className="text-xs text-muted-foreground group-open:hidden">
                      Click to expand
                    </div>
                  </div>
                </summary>
                <div className="mt-4 space-y-3 text-sm">
                  <div className="border-l-2 border-yellow-500 pl-3">
                    <p className="font-medium">Script not loading / Console shows errors</p>
                    <ul className="list-disc list-inside text-muted-foreground text-xs mt-1 space-y-1">
                      <li>Verify your survey uses HTTPS (Qualtrics requirement)</li>
                      <li>Check that api.writehumanly.net is accessible from your browser</li>
                      <li>Look for "Mixed Content" errors in console</li>
                    </ul>
                  </div>
                  <div className="border-l-2 border-yellow-500 pl-3">
                    <p className="font-medium">No console messages appearing</p>
                    <ul className="list-disc list-inside text-muted-foreground text-xs mt-1 space-y-1">
                      <li>Verify the code was pasted in the correct location</li>
                      <li>Try refreshing the survey preview</li>
                      <li>Check browser console for JavaScript errors</li>
                    </ul>
                  </div>
                  <div className="border-l-2 border-yellow-500 pl-3">
                    <p className="font-medium">Events not showing in Live Preview</p>
                    <ul className="list-disc list-inside text-muted-foreground text-xs mt-1 space-y-1">
                      <li>Ensure "Start Live Preview" is clicked and shows "Connected"</li>
                      <li>Verify tracker initialized successfully (check console for "✓" messages)</li>
                      <li>Make sure you're typing in a text field (not radio buttons/checkboxes)</li>
                    </ul>
                  </div>
                  <div className="border-l-2 border-green-500 pl-3">
                    <p className="font-medium">✓ Everything working correctly if you see:</p>
                    <ul className="list-disc list-inside text-muted-foreground text-xs mt-1 space-y-1">
                      <li>Console shows: "{getBrandText().integration.consoleSuccess}"</li>
                      <li>Live Preview shows "Connected" status</li>
                      <li>Events appear as you type in text fields</li>
                    </ul>
                  </div>
                </div>
              </details>
            </div>
          </CardContent>
        </Card>
      )}

      {activeTab === 'token' && (
        <Card>
          <CardHeader>
            <CardTitle>Task Token</CardTitle>
            <CardDescription>
              Use this token for API requests and custom integrations
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="bg-slate-950 rounded-lg p-4 relative">
              <Button
                variant="outline"
                size="sm"
                className="absolute top-2 right-2 bg-slate-800 hover:bg-slate-700"
                onClick={() => copyToClipboard(snippets.taskToken, 'token')}
              >
                {copiedSnippet === 'token' ? (
                  <Check className="h-4 w-4" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </Button>
              <pre className="text-sm text-slate-50 overflow-x-auto pr-12">
                <code>{snippets.taskToken}</code>
              </pre>
            </div>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">How to use:</h4>
              <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
                <li>Copy the task token above</li>
                <li>
                  Include it in the <code className="bg-muted px-1 py-0.5 rounded">X-Task-Token</code> header
                  for API requests
                </li>
                <li>Use it to authenticate tracking requests from your application</li>
                <li>Keep this token secure and do not expose it publicly</li>
              </ol>
            </div>
            <Alert variant="destructive">
              <AlertDescription className="text-sm">
                <strong>Warning:</strong> Keep your task token secure. Do not commit it to
                version control or expose it in client-side code. Anyone with this token can send
                tracking data to your task.
              </AlertDescription>
            </Alert>
            <div className="space-y-2">
              <h4 className="font-semibold text-sm">Example API Usage:</h4>
              <div className="bg-slate-950 rounded-lg p-4">
                <pre className="text-xs text-slate-50 overflow-x-auto">
                  <code>{`// Initialize a tracking session
fetch('https://api.writehumanly.net/api/v1/tracking/init', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'X-Task-Token': '${snippets.taskToken}'
  },
  body: JSON.stringify({
    externalUserId: 'user-123',
    metadata: { /* optional */ }
  })
});`}</code>
                </pre>
              </div>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

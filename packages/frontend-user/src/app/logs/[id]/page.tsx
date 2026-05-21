'use client';

import { Fragment, useEffect, useState, useCallback, useMemo } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Clock, Keyboard, Copy, MousePointer, Type, Sparkles, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { apiClient } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { format } from 'date-fns';
import type { AIInteractionLog, DocumentEvent } from '@humanly/shared';

const EVENT_ICONS: Record<string, React.ReactNode> = {
  keydown: <Keyboard className="h-3 w-3" />,
  keyup: <Keyboard className="h-3 w-3" />,
  paste: <Copy className="h-3 w-3" />,
  copy: <Copy className="h-3 w-3" />,
  cut: <Copy className="h-3 w-3" />,
  click: <MousePointer className="h-3 w-3" />,
  focus: <MousePointer className="h-3 w-3" />,
  blur: <MousePointer className="h-3 w-3" />,
  input: <Type className="h-3 w-3" />,
};

const EVENT_COLORS: Record<string, string> = {
  keydown: 'bg-muted text-foreground',
  keyup: 'bg-muted/70 text-muted-foreground',
  paste: 'bg-[#f1e8df] text-[#8a5f43]',
  copy: 'bg-[#f1e8df] text-[#8a5f43]',
  cut: 'bg-destructive/10 text-destructive',
  click: 'bg-secondary text-secondary-foreground',
  focus: 'bg-[#eef3ed] text-[#58715f]',
  blur: 'bg-muted/70 text-muted-foreground',
  input: 'bg-muted text-foreground',
};

const AI_ACTION_LABELS: Record<string, string> = {
  grammar_check: 'Fix grammar',
  rewrite: 'Rewrite',
  other: 'Chat',
};

function getSelectionText(log: AIInteractionLog) {
  return log.modifications?.[0]?.before || log.contextSnapshot?.selection?.text || '';
}

function getSuggestedText(log: AIInteractionLog) {
  return log.modifications?.[0]?.after || log.response || '';
}

function getAILogLabel(log: AIInteractionLog) {
  if (log.queryType === 'grammar_check') {
    return 'Fix grammar';
  }

  if (log.queryType === 'other') {
    return 'Chat';
  }

  if (log.query.toLowerCase().includes('simplify')) {
    return 'Simplify';
  }

  if (log.query.toLowerCase().includes('formal')) {
    return 'Make formal';
  }

  if (log.query.toLowerCase().includes('improve')) {
    return 'Improve writing';
  }

  return AI_ACTION_LABELS[log.queryType] || log.queryType;
}

type HistoryItem =
  | { kind: 'event'; id: string; timestamp: string | Date; event: DocumentEvent }
  | { kind: 'ai'; id: string; timestamp: string | Date; log: AIInteractionLog };

export default function DocumentLogsPage() {
  const params = useParams();
  const router = useRouter();
  const documentId = params.id as string;
  const { checkAuth } = useAuthStore();

  const [documentTitle, setDocumentTitle] = useState<string>('Document');
  const [events, setEvents] = useState<DocumentEvent[]>([]);
  const [aiLogs, setAiLogs] = useState<AIInteractionLog[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [expandedAIIds, setExpandedAIIds] = useState<Set<string>>(new Set());
  const LIMIT = 100;

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  const fetchEvents = useCallback(async (currentOffset: number) => {
    try {
      setIsLoading(true);
      setError(null);

      const [docRes, eventsRes, aiLogsRes] = await Promise.all([
        apiClient.get(`/documents/${documentId}`),
        apiClient.get(`/documents/${documentId}/events?limit=${LIMIT}&offset=${currentOffset}`),
        apiClient
          .get(`/ai/logs?documentId=${documentId}&limit=50&offset=0`)
          .catch(() => ({ data: { data: [] } })),
      ]);

      setDocumentTitle(docRes.data.data?.document?.title || 'Document');
      const eventsData = eventsRes.data.data?.events || eventsRes.data.data || [];
      setEvents(Array.isArray(eventsData) ? eventsData : []);
      setTotal(eventsRes.data.count ?? eventsRes.data.data?.total ?? eventsData.length);
      const aiLogData = aiLogsRes.data.data || [];
      setAiLogs(Array.isArray(aiLogData) ? aiLogData : []);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to load logs');
    } finally {
      setIsLoading(false);
    }
  }, [documentId]);

  useEffect(() => {
    fetchEvents(offset);
  }, [fetchEvents, offset]);

  const visibleAILogs = useMemo(() => {
    return aiLogs.filter((log) => {
      const selectionText = getSelectionText(log);
      const suggestedText = getSuggestedText(log);

      // Hide the raw inline AI response log when we also have the user-facing
      // selection action log for the same before/after pair.
      if (!log.modificationsApplied && log.status === 'success' && selectionText && suggestedText) {
        const hasMirrorActionLog = aiLogs.some((candidate) => {
          if (candidate.id === log.id) return false;

          const candidateSelection = getSelectionText(candidate);
          const candidateSuggested = getSuggestedText(candidate);

          return (
            candidate.queryType === log.queryType &&
            candidateSelection === selectionText &&
            candidateSuggested === suggestedText &&
            (candidate.modificationsApplied || candidate.status === 'cancelled')
          );
        });

        if (hasMirrorActionLog) {
          return false;
        }
      }

      return true;
    });
  }, [aiLogs]);

  const historyItems = useMemo<HistoryItem[]>(() => {
    const items: HistoryItem[] = [
      ...events.map((event) => ({
        kind: 'event' as const,
        id: event.id,
        timestamp: event.timestamp,
        event,
      })),
      ...visibleAILogs.map((log) => ({
        kind: 'ai' as const,
        id: log.id,
        timestamp: log.timestamp,
        log,
      })),
    ];

    return items.sort(
      (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
  }, [events, visibleAILogs]);

  const toggleAIEntry = (logId: string) => {
    setExpandedAIIds((prev) => {
      const next = new Set(prev);
      if (next.has(logId)) {
        next.delete(logId);
      } else {
        next.add(logId);
      }
      return next;
    });
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border/70 bg-card px-4 py-3">
        <Button variant="outline" size="sm" onClick={() => router.push(`/documents/${documentId}`)}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          Back
        </Button>
        <div>
          <h1 className="font-semibold text-sm">{documentTitle}</h1>
          <p className="text-xs text-muted-foreground">Document and AI Activity Logs</p>
        </div>
      </div>

      <div className="max-w-4xl mx-auto p-4 space-y-4">
        {/* Summary */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Event Summary
            </CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-sm text-muted-foreground">
              Total recorded events: <span className="font-medium text-foreground">{total}</span>
            </p>
            <p className="text-sm text-muted-foreground mt-1">
              AI actions logged: <span className="font-medium text-foreground">{visibleAILogs.length}</span>
            </p>
          </CardContent>
        </Card>

        {/* Events list */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground text-sm">Loading logs...</div>
        ) : error ? (
          <div className="text-center py-12 text-destructive text-sm">{error}</div>
        ) : historyItems.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">No events recorded yet.</div>
        ) : (
          <>
            <div className="overflow-hidden rounded-lg border border-border/80 bg-card">
              <table className="w-full text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="text-left px-4 py-2 w-40">Time</th>
                    <th className="text-left px-4 py-2 w-32">Event</th>
                    <th className="text-left px-4 py-2">Key / Detail</th>
                    <th className="text-left px-4 py-2 w-24">Cursor</th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {historyItems.map((item) => {
                    if (item.kind === 'event') {
                      const { event } = item;
                      return (
                        <tr key={event.id} className="hover:bg-muted/30">
                          <td className="px-4 py-2 text-xs text-muted-foreground font-mono">
                            {format(new Date(event.timestamp), 'HH:mm:ss.SSS')}
                          </td>
                          <td className="px-4 py-2">
                            <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs font-medium ${EVENT_COLORS[event.eventType] ?? 'bg-muted text-muted-foreground'}`}>
                              {EVENT_ICONS[event.eventType] ?? null}
                              {event.eventType}
                            </span>
                          </td>
                          <td className="px-4 py-2 font-mono text-xs">
                            {event.keyChar
                              ? <span className="bg-muted px-1 rounded">{event.keyChar}</span>
                              : event.keyCode
                              ? <span className="text-muted-foreground">{event.keyCode}</span>
                              : <span className="text-muted-foreground">—</span>}
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            {event.cursorPosition ?? '—'}
                          </td>
                        </tr>
                      );
                    }

                    const { log } = item;
                    const isExpanded = expandedAIIds.has(log.id);
                    const beforeText = getSelectionText(log);
                    const afterText = getSuggestedText(log);
                    const label = getAILogLabel(log);
                    const isChatLog = log.queryType === 'other';
                    const detailBeforeText = isChatLog ? log.query : beforeText;

                    return (
                      <Fragment key={log.id}>
                        <tr
                          className="cursor-pointer hover:bg-muted/30"
                          onClick={() => toggleAIEntry(log.id)}
                        >
                          <td className="px-4 py-2 text-xs text-muted-foreground font-mono">
                            <div className="flex items-center gap-2">
                              {isExpanded ? (
                                <ChevronDown className="h-3 w-3" />
                              ) : (
                                <ChevronRight className="h-3 w-3" />
                              )}
                              {format(new Date(log.timestamp), 'HH:mm:ss.SSS')}
                            </div>
                          </td>
                          <td className="px-4 py-2">
                            <span className="inline-flex items-center gap-1 rounded bg-[#f1e8df] px-2 py-0.5 text-xs font-medium text-[#8a5f43]">
                              <Sparkles className="h-3 w-3" />
                              {label}
                            </span>
                          </td>
                          <td className="px-4 py-2 text-xs">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="font-medium text-foreground">
                                {log.modificationsApplied ? 'Applied' : log.status === 'cancelled' ? 'Discarded' : log.status}
                              </span>
                              <span className="truncate text-muted-foreground max-w-[360px]">
                                {detailBeforeText || log.query}
                              </span>
                            </div>
                          </td>
                          <td className="px-4 py-2 text-xs text-muted-foreground">
                            AI
                          </td>
                        </tr>
                        {isExpanded && (
                          <tr className="bg-muted/20">
                            <td colSpan={4} className="px-4 py-3">
                              <div className="grid gap-3 md:grid-cols-2">
                                <div>
                                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                                    {isChatLog ? 'Question' : 'Previous text'}
                                  </p>
                                  <div className="rounded bg-background p-3 text-sm whitespace-pre-wrap border">
                                    {detailBeforeText || '—'}
                                  </div>
                                </div>
                                <div>
                                  <p className="mb-1 text-xs font-medium text-muted-foreground">
                                    {isChatLog ? 'AI response' : 'AI modified text'}
                                  </p>
                                  <div className="rounded bg-background p-3 text-sm whitespace-pre-wrap border">
                                    {afterText || '—'}
                                  </div>
                                </div>
                              </div>
                            </td>
                          </tr>
                        )}
                      </Fragment>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {total > LIMIT && (
              <div className="flex items-center justify-between text-sm text-muted-foreground">
                <span>Showing {offset + 1}–{Math.min(offset + LIMIT, total)} of {total}</span>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset === 0}
                    onClick={() => setOffset(Math.max(0, offset - LIMIT))}
                  >
                    Previous
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={offset + LIMIT >= total}
                    onClick={() => setOffset(offset + LIMIT)}
                  >
                    Next
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

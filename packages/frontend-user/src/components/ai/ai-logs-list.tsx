'use client';

import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  Loader2,
  Download,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Badge } from '@/components/ui/badge';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';
import { AIInteractionLog, AIQueryType } from '@humanly/shared';

interface AILogsListProps {
  logs: AIInteractionLog[];
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
}

export function AILogsList({ logs, isLoading, hasMore, onLoadMore }: AILogsListProps) {
  if (isLoading && logs.length === 0) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (logs.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-muted-foreground p-4">
        <Clock className="h-8 w-8 mb-3 opacity-50" />
        <p className="text-sm text-center">No AI interactions yet</p>
        <p className="text-xs text-center mt-1">
          Your AI chat history will appear here
        </p>
      </div>
    );
  }

  const exportLogs = () => {
    const data = JSON.stringify(logs, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-logs-${new Date().toISOString().split('T')[0]}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b">
        <span className="text-sm text-muted-foreground">
          {logs.length} interaction{logs.length !== 1 ? 's' : ''}
        </span>
        <Button variant="outline" size="sm" onClick={exportLogs}>
          <Download className="h-3 w-3 mr-1" />
          Export
        </Button>
      </div>

      {/* Logs List */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-2">
          {logs.map((log) => (
            <LogEntry key={log.id} log={log} />
          ))}

          {hasMore && (
            <div className="flex justify-center py-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={onLoadMore}
                disabled={isLoading}
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                ) : null}
                Load more
              </Button>
            </div>
          )}
        </div>
      </ScrollArea>
    </div>
  );
}

interface LogEntryProps {
  log: AIInteractionLog;
}

function LogEntry({ log }: LogEntryProps) {
  const [isOpen, setIsOpen] = useState(false);

  const formatDate = (date: Date | string) => {
    const d = new Date(date);
    return d.toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="h-4 w-4 text-[#58715f]" />;
      case 'error':
        return <XCircle className="h-4 w-4 text-destructive" />;
      case 'cancelled':
        return <AlertCircle className="h-4 w-4 text-yellow-500" />;
      case 'pending':
        return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
      default:
        return null;
    }
  };

  const getQueryTypeBadge = (type: AIQueryType) => {
    const variants: Record<AIQueryType, { label: string; className: string }> = {
      grammar_check: { label: 'Grammar', className: 'bg-muted text-foreground' },
      spelling_check: { label: 'Spelling', className: 'bg-muted text-foreground' },
      rewrite: { label: 'Rewrite', className: 'bg-[#f1e8df] text-[#8a5f43]' },
      summarize: { label: 'Summary', className: 'bg-[#eef3ed] text-[#58715f]' },
      expand: { label: 'Expand', className: 'bg-[#f1e8df] text-[#8a5f43]' },
      translate: { label: 'Translate', className: 'bg-muted text-foreground' },
      format: { label: 'Format', className: 'bg-muted text-foreground' },
      question: { label: 'Q&A', className: 'bg-muted text-foreground' },
      reference: { label: 'Reference', className: 'bg-muted text-foreground' },
      other: { label: 'Chat', className: 'bg-muted text-foreground' },
    };

    const variant = variants[type] || variants.other;
    return (
      <span className={cn('text-xs px-1.5 py-0.5 rounded', variant.className)}>
        {variant.label}
      </span>
    );
  };

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <div className="rounded-md border bg-card">
        <CollapsibleTrigger asChild>
          <button className="w-full p-3 text-left hover:bg-muted/50 transition-colors">
            <div className="flex items-start gap-2">
              {isOpen ? (
                <ChevronDown className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight className="h-4 w-4 mt-0.5 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  {getStatusIcon(log.status)}
                  <span className="text-xs text-muted-foreground">
                    {formatDate(log.timestamp)}
                  </span>
                  {getQueryTypeBadge(log.queryType)}
                  {log.modificationsApplied && (
                    <Badge variant="secondary" className="text-xs h-5">
                      Modified
                    </Badge>
                  )}
                </div>
                <p className="text-sm truncate">{log.query}</p>
              </div>
            </div>
          </button>
        </CollapsibleTrigger>

        <CollapsibleContent>
          <div className="px-3 pb-3 pt-0 border-t">
            {/* Query */}
            <div className="mt-3">
              <p className="text-xs font-medium text-muted-foreground mb-1">Query</p>
              <p className="text-sm bg-muted rounded p-2">{log.query}</p>
            </div>

            {/* Response */}
            {log.response && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">Response</p>
                <p className="text-sm bg-muted rounded p-2 whitespace-pre-wrap max-h-40 overflow-y-auto">
                  {log.response}
                </p>
              </div>
            )}

            {/* Modifications */}
            {log.modificationsApplied && log.modifications && log.modifications.length > 0 && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Modifications Applied
                </p>
                <div className="space-y-2">
                  {log.modifications.map((mod, idx) => (
                    <div key={idx} className="text-xs bg-muted rounded p-2">
                      <div className="text-red-600 line-through">{mod.before}</div>
                      <div className="text-[#58715f]">{mod.after}</div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Context */}
            {log.contextSnapshot?.selection && (
              <div className="mt-3">
                <p className="text-xs font-medium text-muted-foreground mb-1">
                  Selection Context
                </p>
                <p className="text-xs bg-muted rounded p-2 italic truncate">
                  &quot;{log.contextSnapshot.selection.text}&quot;
                </p>
              </div>
            )}

            {/* Metadata */}
            <div className="mt-3 flex flex-wrap gap-2 text-xs text-muted-foreground">
              {log.responseTimeMs && (
                <span>Response time: {log.responseTimeMs}ms</span>
              )}
              {log.tokensUsed && (
                <span>
                  Tokens: {log.tokensUsed.input}in / {log.tokensUsed.output}out
                </span>
              )}
              {log.modelVersion && <span>Model: {log.modelVersion}</span>}
            </div>

            {/* Error */}
            {log.status === 'error' && log.errorMessage && (
              <div className="mt-3">
                <p className="text-xs font-medium text-destructive mb-1">Error</p>
                <p className="text-xs bg-destructive/10 text-destructive rounded p-2">
                  {log.errorMessage}
                </p>
              </div>
            )}
          </div>
        </CollapsibleContent>
      </div>
    </Collapsible>
  );
}

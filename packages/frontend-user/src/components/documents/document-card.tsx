'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { CalendarClock, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import type { Document } from '@humanly/shared';

interface WritingTimerCardState {
  expired: boolean;
  label: string;
  value: string;
  detail: string;
}

interface DocumentCardProps {
  document: Document & { displayTitle?: string };
  timerState?: WritingTimerCardState | null;
  onDelete: (id: string) => Promise<void>;
}

export function DocumentCard({ document, timerState, onDelete }: DocumentCardProps) {
  const router = useRouter();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      setIsDeleting(true);
      await onDelete(document.id);
      setShowDeleteDialog(false);
    } catch (error) {
      console.error('Failed to delete document:', error);
    } finally {
      setIsDeleting(false);
    }
  };

  const formatDate = (date: Date | string) => {
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const characterCount = document.characterCount ?? (document.plainText || '').length;
  const showPreview = characterCount > 100;
  const displayTitle = document.displayTitle || document.title || 'Untitled Document';

  return (
    <>
      <Link
        href={`/documents/${document.id}`}
        className="block h-full"
      >
        <Card className="group flex h-full cursor-pointer flex-col transition-colors hover:border-foreground/30">
          <CardContent className="flex flex-1 flex-col gap-3 p-5">
            <div className="flex items-start justify-between gap-2">
              <h3 className="min-w-0 text-lg font-semibold leading-tight text-foreground line-clamp-2">
                {displayTitle}
              </h3>
              {timerState?.expired && (
                <Badge variant="secondary" className="shrink-0 rounded-md">
                  Read-only
                </Badge>
              )}
            </div>

            <div className="text-xs text-muted-foreground">
              Last edited {formatDate(document.updatedAt || document.createdAt)} · {characterCount.toLocaleString()} characters
            </div>

            {timerState && (
              <div className="flex items-start gap-2 rounded-lg border border-border/70 bg-muted/35 p-3 text-sm">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-accent" />
                <div className="min-w-0">
                  <p className="humanly-eyebrow">
                    {timerState.label}
                  </p>
                  <p className="font-semibold">{timerState.value}</p>
                  <p className="text-xs text-muted-foreground">{timerState.detail}</p>
                </div>
              </div>
            )}

            {/* Preview text */}
            {showPreview && document.plainText && (
              <p className="text-sm text-muted-foreground/80 line-clamp-2">
                {document.plainText}
              </p>
            )}

            <div className="flex-1" />

            <div className="mt-2 flex items-center justify-end gap-2 border-t border-border/60 pt-3">
              <Button
                variant="outline"
                size="sm"
                className="h-8 text-xs"
                onClick={(e) => {
                  e.preventDefault();
                  router.push(`/documents/${document.id}`);
                }}
              >
                {timerState?.expired ? 'Open Read-only' : 'Open'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 text-xs text-muted-foreground hover:text-foreground"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setShowDeleteDialog(true);
                }}
              >
                <Trash2 className="h-3 w-3 mr-1" />
                Delete
              </Button>
            </div>
          </CardContent>
        </Card>
      </Link>

      <AlertDialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Document</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{document.title || 'this document'}&quot;?
              This action cannot be undone and will also delete all associated tracking events.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              disabled={isDeleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

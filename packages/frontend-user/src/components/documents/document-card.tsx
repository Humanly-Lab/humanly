'use client';

import { useState } from 'react';
import Link from 'next/link';
import { CalendarClock, FileText, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Card } from '@/components/ui/card';
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
  variant?: 'card' | 'list';
}

export function DocumentCard({ document, timerState, onDelete, variant = 'card' }: DocumentCardProps) {
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
  const previewText = document.plainText?.trim();
  const displayTitle = document.displayTitle || document.title || 'Untitled Document';
  const documentHref = `/documents/${document.id}`;
  const editedDate = formatDate(document.updatedAt || document.createdAt);

  const deleteButton = (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-9 w-9 text-muted-foreground hover:text-destructive"
      aria-label={`Delete ${displayTitle}`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setShowDeleteDialog(true);
      }}
    >
      <Trash2 className="h-4 w-4" />
    </Button>
  );

  const deleteDialog = (
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
  );

  if (variant === 'list') {
    return (
      <>
        <div className="relative border-b border-border/70">
          <Link
            href={documentHref}
            className="grid min-h-[4.25rem] cursor-pointer grid-cols-[minmax(0,1fr)_2.75rem] items-center gap-3 px-2 py-3 pr-12 transition-colors hover:bg-muted/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring md:grid-cols-[minmax(0,1fr)_8.5rem_10rem_2.75rem]"
          >
            <div className="flex min-w-0 items-center gap-3">
              <FileText className="h-5 w-5 shrink-0 text-accent" />
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2">
                  <h3 className="min-w-0 truncate text-base font-semibold text-foreground">
                    {displayTitle}
                  </h3>
                  {timerState?.expired && (
                    <Badge variant="secondary" className="shrink-0 rounded-md">
                      Read-only
                    </Badge>
                  )}
                </div>

                <div className="mt-1 text-xs text-muted-foreground md:hidden">
                  {characterCount.toLocaleString()} characters · Last edited {editedDate}
                </div>

                {timerState && (
                  <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground md:hidden">
                    <CalendarClock className="h-3.5 w-3.5 shrink-0 text-accent" />
                    <span className="font-medium text-foreground">{timerState.value}</span>
                    <span>{timerState.detail}</span>
                  </div>
                )}
              </div>
            </div>

            <div className="hidden text-sm text-muted-foreground md:block">
              {characterCount.toLocaleString()} chars
            </div>
            <div className="hidden text-sm text-muted-foreground md:block">
              {editedDate}
            </div>
            <div aria-hidden="true" />
          </Link>

          <div className="absolute right-1 top-1/2 -translate-y-1/2">
            {deleteButton}
          </div>
        </div>

        {deleteDialog}
      </>
    );
  }

  return (
    <>
      <div className="relative h-full">
        <Link href={documentHref} className="group block h-full rounded-xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          <Card className="flex h-[20rem] cursor-pointer overflow-hidden transition-colors group-hover:border-foreground/30">
            <div className="flex h-full min-w-0 flex-1 flex-col p-0">
              <div className="relative h-[14rem] w-full overflow-hidden border-b border-border/70 bg-background">
                <div className="absolute inset-0 px-5 py-5">
                  {previewText && (
                    <p className="line-clamp-[12] whitespace-pre-wrap text-[11px] leading-[1.45] text-muted-foreground/80">
                      {previewText}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-1 items-center gap-3 p-4 pr-14">
                <FileText className="h-5 w-5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="flex min-w-0 items-center gap-2">
                    <h3 className="min-w-0 flex-1 truncate text-base font-semibold text-foreground">
                      {displayTitle}
                    </h3>
                    {timerState?.expired && (
                      <Badge variant="secondary" className="shrink-0 rounded-md">
                        Read-only
                      </Badge>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Last edited {editedDate} · {characterCount.toLocaleString()} characters
                  </div>

                  {timerState && (
                    <div className="mt-1.5 flex items-center gap-2 text-xs text-muted-foreground">
                      <CalendarClock className="h-3.5 w-3.5 shrink-0 text-accent" />
                      <span className="font-medium text-foreground">{timerState.value}</span>
                      <span>{timerState.detail}</span>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </Card>
        </Link>

        <div className="absolute bottom-4 right-3">
          {deleteButton}
        </div>
      </div>

      {deleteDialog}
    </>
  );
}

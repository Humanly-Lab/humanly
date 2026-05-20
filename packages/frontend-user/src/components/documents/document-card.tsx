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
  const [isHovered, setIsHovered] = useState(false);

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
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
        className="block h-full"
      >
        <Card className="transition-shadow hover:shadow-md cursor-pointer h-full flex flex-col border-border/40">
          <CardContent className="p-5 flex flex-col gap-3 flex-1">
            {/* Title */}
            <div className="flex items-start justify-between gap-2">
              <h3 className="min-w-0 text-lg font-semibold line-clamp-2 text-foreground">
                {displayTitle}
              </h3>
              {timerState?.expired && (
                <Badge variant="secondary" className="shrink-0">
                  Read-only
                </Badge>
              )}
            </div>

            {/* Metadata row */}
            <div className="text-xs text-muted-foreground">
              Last edited {formatDate(document.updatedAt || document.createdAt)} · {characterCount.toLocaleString()} characters
            </div>

            {timerState && (
              <div className="flex items-start gap-2 rounded-md border bg-muted/20 p-3 text-sm">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0">
                  <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
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

            {/* Spacer */}
            <div className="flex-1" />

            {/* Hover actions - always reserve space */}
            <div className={`flex items-center justify-end gap-2 mt-2 h-8 transition-opacity ${isHovered ? 'opacity-100' : 'opacity-0'}`}>
              <Button
                variant="ghost"
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

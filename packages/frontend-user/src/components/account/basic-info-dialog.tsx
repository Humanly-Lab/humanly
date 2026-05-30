'use client';

import { FormEvent, useEffect, useState } from 'react';
import { AlertCircle, Loader2, UserRound } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/stores/auth-store';

interface BasicInfoDialogProps {
  open: boolean;
  mode: 'complete' | 'edit';
  onOpenChange: (open: boolean) => void;
}

export function BasicInfoDialog({ open, mode, onOpenChange }: BasicInfoDialogProps) {
  const { user, updateUser } = useAuthStore();
  const [name, setName] = useState(user?.name?.trim() || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isCompletionMode = mode === 'complete';

  useEffect(() => {
    if (open) {
      setName(user?.name?.trim() || '');
      setError(null);
    }
  }, [open, user?.name]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (isCompletionMode && !user?.profileCompleted && !nextOpen) {
      return;
    }
    onOpenChange(nextOpen);
  };

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedName = name.trim();

    if (!trimmedName) {
      setError('Name is required.');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);
      await updateUser({ name: trimmedName });
      onOpenChange(false);
    } catch (err: any) {
      setError(err?.message || 'Failed to save basic info.');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="rounded-[8px] sm:max-w-[460px]"
        onEscapeKeyDown={(event) => {
          if (isCompletionMode && !user?.profileCompleted) {
            event.preventDefault();
          }
        }}
        onInteractOutside={(event) => {
          if (isCompletionMode && !user?.profileCompleted) {
            event.preventDefault();
          }
        }}
      >
        <DialogHeader>
          <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-[#dde6df] text-[#4a655a]">
            <UserRound className="h-5 w-5" />
          </div>
          <DialogTitle>
            {isCompletionMode ? 'Finish your basic info' : 'My Account'}
          </DialogTitle>
          <DialogDescription>
            {isCompletionMode
              ? 'Add the display name that should appear in your Humanly workspace.'
              : 'Update the basic info shown in your workspace and certificates.'}
          </DialogDescription>
        </DialogHeader>

        <form className="space-y-4" onSubmit={handleSubmit}>
          {error ? (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Could not save</AlertTitle>
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          <div className="space-y-2">
            <Label htmlFor="basic-info-name">Display name</Label>
            <Input
              id="basic-info-name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Your name"
              className="h-11 rounded-[8px]"
              disabled={isSaving}
              autoFocus
            />
          </div>

          <DialogFooter className="gap-3 sm:gap-2 sm:space-x-0">
            {!isCompletionMode ? (
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => onOpenChange(false)}
                disabled={isSaving}
              >
                Cancel
              </Button>
            ) : null}
            <Button type="submit" className="rounded-full font-bold" disabled={isSaving}>
              {isSaving ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Saving...
                </>
              ) : (
                'Save basic info'
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

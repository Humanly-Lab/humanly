'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { AlertCircle, Loader2, Trash2, UserRound } from 'lucide-react';
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
  onOpenChange: (open: boolean) => void;
}

export function BasicInfoDialog({ open, onOpenChange }: BasicInfoDialogProps) {
  const router = useRouter();
  const { user, updateUser, deleteAccount } = useAuthStore();
  const [name, setName] = useState(user?.name?.trim() || '');
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deleteConfirmation, setDeleteConfirmation] = useState('');
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setName(user?.name?.trim() || '');
      setError(null);
      setDeleteError(null);
      setDeleteConfirmation('');
    }
  }, [open, user?.name]);

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
      setError(err?.message || 'Failed to save.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (deleteConfirmation !== 'DELETE') {
      setDeleteError('Type DELETE to confirm account deletion.');
      return;
    }

    try {
      setIsDeleting(true);
      setDeleteError(null);
      await deleteAccount();
      setDeleteDialogOpen(false);
      onOpenChange(false);
      router.push('/login');
    } catch (err: any) {
      setDeleteError(err?.message || 'Failed to delete account.');
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="rounded-[8px] sm:max-w-[460px]">
          <DialogHeader>
            <div className="mb-2 grid h-10 w-10 place-items-center rounded-full bg-[#dde6df] text-[#4a655a]">
              <UserRound className="h-5 w-5" />
            </div>
            <DialogTitle>My Account</DialogTitle>
            <DialogDescription>
              Update the basic info shown in your workspace and certificates.
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

            <div className="space-y-1.5">
              <p className="text-sm font-medium text-foreground">Email address</p>
              <p className="rounded-[8px] border border-border/70 bg-muted/35 px-3 py-2.5 text-sm text-muted-foreground">
                {user?.email || 'No email available'}
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="basic-info-name">Display name</Label>
              <Input
                id="basic-info-name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Your name"
                className="h-11 rounded-[8px]"
                disabled={isSaving || isDeleting}
                autoFocus
              />
            </div>

            <div className="rounded-[8px] border border-destructive/25 bg-destructive/5 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="space-y-1">
                  <h3 className="text-sm font-semibold text-foreground">Delete account</h3>
                  <p className="text-sm leading-5 text-muted-foreground">
                    Permanently delete your account, documents, logs, certificates, and sessions.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="destructive"
                  className="shrink-0 rounded-full"
                  onClick={() => {
                    setDeleteError(null);
                    setDeleteConfirmation('');
                    setDeleteDialogOpen(true);
                  }}
                  disabled={isSaving || isDeleting}
                >
                  <Trash2 className="mr-2 h-4 w-4" />
                  Delete my account
                </Button>
              </div>
            </div>

            <DialogFooter className="gap-3 sm:gap-2 sm:space-x-0">
              <Button
                type="button"
                variant="outline"
                className="rounded-full"
                onClick={() => onOpenChange(false)}
                disabled={isSaving || isDeleting}
              >
                Cancel
              </Button>
              <Button type="submit" className="rounded-full font-bold" disabled={isSaving || isDeleting}>
                {isSaving ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save'
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent className="rounded-[8px] sm:max-w-[460px]">
          <DialogHeader>
            <DialogTitle>Delete Account?</DialogTitle>
            <DialogDescription>
              This permanently deletes your Humanly account and all account-owned writing data.
              This action cannot be undone.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3">
            {deleteError ? (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Could not delete account</AlertTitle>
                <AlertDescription>{deleteError}</AlertDescription>
              </Alert>
            ) : null}

            <div className="space-y-2">
              <Label htmlFor="delete-account-confirmation">Type DELETE to confirm</Label>
              <Input
                id="delete-account-confirmation"
                value={deleteConfirmation}
                onChange={(event) => setDeleteConfirmation(event.target.value)}
                disabled={isDeleting}
                autoComplete="off"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setDeleteDialogOpen(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              onClick={handleDeleteAccount}
              disabled={isDeleting || deleteConfirmation !== 'DELETE'}
            >
              {isDeleting ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Deleting...
                </>
              ) : (
                'Delete account'
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

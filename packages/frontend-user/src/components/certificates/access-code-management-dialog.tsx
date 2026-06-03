'use client';

import { useState } from 'react';
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
import { Lock, Unlock } from 'lucide-react';

interface AccessCodeManagementDialogProps {
  open: boolean;
  onClose: () => void;
  onUpdate: (accessCode: string | null) => Promise<void>;
  isProtected: boolean;
  isUpdating?: boolean;
}

export function AccessCodeManagementDialog({
  open,
  onClose,
  onUpdate,
  isProtected,
  isUpdating = false,
}: AccessCodeManagementDialogProps) {
  const [accessCode, setAccessCode] = useState('');
  const [confirmAccessCode, setConfirmAccessCode] = useState('');
  const [error, setError] = useState<string | undefined>(undefined);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(undefined);

    if (accessCode !== confirmAccessCode) {
      setError('Access codes do not match');
      return;
    }

    if (accessCode && accessCode.length < 4) {
      setError('Access code must be at least 4 characters');
      return;
    }

    try {
      await onUpdate(accessCode || null);
      setAccessCode('');
      setConfirmAccessCode('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to update access code');
    }
  };

  const handleRemove = async () => {
    try {
      await onUpdate(null);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to remove access code');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[425px]">
        <form onSubmit={handleSubmit}>
          <DialogHeader>
            <div className="flex items-center gap-2">
              {isProtected ? (
                <Lock className="h-5 w-5 text-yellow-600" />
              ) : (
                <Unlock className="h-5 w-5 text-primary" />
              )}
              <DialogTitle>
                {isProtected ? 'Update Access Code' : 'Set Access Code'}
              </DialogTitle>
            </div>
            <DialogDescription>
              {isProtected
                ? 'Change or remove the access code for this certificate.'
                : 'Protect this certificate with an access code. Public viewers will need to enter this code to view the certificate.'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="accessCode">
                {isProtected ? 'New Access Code' : 'Access Code'}
              </Label>
              <Input
                id="accessCode"
                type="password"
                placeholder="Enter access code (min 4 characters)"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                disabled={isUpdating}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="confirmAccessCode">Confirm Access Code</Label>
              <Input
                id="confirmAccessCode"
                type="password"
                placeholder="Re-enter access code"
                value={confirmAccessCode}
                onChange={(e) => setConfirmAccessCode(e.target.value)}
                disabled={isUpdating}
              />
            </div>

            {error && (
              <div className="text-sm text-destructive bg-destructive/10 p-3 rounded-md">
                {error}
              </div>
            )}

            {isProtected && (
              <div className="text-xs text-muted-foreground bg-muted p-3 rounded-md">
                <strong>Note:</strong> Leave fields empty and click &quot;Remove Access Code&quot; to make this certificate publicly viewable without a code.
              </div>
            )}
          </div>

          <DialogFooter className="gap-2">
            {isProtected && (
              <Button
                type="button"
                variant="destructive"
                onClick={handleRemove}
                disabled={isUpdating}
              >
                {isUpdating ? 'Removing...' : 'Remove Access Code'}
              </Button>
            )}
            <Button
              type="submit"
              disabled={isUpdating || !accessCode.trim() || !confirmAccessCode.trim()}
            >
              {isUpdating ? (
                <>
                  <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent mr-2" />
                  Updating...
                </>
              ) : (
                <>
                  <Lock className="h-4 w-4 mr-2" />
                  {isProtected ? 'Update Code' : 'Set Code'}
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

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
import { Lock } from 'lucide-react';

interface AccessCodeDialogProps {
  open: boolean;
  onVerify: (code: string) => void;
  isVerifying?: boolean;
  error?: string;
}

export function AccessCodeDialog({
  open,
  onVerify,
  isVerifying = false,
  error,
}: AccessCodeDialogProps) {
  const [accessCode, setAccessCode] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (accessCode.trim()) {
      onVerify(accessCode);
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-[425px] mx-auto" onInteractOutside={(e) => e.preventDefault()}>
        <form onSubmit={handleSubmit}>
          <DialogHeader className="space-y-2 sm:space-y-3">
            <div className="flex items-center gap-2">
              <Lock className="h-4 w-4 sm:h-5 sm:w-5 text-primary flex-shrink-0" />
              <DialogTitle className="text-base sm:text-lg">Protected Certificate</DialogTitle>
            </div>
            <DialogDescription className="text-xs sm:text-sm">
              This certificate is password protected. Please enter the access code to view it.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 sm:space-y-4 py-3 sm:py-4">
            <div className="space-y-1.5 sm:space-y-2">
              <Label htmlFor="accessCode" className="text-xs sm:text-sm">Access Code</Label>
              <Input
                id="accessCode"
                type="password"
                placeholder="Enter access code"
                value={accessCode}
                onChange={(e) => setAccessCode(e.target.value)}
                disabled={isVerifying}
                autoFocus
                className="h-9 sm:h-10 text-sm sm:text-base"
              />
            </div>

            {error && (
              <div className="text-xs sm:text-sm text-destructive bg-destructive/10 p-2 sm:p-3 rounded-md">
                {error}
              </div>
            )}
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              type="submit"
              disabled={isVerifying || !accessCode.trim()}
              className="w-full sm:w-auto h-9 sm:h-10 text-sm sm:text-base"
            >
              {isVerifying ? (
                <>
                  <span className="inline-block h-3 w-3 sm:h-4 sm:w-4 animate-spin rounded-full border-2 border-solid border-current border-r-transparent mr-2" />
                  Unlocking...
                </>
              ) : (
                <>
                  <Lock className="h-3 w-3 sm:h-4 sm:w-4 mr-2" />
                  Unlock
                </>
              )}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

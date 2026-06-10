'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { XCircle } from 'lucide-react';
import type { AIAuthorshipStats, CertificateSeal, CertificateSealStatus } from '@humanly/shared';
import { AccessCodeDialog } from '@/components/certificates/access-code-dialog';
import { CertificateEvidenceView, type CertificateEvidenceRecord } from '@/components/certificates/certificate-evidence-view';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface PublicCertificateResult {
  valid: boolean;
  certificate?: CertificateEvidenceRecord & {
    plainTextSnapshot?: string;
    documentSnapshot?: any;
  };
  aiAuthorshipStats?: AIAuthorshipStats;
  seal?: CertificateSeal;
  sealStatus?: CertificateSealStatus;
  integrityMessage?: string;
  verifiedAt: string;
  message: string;
}

export default function CertificatePage() {
  const params = useParams();
  const token = params.token as string;
  const [certificateResult, setCertificateResult] = useState<PublicCertificateResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAccessDialog, setShowAccessDialog] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [accessError, setAccessError] = useState<string | undefined>(undefined);

  const apiUrl =
    process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === 'production' ? '/api/v1' : 'http://localhost:3001/api/v1');

  useEffect(() => {
    async function loadCertificate() {
      try {
        setIsLoading(true);
        setError(null);

        const response = await fetch(`${apiUrl}/certificates/verify/${token}`);
        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.data?.message || 'Failed to load certificate');
        }

        if (data.data.valid && data.data.certificate?.isProtected) {
          setShowAccessDialog(true);
        } else {
          setCertificateResult(data.data);
        }
      } catch (err: any) {
        setError(err.message || 'An error occurred while loading the certificate');
        console.error('Certificate load error:', err);
      } finally {
        setIsLoading(false);
      }
    }

    if (token) {
      loadCertificate();
    }
  }, [apiUrl, token]);

  const handleVerifyAccessCode = async (accessCode: string) => {
    try {
      setIsVerifying(true);
      setAccessError(undefined);

      const response = await fetch(`${apiUrl}/certificates/verify/${token}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessCode }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setCertificateResult(data.data);
        setShowAccessDialog(false);
      } else {
        setAccessError(data.data?.message || 'Invalid access code');
      }
    } catch (err: any) {
      setAccessError(err.message || 'An error occurred while opening the certificate');
    } finally {
      setIsVerifying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
          <p className="mt-4 text-lg text-muted-foreground">Loading certificate...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="w-full max-w-2xl">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Certificate Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (showAccessDialog && !certificateResult) {
    return (
      <AccessCodeDialog
        open={showAccessDialog}
        onVerify={handleVerifyAccessCode}
        isVerifying={isVerifying}
        error={accessError}
      />
    );
  }

  if (!certificateResult?.valid || !certificateResult.certificate) {
    return null;
  }

  return (
    <div className="min-h-screen bg-background p-2 sm:p-4">
      <div className="mx-auto w-full max-w-4xl space-y-4 sm:space-y-6">
        <CertificateEvidenceView
          certificate={certificateResult.certificate}
          aiStats={certificateResult.aiAuthorshipStats}
          replayToken={token}
          seal={certificateResult.seal}
          sealStatus={certificateResult.sealStatus}
          integrityMessage={certificateResult.integrityMessage}
        />

        <div className="py-2 text-center text-xs text-muted-foreground sm:text-sm">
          <p>Powered by <span className="font-semibold">Humanly.net</span></p>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Shield, XCircle, Calendar, Type, FileText, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { AccessCodeDialog } from '@/components/certificates/access-code-dialog';
import { DocumentReplay } from '@/components/certificates/document-replay';

interface VerificationResult {
  valid: boolean;
  certificate?: {
    id: string;
    title: string;
    certificateType: string;
    generatedAt: string;
    totalCharacters: number;
    typedCharacters: number;
    pastedCharacters: number;
    totalEvents: number;
    typingEvents: number;
    pasteEvents: number;
    editingTimeSeconds: number;
    isProtected?: boolean;
    includeFullText?: boolean;
    includeEditHistory?: boolean;
    plainTextSnapshot?: string;
    documentSnapshot?: any;
    signerName?: string | null;
  };
  verifiedAt: string;
  message: string;
}

export default function VerifyPage() {
  const params = useParams();
  const token = params.token as string;
  const [verification, setVerification] = useState<VerificationResult | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAccessDialog, setShowAccessDialog] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [accessError, setAccessError] = useState<string | undefined>(undefined);

  useEffect(() => {
    async function verifyToken() {
      try {
        setIsLoading(true);
        setError(null);

        const apiUrl =
          process.env.NEXT_PUBLIC_API_URL ||
          (process.env.NODE_ENV === 'production' ? '/api/v1' : 'http://localhost:3001/api/v1');
        const response = await fetch(apiUrl + '/certificates/verify/' + token);

        if (!response.ok) {
          throw new Error('Failed to verify certificate');
        }

        const data = await response.json();

        // Check if certificate is protected
        if (data.data.valid && data.data.certificate?.isProtected) {
          setShowAccessDialog(true);
        } else {
          setVerification(data.data);
        }
      } catch (err: any) {
        setError(err.message || 'An error occurred while verifying the certificate');
        console.error('Verification error:', err);
      } finally {
        setIsLoading(false);
      }
    }

    if (token) {
      verifyToken();
    }
  }, [token]);

  const handleVerifyAccessCode = async (accessCode: string) => {
    try {
      setIsVerifying(true);
      setAccessError(undefined);

      const apiUrl =
        process.env.NEXT_PUBLIC_API_URL ||
        (process.env.NODE_ENV === 'production' ? '/api/v1' : 'http://localhost:3001/api/v1');
      const response = await fetch(apiUrl + '/certificates/verify/' + token, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ accessCode }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        setVerification(data.data);
        setShowAccessDialog(false);
      } else {
        setAccessError(data.data?.message || 'Invalid access code');
      }
    } catch (err: any) {
      setAccessError(err.message || 'An error occurred while verifying access code');
    } finally {
      setIsVerifying(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <div className="text-center">
          <div className="inline-block h-12 w-12 animate-spin rounded-full border-4 border-solid border-primary border-r-transparent" />
          <p className="mt-4 text-lg text-muted-foreground">Verifying certificate...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-4">
        <Card className="max-w-2xl w-full">
          <CardHeader className="text-center">
            <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
              <XCircle className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-2xl">Verification Error</CardTitle>
            <CardDescription>{error}</CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  // Show access dialog if certificate is protected
  if (showAccessDialog && !verification) {
    return (
      <>
        <AccessCodeDialog
          open={showAccessDialog}
          onVerify={handleVerifyAccessCode}
          isVerifying={isVerifying}
          error={accessError}
        />
      </>
    );
  }

  if (!verification) {
    return null;
  }

  // Calculate percentages based on total authorship activity (typed + pasted), not final document length
  const totalAuthored = verification.certificate
    ? verification.certificate.typedCharacters + verification.certificate.pastedCharacters
    : 0;
  const typedPercentage = totalAuthored > 0
    ? (verification.certificate!.typedCharacters / totalAuthored) * 100
    : 0;
  const pastedPercentage = totalAuthored > 0
    ? (verification.certificate!.pastedCharacters / totalAuthored) * 100
    : 0;

  // Check if content is 100% typed by human (no pasted content)
  const isFullyHumanCreated = verification.certificate
    ? verification.certificate.pastedCharacters === 0 && verification.certificate.typedCharacters > 0
    : false;

  const bgClass = verification.valid ? 'bg-background' : 'bg-background';

  return (
    <div className={'min-h-screen flex items-center justify-center p-2 sm:p-4 ' + bgClass}>
      <div className="max-w-4xl w-full space-y-4 sm:space-y-6">
        {/* Certificate Verified Status Box - Commented out for cleaner UI */}
        {/* <Card className="border-2">
          <CardHeader className="text-center">
            <div className={'mx-auto w-20 h-20 rounded-full flex items-center justify-center mb-4 ' + statusBgClass}>
              {verification.valid ? (
                <CheckCircle2 className="h-12 w-12 text-green-600" />
              ) : (
                <XCircle className="h-12 w-12 text-red-600" />
              )}
            </div>
            <CardTitle className="text-3xl mb-2">
              {verification.valid ? 'Certificate Verified' : 'Invalid Certificate'}
            </CardTitle>
            <CardDescription className="text-base">
              {verification.message}
            </CardDescription>
            <div className="flex items-center justify-center gap-2 mt-4 text-sm text-muted-foreground">
              <Calendar className="h-4 w-4" />
              Verified on {format(new Date(verification.verifiedAt), 'MMMM dd, yyyy')}
            </div>
          </CardHeader>
        </Card> */}

        {verification.valid && verification.certificate && (
          <>
            <Card>
              <CardHeader className="pb-3 sm:pb-6">
                <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2 mb-2">
                      <CardTitle className="text-xl sm:text-2xl break-words">{verification.certificate.title}</CardTitle>
                      {isFullyHumanCreated && (
                        <Badge
                          variant="outline"
                          className="border-[#c8d4c8] bg-[#eef3ed] px-2 py-0.5 text-xs text-[#58715f]"
                        >
                          100% Human Created
                        </Badge>
                      )}
                    </div>
                    {verification.certificate.signerName && (
                      <p className="text-xs sm:text-sm text-muted-foreground mt-1">
                        By: {verification.certificate.signerName}
                      </p>
                    )}
                    <CardDescription className="mt-2 flex items-center gap-2 text-xs sm:text-sm break-all">
                      <Shield className="h-3 w-3 sm:h-4 sm:w-4 flex-shrink-0" />
                      <span className="truncate">Certificate ID: {verification.certificate.id}</span>
                    </CardDescription>
                  </div>
                  <Badge
                    variant={verification.certificate.certificateType === 'full_authorship' ? 'default' : 'secondary'}
                    className="text-sm sm:text-base px-3 py-1 sm:px-4 sm:py-2 self-start"
                  >
                    {verification.certificate.certificateType === 'full_authorship' ? 'Full' : 'Partial'}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="pt-0">
                <div className="flex items-center gap-2 text-xs sm:text-sm text-muted-foreground">
                  <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
                  Generated on {format(new Date(verification.certificate.generatedAt), 'MMMM dd, yyyy')}
                </div>
              </CardContent>
            </Card>

            {/* Certified Document Section - Commented out for cleaner UI */}
            {/* {verification.certificate.includeFullText && (verification.certificate.documentSnapshot || verification.certificate.plainTextSnapshot) && (
              <Card className="border-2 border-primary/20">
                <CardHeader className="pb-3 sm:pb-6">
                  <CardTitle className="text-xl sm:text-2xl">Certified Document</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">This is the complete content that was certified</CardDescription>
                </CardHeader>
                <CardContent>
                  {verification.certificate.documentSnapshot ? (
                    <DocumentViewer content={verification.certificate.documentSnapshot} />
                  ) : (
                    <div className="prose prose-sm max-w-none">
                      <div className="whitespace-pre-wrap p-3 sm:p-4 bg-muted/30 rounded-lg border text-xs sm:text-sm">
                        {verification.certificate.plainTextSnapshot!.length > 10000
                          ? verification.certificate.plainTextSnapshot!.substring(0, 10000) + '\n\n[Content truncated for display - full content is certified]'
                          : verification.certificate.plainTextSnapshot}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )} */}

            {verification.certificate.includeEditHistory && (
              <Card>
                <CardHeader className="pb-3 sm:pb-6">
                  <CardTitle className="text-xl sm:text-2xl">Live Document</CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Watch how this document was created in real-time</CardDescription>
                </CardHeader>
                <CardContent>
                  <DocumentReplay token={token} />
                </CardContent>
              </Card>
            )}

            <Card>
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="text-lg sm:text-xl">Authorship Statistics</CardTitle>
                <CardDescription className="text-xs sm:text-sm">Detailed breakdown of document authorship</CardDescription>
              </CardHeader>
              <CardContent className="space-y-3 sm:space-y-4">
                <div className="grid grid-cols-2 gap-3 sm:gap-6">
                  <div className="space-y-1">
                    <p className="text-xs sm:text-sm text-muted-foreground">Final Document Length</p>
                    <p className="text-2xl sm:text-3xl font-bold">{verification.certificate.totalCharacters.toLocaleString()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs sm:text-sm text-muted-foreground">Total Events</p>
                    <p className="text-2xl sm:text-3xl font-bold">{verification.certificate.totalEvents.toLocaleString()}</p>
                  </div>
                </div>

                <Separator />

                <div className="space-y-2 sm:space-y-3">
                  <p className="text-xs sm:text-sm text-muted-foreground">
                    Authorship Composition (cumulative throughout editing)
                  </p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 sm:gap-6">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Type className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                        <p className="text-xs sm:text-sm text-muted-foreground">Characters Typed</p>
                      </div>
                      <p className="text-xl sm:text-2xl font-semibold">
                        {verification.certificate.typedCharacters.toLocaleString()}
                        <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-2">
                          ({typedPercentage.toFixed(1)}%)
                        </span>
                      </p>
                      <div className="h-2 sm:h-3 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all"
                          style={{ width: typedPercentage + '%' }}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <FileText className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                        <p className="text-xs sm:text-sm text-muted-foreground">Characters Pasted</p>
                      </div>
                      <p className="text-xl sm:text-2xl font-semibold">
                        {verification.certificate.pastedCharacters.toLocaleString()}
                        <span className="text-xs sm:text-sm font-normal text-muted-foreground ml-2">
                          ({pastedPercentage.toFixed(1)}%)
                        </span>
                      </p>
                      <div className="h-2 sm:h-3 bg-secondary rounded-full overflow-hidden">
                        <div
                          className="h-full bg-orange-500 transition-all"
                          style={{ width: pastedPercentage + '%' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <Separator />

                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 sm:gap-4">
                  <div className="space-y-1">
                    <p className="text-xs sm:text-sm text-muted-foreground">Typing Events</p>
                    <p className="text-lg sm:text-xl font-semibold">{verification.certificate.typingEvents.toLocaleString()}</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-xs sm:text-sm text-muted-foreground">Paste Events</p>
                    <p className="text-lg sm:text-xl font-semibold">{verification.certificate.pasteEvents.toLocaleString()}</p>
                  </div>
                  <div className="space-y-1 col-span-2 sm:col-span-1">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3 sm:h-4 sm:w-4 text-muted-foreground" />
                      <p className="text-xs sm:text-sm text-muted-foreground">Total Events</p>
                    </div>
                    <p className="text-lg sm:text-xl font-semibold">{verification.certificate.totalEvents.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="bg-muted/50">
              <CardHeader className="pb-3 sm:pb-6">
                <CardTitle className="text-base sm:text-lg">What does this mean?</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs sm:text-sm">
                <p>
                  This certificate has been cryptographically verified and confirms the authorship details shown above.
                  The certificate was generated using keystroke tracking technology that recorded every typing action during
                  the creation of this document.
                </p>
                <p className="text-muted-foreground">
                  The verification ensures that this certificate has not been tampered with and accurately represents
                  the original authorship data at the time of generation.
                </p>
              </CardContent>
            </Card>
          </>
        )}

        <div className="text-center text-xs sm:text-sm text-muted-foreground py-2">
          <p>Powered by <span className="font-semibold">Humanly.net</span></p>
        </div>
      </div>
    </div>
  );
}

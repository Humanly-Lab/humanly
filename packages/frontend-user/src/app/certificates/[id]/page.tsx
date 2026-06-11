'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCertificate } from '@/hooks/use-certificates';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  ArrowLeft,
  FileText,
  Copy,
  Check,
  Share2,
  Lock,
  Settings,
  Edit2,
  X,
  Trash2,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import QRCode from 'qrcode';
import { Input } from '@/components/ui/input';
import { copyTextToClipboard } from '@/lib/clipboard';
import { TokenManager } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { isGuestUserEmail } from '@/components/navigation/user-display';
import { CertificateEvidenceView } from '@/components/certificates/certificate-evidence-view';

function usePublicCertificateToken(certificateId: string) {
  const previousAccessTokenRef = useRef<string | null | undefined>(undefined);

  useLayoutEffect(() => {
    const publicCertificateAccessToken = TokenManager.getPublicCertificateAccessToken(certificateId);
    if (!publicCertificateAccessToken) return undefined;

    const currentAccessToken = TokenManager.getAccessToken();
    if (currentAccessToken === publicCertificateAccessToken) return undefined;

    previousAccessTokenRef.current = currentAccessToken;
    TokenManager.setAccessToken(publicCertificateAccessToken);

    return () => {
      if (TokenManager.getAccessToken() !== publicCertificateAccessToken) {
        previousAccessTokenRef.current = undefined;
        return;
      }

      const previousAccessToken = previousAccessTokenRef.current;
      if (previousAccessToken) {
        TokenManager.setAccessToken(previousAccessToken);
      } else {
        TokenManager.clearAccessToken();
      }
      previousAccessTokenRef.current = undefined;
    };
  }, [certificateId]);
}

export default function CertificateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const certificateId = params.id as string;
  const { user } = useAuthStore();
  usePublicCertificateToken(certificateId);
  const {
    certificate,
    aiStats,
    seal,
    sealStatus,
    integrityMessage,
    isLoading,
    isLoadingAiStats,
    error,
    updateAccessCode,
    updateDisplayOptions,
  } = useCertificate(certificateId);
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isEditingAccessCode, setIsEditingAccessCode] = useState(false);
  const [editedAccessCode, setEditedAccessCode] = useState('');
  const [isUpdatingAccessCode, setIsUpdatingAccessCode] = useState(false);
  const [isUpdatingDisplay, setIsUpdatingDisplay] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const isGuestCertificateView = isGuestUserEmail(user?.email)
    || Boolean(TokenManager.getPublicCertificateAccessToken(certificateId));

  const generateAccessCode = () => {
    const fallbackCode = () => Math.floor(Math.random() * 10000);

    if (typeof window !== 'undefined' && window.crypto?.getRandomValues) {
      const values = new Uint32Array(1);
      window.crypto.getRandomValues(values);
      return String(values[0] % 10000).padStart(4, '0');
    }

    return String(fallbackCode()).padStart(4, '0');
  };

  useEffect(() => {
    if (certificate) {
      const verifyUrl = `${window.location.origin}/verify/${certificate.verificationToken}`;
      QRCode.toDataURL(verifyUrl, {
        width: 200,
        margin: 2,
        color: {
          dark: '#000000',
          light: '#ffffff',
        },
      })
        .then((dataURL) => setQrCodeDataURL(dataURL))
        .catch((err) => console.error('Error generating QR code:', err));
    }
  }, [certificate]);

  const showCopyUnavailableToast = (label: string) => {
    toast({
      title: 'Copy unavailable',
      description: `${label} could not be copied automatically. Select it manually instead.`,
      variant: 'destructive',
    });
  };

  const handleCopyVerificationToken = async () => {
    if (certificate) {
      const didCopy = await copyTextToClipboard(certificate.verificationToken);
      if (didCopy) {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        toast({
          title: 'Copied',
          description: 'Certificate token copied to clipboard',
        });
      } else {
        showCopyUnavailableToast('Certificate token');
      }
    }
  };

  const handleShareVerificationLink = async () => {
    if (certificate) {
      const verifyUrl = `${window.location.origin}/verify/${certificate.verificationToken}`;
      const didCopy = await copyTextToClipboard(verifyUrl);
      if (didCopy) {
        toast({
          title: 'Link copied',
          description: 'Certificate link copied to clipboard',
        });
      } else {
        showCopyUnavailableToast('Certificate link');
      }
    }
  };

  const handleStartEdit = () => {
    setEditedAccessCode(certificate?.accessCode || '');
    setIsEditingAccessCode(true);
  };

  const handleCopyAccessCode = async (accessCode: string) => {
    const didCopy = await copyTextToClipboard(accessCode);
    if (didCopy) {
      toast({ title: 'Copied', description: 'Access code copied' });
    } else {
      showCopyUnavailableToast('Access code');
    }
    return didCopy;
  };

  const handleGenerateAccessCode = async () => {
    const generatedCode = generateAccessCode();

    try {
      setIsUpdatingAccessCode(true);
      await updateAccessCode(generatedCode);
      setEditedAccessCode(generatedCode);
      setIsEditingAccessCode(false);

      const didCopy = await copyTextToClipboard(generatedCode);
      toast({
        title: 'Access code generated',
        description: didCopy
          ? '4-digit code generated and copied.'
          : '4-digit code generated. Use the copy button to copy it.',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to generate access code',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingAccessCode(false);
    }
  };

  const handleRegenerateEditedAccessCode = () => {
    setEditedAccessCode(generateAccessCode());
  };

  const handleEditedAccessCodeChange = (value: string) => {
    setEditedAccessCode(value.replace(/\D/g, '').slice(0, 4));
  };

  const handleSaveAccessCode = async () => {
    if (!/^\d{4}$/.test(editedAccessCode)) {
      toast({
        title: 'Error',
        description: 'Access code must be exactly 4 digits',
        variant: 'destructive',
      });
      return;
    }

    try {
      setIsUpdatingAccessCode(true);
      await updateAccessCode(editedAccessCode);
      toast({
        title: 'Success',
        description: certificate?.isProtected 
          ? 'Access code updated successfully'
          : 'Access code set successfully',
      });
      setIsEditingAccessCode(false);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to update access code',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingAccessCode(false);
    }
  };

  const handleRemoveAccessCode = async () => {
    try {
      setIsUpdatingAccessCode(true);
      await updateAccessCode(null);
      toast({
        title: 'Success',
        description: 'Access code removed successfully',
      });
      setIsEditingAccessCode(false);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to remove access code',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingAccessCode(false);
    }
  };

  const handleCancelEdit = () => {
    setIsEditingAccessCode(false);
    setEditedAccessCode('');
  };

  const handleToggleDisplayOption = async (option: 'fullText' | 'editHistory', value: boolean) => {
    try {
      setIsUpdatingDisplay(true);
      if (option === 'fullText') {
        await updateDisplayOptions(value, certificate?.includeEditHistory);
      } else {
        await updateDisplayOptions(certificate?.includeFullText, value);
      }
      toast({
        title: 'Success',
        description: 'Display options updated successfully',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to update display options',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingDisplay(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <div className="text-center">
          <div className="inline-block h-8 w-8 animate-spin rounded-full border-4 border-solid border-current border-r-transparent align-[-0.125em] motion-reduce:animate-[spin_1.5s_linear_infinite]" />
          <p className="mt-4 text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  if (error || !certificate) {
    return (
      <div className="humanly-page-narrow">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <h2 className="text-lg font-semibold text-destructive">Error</h2>
          <p className="mt-2 text-sm">{error || 'Certificate not found'}</p>
          {!isGuestCertificateView && (
            <Button
              onClick={() => router.push('/certificates')}
              variant="outline"
              className="mt-4"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to Certificates
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl px-5 pb-6 pt-5 sm:px-8 lg:px-10">
      <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {!isGuestCertificateView && (
          <Button
            onClick={() => router.push('/certificates')}
            variant="outline"
            size="sm"
            className="w-fit"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Certificates
          </Button>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() => router.push(`/logs/${certificate.documentId}?returnTo=certificate&certificateId=${certificate.id}`)}
            variant="outline"
            size="sm"
            className="min-w-0"
          >
            <FileText className="mr-2 h-4 w-4" />
            View Logs
          </Button>
          <Button onClick={handleShareVerificationLink} variant="outline" size="sm" className="min-w-0">
            <Share2 className="mr-2 h-4 w-4" />
            Share
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <CertificateEvidenceView
          certificate={certificate}
          aiStats={aiStats}
          isLoadingAiStats={isLoadingAiStats}
          replayToken={certificate.verificationToken}
          replayAccessCode={certificate.accessCode || undefined}
          seal={seal}
          sealStatus={sealStatus}
          integrityMessage={integrityMessage}
        />

        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center justify-between px-5 py-4 text-left">
                <div>
                  <p className="font-medium">More details</p>
                  <p className="text-sm text-muted-foreground">Certificate sharing, access, display, and identifiers.</p>
                </div>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Separator />
              <CardContent className="grid gap-5 p-5 !pt-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                <div className="grid gap-4 rounded-lg border border-border/70 bg-muted/20 p-4 lg:grid-cols-[minmax(190px,0.8fr)_minmax(280px,1.2fr)]">
                  <div className="space-y-3">
                    <div>
                      <h3 className="text-sm font-medium">Share Certificate</h3>
                      <p className="text-xs text-muted-foreground">Share or scan this certificate link.</p>
                    </div>
                    <div className="flex flex-col items-center">
                      {qrCodeDataURL ? (
                        <img
                          src={qrCodeDataURL}
                          alt="Certificate QR Code"
                          className="h-36 w-36 bg-white"
                        />
                      ) : (
                        <div className="h-36 w-36 animate-pulse rounded bg-muted" />
                      )}
                      <Button
                        onClick={handleShareVerificationLink}
                        variant="outline"
                        size="sm"
                        className="mt-3 w-full max-w-56 bg-background"
                      >
                        <Share2 className="mr-2 h-4 w-4" />
                        Copy Certificate Link
                      </Button>
                    </div>
                  </div>

                  <div className="space-y-8">
                    <div className="space-y-2">
                      <div className="flex items-center gap-2">
                        <Lock className={`h-4 w-4 ${certificate.isProtected ? 'text-[#b9774f]' : 'text-muted-foreground'}`} />
                        <h3 className="text-sm font-medium">Access Protection</h3>
                      </div>

                      {!isEditingAccessCode ? (
                        <>
                          {certificate.isProtected && certificate.accessCode ? (
                            <div className="flex items-center gap-1">
                              <div className="min-w-0 flex-1 truncate rounded-lg border border-border/60 bg-background p-2 text-xs">
                                {certificate.accessCode}
                              </div>
                              <Button
                                onClick={() => handleCopyAccessCode(certificate.accessCode!)}
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                aria-label="Copy access code"
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <Button
                                onClick={handleStartEdit}
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 p-0"
                                aria-label="Edit access code"
                              >
                                <Edit2 className="h-3 w-3" />
                              </Button>
                              <Button
                                onClick={handleRemoveAccessCode}
                                variant="ghost"
                                size="sm"
                                disabled={isUpdatingAccessCode}
                                className="h-8 w-8 p-0"
                                aria-label="Remove access code"
                              >
                                <Trash2 className="h-3 w-3 text-destructive" />
                              </Button>
                            </div>
                          ) : (
                            <Button
                              onClick={handleGenerateAccessCode}
                              variant="outline"
                              size="sm"
                              className="w-full"
                              disabled={isUpdatingAccessCode}
                            >
                              <RefreshCw className="mr-2 h-3 w-3" />
                              Generate 4-digit Code
                            </Button>
                          )}
                        </>
                      ) : (
                        <div className="flex items-center gap-1">
                          <Input
                            type="text"
                            inputMode="numeric"
                            maxLength={4}
                            placeholder="4-digit code"
                            value={editedAccessCode}
                            onChange={(e) => handleEditedAccessCodeChange(e.target.value)}
                            disabled={isUpdatingAccessCode}
                            className="h-8 flex-1 text-xs"
                            autoFocus
                          />
                          <Button
                            onClick={handleRegenerateEditedAccessCode}
                            size="sm"
                            variant="outline"
                            disabled={isUpdatingAccessCode}
                            className="h-8 w-8 p-0"
                            aria-label="Generate new access code"
                          >
                            <RefreshCw className="h-3 w-3" />
                          </Button>
                          <Button
                            onClick={() => handleCopyAccessCode(editedAccessCode)}
                            size="sm"
                            variant="outline"
                            disabled={isUpdatingAccessCode || editedAccessCode.trim().length !== 4}
                            className="h-8 w-8 p-0"
                            aria-label="Copy access code"
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                          <Button
                            onClick={handleSaveAccessCode}
                            size="sm"
                            disabled={isUpdatingAccessCode || !/^\d{4}$/.test(editedAccessCode)}
                            className="h-8 w-8 p-0"
                            aria-label="Save access code"
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                          <Button
                            onClick={handleCancelEdit}
                            size="sm"
                            variant="outline"
                            disabled={isUpdatingAccessCode}
                            className="h-8 w-8 p-0"
                            aria-label="Cancel access code edit"
                          >
                            <X className="h-3 w-3" />
                          </Button>
                        </div>
                      )}
                    </div>

                    <Separator />

                    <div className="space-y-2.5">
                      <div className="flex items-center gap-2">
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        <h3 className="text-sm font-medium">Public Display</h3>
                      </div>
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="includeFullText" className="cursor-pointer text-xs">
                            Show full text
                          </Label>
                          <Switch
                            id="includeFullText"
                            checked={certificate.includeFullText}
                            onCheckedChange={(checked) => handleToggleDisplayOption('fullText', checked)}
                            disabled={isUpdatingDisplay}
                          />
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <Label htmlFor="includeEditHistory" className="cursor-pointer text-xs">
                            Show edit history
                          </Label>
                          <Switch
                            id="includeEditHistory"
                            checked={certificate.includeEditHistory}
                            onCheckedChange={(checked) => handleToggleDisplayOption('editHistory', checked)}
                            disabled={isUpdatingDisplay}
                          />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="space-y-3 rounded-lg border border-border/70 bg-muted/20 p-4 text-xs">
                  <div>
                    <h3 className="text-sm font-medium">Identifiers</h3>
                    <p className="text-xs text-muted-foreground">Technical identifiers for audit and support.</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Certificate ID</p>
                    <p className="truncate">{certificate.id}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Document ID</p>
                    <p className="truncate">{certificate.documentId}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Certificate Token</p>
                    <div className="mt-1 max-h-20 overflow-y-auto rounded-lg border border-border/60 bg-background p-2 text-[10px] break-all">
                      {certificate.verificationToken}
                    </div>
                    <Button
                      onClick={handleCopyVerificationToken}
                      variant="outline"
                      size="sm"
                      className="mt-4 w-full"
                    >
                      {copied ? (
                        <>
                          <Check className="mr-2 h-4 w-4" />
                          Copied
                        </>
                      ) : (
                        <>
                          <Copy className="mr-2 h-4 w-4" />
                          Copy Token
                        </>
                      )}
                    </Button>
                  </div>
                </div>
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </div>
  );
}

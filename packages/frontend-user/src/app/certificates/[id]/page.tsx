'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCertificate } from '@/hooks/use-certificates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
  FileJson,
  FileText,
  Calendar,
  Award,
  Copy,
  Check,
  Share2,
  Lock,
  Settings,
  Edit2,
  X,
  Trash2,
  Bot,
  MessageSquare,
  Wand2,
  ChevronDown,
  RefreshCw,
} from 'lucide-react';
import { format } from 'date-fns';
import QRCode from 'qrcode';
import { Input } from '@/components/ui/input';
import { copyTextToClipboard } from '@/lib/clipboard';
import { getApiUrl, TokenManager } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { isGuestUserEmail } from '@/components/navigation/user-display';

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
  const { certificate, aiStats, isLoading, isLoadingAiStats, error, downloadJSON, updateAccessCode, updateDisplayOptions } = useCertificate(certificateId);
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

  const showDownloadToast = (label: string, outcome: 'saved' | 'downloaded' | 'canceled') => {
    if (outcome === 'canceled') {
      return;
    }

    if (outcome === 'saved') {
      toast({
        title: 'Saved',
        description: `${label} saved to the selected location`,
      });
      return;
    }

    toast({
      title: 'Download started',
      description: `${label} was sent to your browser's default downloads folder.`,
    });
  };

  const handleDownloadJSON = async () => {
    try {
      const outcome = await downloadJSON();
      showDownloadToast('JSON certificate', outcome);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to download JSON',
        variant: 'destructive',
      });
    }
  };

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
          description: 'Verification token copied to clipboard',
        });
      } else {
        showCopyUnavailableToast('Verification token');
      }
    }
  };

  const handleShareVerificationLink = async () => {
    if (certificate) {
      const verifyUrl = `${window.location.origin}/verify/${certificate.verificationToken}`;
      const didCopy = await copyTextToClipboard(verifyUrl);
      if (didCopy) {
        toast({
          title: 'Link Copied',
          description: 'Verification link copied to clipboard',
        });
      } else {
        showCopyUnavailableToast('Verification link');
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

  // Calculate percentages based on total authorship activity (typed + pasted), not final document length
  const totalAuthored = certificate.typedCharacters + certificate.pastedCharacters;
  const typedPercentage = totalAuthored > 0
    ? (certificate.typedCharacters / totalAuthored) * 100
    : 0;
  const pastedPercentage = totalAuthored > 0
    ? (certificate.pastedCharacters / totalAuthored) * 100
    : 0;
  const editingMinutes = Math.round(certificate.editingTimeSeconds / 60);
  const textImprovementTotal = aiStats?.selectionActions.total || 0;
  const aiChatTotal = aiStats?.aiQuestions.total || 0;
  const safeTitle = certificate.title
    ?.trim()
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase() || certificateId;
  const pdfPreviewUrl = getApiUrl(`/certificates/${certificateId}/pdf?disposition=inline&filename=certificate-${safeTitle}.pdf`);

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

        <div className="grid grid-cols-3 gap-2 sm:w-auto">
          <Button onClick={handleShareVerificationLink} variant="outline" size="sm" className="w-full sm:w-36">
            <Share2 className="mr-2 h-4 w-4" />
            Share Link
          </Button>
          <Button asChild size="sm" className="w-full sm:w-36">
            <a href={pdfPreviewUrl} target="_blank" rel="noopener noreferrer">
              <FileText className="mr-2 h-4 w-4" />
              Open PDF
            </a>
          </Button>
          <Button onClick={handleDownloadJSON} variant="outline" size="sm" className="w-full sm:w-36">
            <FileJson className="mr-2 h-4 w-4" />
            JSON Data
          </Button>
        </div>
      </div>

      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-4 p-4 sm:p-5">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1">
                <div className="flex items-start gap-3">
                  <Award className="mt-1 h-6 w-6 shrink-0 text-accent" />
                  <div className="min-w-0">
                    <h1 className="break-words text-2xl font-semibold tracking-normal">{certificate.title}</h1>
                    <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Generated {format(new Date(certificate.generatedAt), 'MMMM dd, yyyy')}
                    </p>
                  </div>
                </div>
              </div>
              <p className="max-w-full text-sm text-muted-foreground lg:ml-6 lg:shrink-0 lg:whitespace-nowrap lg:text-right">
                A verifiable snapshot of typing activity, pasted text, and AI assistance.
              </p>
            </div>

            <Separator />

            <div className="grid gap-2 sm:grid-cols-4">
              <div className="rounded-lg border border-border/60 bg-muted/35 p-3">
                <p className="text-xs text-muted-foreground">Typed</p>
                <p className="mt-1 text-2xl font-semibold">{typedPercentage.toFixed(0)}%</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/35 p-3">
                <p className="text-xs text-muted-foreground">Pasted</p>
                <p className="mt-1 text-2xl font-semibold">{pastedPercentage.toFixed(0)}%</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/35 p-3">
                <p className="text-xs text-muted-foreground">Final Text</p>
                <p className="mt-1 text-2xl font-semibold">{certificate.totalCharacters.toLocaleString()}</p>
              </div>
              <div className="rounded-lg border border-border/60 bg-muted/35 p-3">
                <p className="text-xs text-muted-foreground">Writing Time</p>
                <p className="mt-1 text-2xl font-semibold">{editingMinutes} min</p>
              </div>
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">Typed vs pasted composition</span>
                <span className="font-medium">
                  {certificate.typedCharacters.toLocaleString()} typed · {certificate.pastedCharacters.toLocaleString()} pasted
                </span>
              </div>
              <div className="flex h-3 overflow-hidden rounded-full bg-secondary">
                <div className="bg-primary" style={{ width: `${typedPercentage}%` }} />
                <div className="bg-[#b9774f]" style={{ width: `${pastedPercentage}%` }} />
              </div>
            </div>

          </CardContent>
        </Card>

        {(aiStats || isLoadingAiStats) && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-[#b9774f]" />
                <CardTitle className="text-lg">AI Assistance</CardTitle>
              </div>
              <CardDescription>How AI was used while writing this document.</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoadingAiStats ? (
                <div className="flex items-center justify-center py-6">
                  <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
                  <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
                </div>
              ) : aiStats ? (
                <div className="grid gap-4 lg:grid-cols-[1fr_220px]">
                  <div className="space-y-3">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <Wand2 className="h-4 w-4 text-[#b9774f]" />
                      Text Improvements
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg border border-border/60 bg-muted/35 p-3 text-center">
                        <p className="text-xs text-muted-foreground">Grammar</p>
                        <p className="text-xl font-semibold">{aiStats.selectionActions.grammarFixes}</p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/35 p-3 text-center">
                        <p className="text-xs text-muted-foreground">Improve</p>
                        <p className="text-xl font-semibold">{aiStats.selectionActions.improveWriting}</p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/35 p-3 text-center">
                        <p className="text-xs text-muted-foreground">Simplify</p>
                        <p className="text-xl font-semibold">{aiStats.selectionActions.simplify}</p>
                      </div>
                      <div className="rounded-lg border border-border/60 bg-muted/35 p-3 text-center">
                        <p className="text-xs text-muted-foreground">Formal</p>
                        <p className="text-xl font-semibold">{aiStats.selectionActions.makeFormal}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {textImprovementTotal} total · {aiStats.selectionActions.accepted} accepted · {aiStats.selectionActions.rejected} discarded
                      {textImprovementTotal > 0 ? ` · ${aiStats.selectionActions.acceptanceRate.toFixed(0)}% acceptance` : ''}
                    </p>
                  </div>

                  <div className="rounded-lg border border-border/70 bg-muted/25 p-4">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <MessageSquare className="h-4 w-4 text-[#b9774f]" />
                      AI Chat
                    </p>
                    <p className="mt-3 text-3xl font-semibold">{aiChatTotal}</p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Chat questions asked in this document.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="py-4 text-center text-sm text-muted-foreground">
                  No AI statistics available.
                </p>
              )}
            </CardContent>
          </Card>
        )}

        <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
          <Card>
            <CollapsibleTrigger asChild>
              <button className="flex w-full items-center justify-between px-5 py-4 text-left">
                <div>
                  <p className="font-medium">More details</p>
                  <p className="text-sm text-muted-foreground">Verification, access, display, and identifiers.</p>
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
                      <h3 className="text-sm font-medium">Verification</h3>
                      <p className="text-xs text-muted-foreground">Share or scan this link to verify the certificate.</p>
                    </div>
                    <div className="flex flex-col items-center">
                      {qrCodeDataURL ? (
                        <img
                          src={qrCodeDataURL}
                          alt="Verification QR Code"
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
                        Copy Link
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
                    <p className="text-muted-foreground">Verification Token</p>
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

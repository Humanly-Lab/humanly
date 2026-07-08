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
  Code2,
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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { copyTextToClipboard } from '@/lib/clipboard';
import { TokenManager } from '@/lib/api-client';
import { useAuthStore } from '@/stores/auth-store';
import { isGuestUserEmail } from '@/components/navigation/user-display';
import { CertificateEvidenceView } from '@/components/certificates/certificate-evidence-view';
import { getDemoCertificate, isDemoCertificateId } from '@/lib/demo-workspace';

function usePublicCertificateToken(certificateId: string) {
  const previousAccessTokenRef = useRef<string | null | undefined>(undefined);

  useLayoutEffect(() => {
    const publicCertificateAccessToken =
      TokenManager.getPublicCertificateAccessToken(certificateId);
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

function escapeHtmlAttribute(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export default function CertificateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const certificateId = params.id as string;
  const isDemoCertificateView = isDemoCertificateId(certificateId);
  const { user } = useAuthStore();
  usePublicCertificateToken(certificateId);
  const {
    certificate: fetchedCertificate,
    aiStats: fetchedAiStats,
    seal: fetchedSeal,
    sealStatus: fetchedSealStatus,
    integrityMessage: fetchedIntegrityMessage,
    isLoading: isFetchedCertificateLoading,
    isLoadingAiStats: isFetchedAiStatsLoading,
    error: fetchedError,
    updateAccessCode,
    updateDisplayOptions,
  } = useCertificate(certificateId, { skip: isDemoCertificateView });
  const demoCertificate = isDemoCertificateView
    ? getDemoCertificate(certificateId)
    : null;
  const certificate = isDemoCertificateView
    ? demoCertificate?.certificate || null
    : fetchedCertificate;
  const aiStats = isDemoCertificateView ? null : fetchedAiStats;
  const seal = isDemoCertificateView ? demoCertificate?.seal : fetchedSeal;
  const sealStatus = isDemoCertificateView
    ? demoCertificate?.sealStatus
    : fetchedSealStatus;
  const integrityMessage = isDemoCertificateView
    ? demoCertificate?.integrityMessage
    : fetchedIntegrityMessage;
  const isLoading = isDemoCertificateView ? false : isFetchedCertificateLoading;
  const isLoadingAiStats = isDemoCertificateView
    ? false
    : isFetchedAiStatsLoading;
  const error =
    isDemoCertificateView && !demoCertificate
      ? 'Demo certificate not found'
      : fetchedError;
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isEditingAccessCode, setIsEditingAccessCode] = useState(false);
  const [editedAccessCode, setEditedAccessCode] = useState('');
  const [isUpdatingAccessCode, setIsUpdatingAccessCode] = useState(false);
  const [isUpdatingDisplay, setIsUpdatingDisplay] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [verificationUrl, setVerificationUrl] = useState('');
  const showOwnerDetails = !isDemoCertificateView && !certificate?.submissionId;
  const isGuestCertificateView =
    isGuestUserEmail(user?.email) ||
    Boolean(TokenManager.getPublicCertificateAccessToken(certificateId)) ||
    isDemoCertificateView;

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
      const verifyUrl = isDemoCertificateView
        ? window.location.href
        : `${window.location.origin}/verify/${certificate.verificationToken}`;
      setVerificationUrl(verifyUrl);
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
    } else {
      setVerificationUrl('');
    }
  }, [certificate, isDemoCertificateView]);

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
      const verifyUrl =
        verificationUrl ||
        `${window.location.origin}/verify/${certificate.verificationToken}`;
      const didCopy = await copyTextToClipboard(verifyUrl);
      if (didCopy) {
        toast({
          title: 'Link copied',
          description: 'Certificate link copied to clipboard',
        });
      } else {
        setDetailsOpen(true);
        showCopyUnavailableToast('Certificate link');
      }
    }
  };

  const getShareUrl = () => {
    if (!certificate) return '';
    return (
      verificationUrl ||
      `${window.location.origin}/verify/${certificate.verificationToken}`
    );
  };

  const getShareTitle = () => {
    const title = certificate?.title?.trim();
    return title ? `Humanly certificate: ${title}` : 'Humanly certificate';
  };

  const openExternalShare = (url: string) => {
    const opened = window.open(url, '_blank');
    if (opened) {
      opened.opener = null;
    } else {
      toast({
        title: 'Share blocked',
        description: 'Your browser blocked the share window. Copy the certificate link instead.',
        variant: 'destructive',
      });
    }
  };

  const handleShareToX = () => {
    const shareUrl = getShareUrl();
    if (!shareUrl) return;
    const url = new URL('https://twitter.com/intent/tweet');
    url.searchParams.set('url', shareUrl);
    url.searchParams.set('text', getShareTitle());
    openExternalShare(url.toString());
  };

  const handleShareToLinkedIn = () => {
    const shareUrl = getShareUrl();
    if (!shareUrl) return;
    const url = new URL('https://www.linkedin.com/sharing/share-offsite/');
    url.searchParams.set('url', shareUrl);
    openExternalShare(url.toString());
  };

  const getEmbedSnippet = () => {
    const shareUrl = getShareUrl();
    const escapedUrl = escapeHtmlAttribute(shareUrl);
    const escapedTitle = escapeHtmlAttribute(getShareTitle());
    return `<iframe src="${escapedUrl}" title="${escapedTitle}" width="100%" height="720" loading="lazy" style="border: 0; border-radius: 8px;"></iframe>`;
  };

  const handleCopyEmbedSnippet = async () => {
    if (!certificate) return;
    const didCopy = await copyTextToClipboard(getEmbedSnippet());
    if (didCopy) {
      toast({
        title: 'Embed copied',
        description: 'Certificate embed snippet copied to clipboard',
      });
    } else {
      setDetailsOpen(true);
      showCopyUnavailableToast('Embed snippet');
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

  const handleToggleDisplayOption = async (
    option: 'fullText' | 'editHistory',
    value: boolean
  ) => {
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
          <h2 className="text-lg font-medium text-destructive">Error</h2>
          <p className="mt-2 text-sm">{error || 'Certificate not found'}</p>
          {!isGuestCertificateView && (
            <Button
              onClick={() => router.push('/certificates')}
              variant="ghost"
              className="mt-4 -ml-2 px-2 text-muted-foreground hover:bg-transparent hover:text-foreground"
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
            variant="ghost"
            size="sm"
            className="-ml-2 w-fit px-2 text-muted-foreground hover:bg-transparent hover:text-foreground"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Certificates
          </Button>
        )}

        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              router.push(
                `/logs/${certificate.documentId}?returnTo=certificate&certificateId=${certificate.id}${isDemoCertificateView ? '&demo=1' : ''}`
              )
            }
            variant="outline"
            size="sm"
            className="min-w-0 border-[#9E756B] bg-[#9E756B] text-white hover:border-[#8F685F] hover:bg-[#8F685F] hover:text-white"
          >
            <FileText className="mr-2 h-4 w-4" />
            View Logs
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm" className="min-w-0">
                <Share2 className="mr-2 h-4 w-4" />
                Share
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              <DropdownMenuItem onClick={handleShareVerificationLink}>
                <Copy className="mr-2 h-4 w-4" />
                Copy link
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleShareToX}>
                <span className="mr-2 inline-flex h-4 w-4 items-center justify-center text-xs font-medium">
                  X
                </span>
                Share on X
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleShareToLinkedIn}>
                <span className="mr-2 inline-flex h-4 w-4 items-center justify-center rounded-sm border text-[10px] font-medium">
                  in
                </span>
                Share on LinkedIn
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopyEmbedSnippet}>
                <Code2 className="mr-2 h-4 w-4" />
                Copy embed
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      <div className="space-y-4">
        <CertificateEvidenceView
          certificate={certificate}
          aiStats={aiStats}
          isLoadingAiStats={isLoadingAiStats}
          replayToken={
            isDemoCertificateView ? undefined : certificate.verificationToken
          }
          replayAccessCode={certificate.accessCode || undefined}
          seal={seal}
          sealStatus={sealStatus}
          integrityMessage={integrityMessage}
          isDemoPreview={isDemoCertificateView}
        />

        {showOwnerDetails ? (
          <Collapsible open={detailsOpen} onOpenChange={setDetailsOpen}>
            <Card>
              <CollapsibleTrigger asChild>
                <button className="flex w-full items-center justify-between px-5 py-4 text-left">
                  <div>
                    <p className="font-medium">More details</p>
                    <p className="text-sm text-muted-foreground">
                      Certificate sharing, access, display, and identifiers.
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-5 w-5 text-muted-foreground transition-transform ${detailsOpen ? 'rotate-180' : ''}`}
                  />
                </button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <Separator />
                <CardContent className="grid gap-5 p-5 !pt-6 lg:grid-cols-[minmax(0,2fr)_minmax(320px,1fr)]">
                  <div className="grid gap-4 rounded-lg border border-border/70 p-4 lg:grid-cols-[minmax(190px,0.8fr)_minmax(280px,1.2fr)]">
                    <div className="space-y-3">
                      <div>
                        <h3 className="text-sm font-medium">
                          Share Certificate
                        </h3>
                        <p className="text-xs text-muted-foreground">
                          Share or scan this certificate link.
                        </p>
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
                        <div className="mt-3 grid w-full max-w-56 gap-2">
                          <Button
                            onClick={handleShareVerificationLink}
                            variant="outline"
                            size="sm"
                            className="w-full bg-background"
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copy Link
                          </Button>
                          <div className="grid grid-cols-2 gap-2">
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="bg-background"
                              onClick={handleShareToX}
                            >
                              <span className="mr-2 text-xs font-medium">X</span>
                              X
                            </Button>
                            <Button
                              type="button"
                              variant="outline"
                              size="sm"
                              className="bg-background"
                              onClick={handleShareToLinkedIn}
                            >
                              <span className="mr-2 rounded-sm border px-1 text-[10px] font-medium">
                                in
                              </span>
                              LinkedIn
                            </Button>
                          </div>
                          <Button
                            onClick={handleCopyEmbedSnippet}
                            variant="outline"
                            size="sm"
                            className="w-full bg-background"
                          >
                            <Code2 className="mr-2 h-4 w-4" />
                            Copy Embed
                          </Button>
                        </div>
                        {verificationUrl ? (
                          <div className="mt-2 w-full max-w-56 space-y-2">
                            <div className="rounded-md border border-border/70 bg-background px-2 py-1.5 text-center text-[11px] text-muted-foreground">
                              <span className="select-all break-all">
                                {verificationUrl}
                              </span>
                            </div>
                            <textarea
                              readOnly
                              aria-label="Certificate embed snippet"
                              value={getEmbedSnippet()}
                              className="h-20 w-full resize-none rounded-md border border-border/70 bg-background px-2 py-1.5 font-mono text-[10px] text-muted-foreground outline-none"
                            />
                          </div>
                        ) : null}
                      </div>
                    </div>

                    <div className="space-y-8">
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <Lock
                            className={`h-4 w-4 ${certificate.isProtected ? 'text-[#b9774f]' : 'text-muted-foreground'}`}
                          />
                          <h3 className="text-sm font-medium">
                            Access Protection
                          </h3>
                        </div>

                        {!isEditingAccessCode ? (
                          <>
                            {certificate.isProtected &&
                            certificate.accessCode ? (
                              <div className="flex items-center gap-1">
                                <div className="min-w-0 flex-1 truncate rounded-lg border border-border/60 bg-background p-2 text-xs">
                                  {certificate.accessCode}
                                </div>
                                <Button
                                  onClick={() =>
                                    handleCopyAccessCode(
                                      certificate.accessCode!
                                    )
                                  }
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
                              onChange={(e) =>
                                handleEditedAccessCodeChange(e.target.value)
                              }
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
                              onClick={() =>
                                handleCopyAccessCode(editedAccessCode)
                              }
                              size="sm"
                              variant="outline"
                              disabled={
                                isUpdatingAccessCode ||
                                editedAccessCode.trim().length !== 4
                              }
                              className="h-8 w-8 p-0"
                              aria-label="Copy access code"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button
                              onClick={handleSaveAccessCode}
                              size="sm"
                              disabled={
                                isUpdatingAccessCode ||
                                !/^\d{4}$/.test(editedAccessCode)
                              }
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
                          <h3 className="text-sm font-medium">
                            Public Display
                          </h3>
                        </div>
                        <div className="space-y-2">
                          <div className="flex items-center justify-between gap-3">
                            <Label
                              htmlFor="includeFullText"
                              className="cursor-pointer text-xs"
                            >
                              Show full text
                            </Label>
                            <Switch
                              id="includeFullText"
                              checked={certificate.includeFullText}
                              onCheckedChange={(checked) =>
                                handleToggleDisplayOption('fullText', checked)
                              }
                              disabled={isUpdatingDisplay}
                            />
                          </div>
                          <div className="flex items-center justify-between gap-3">
                            <Label
                              htmlFor="includeEditHistory"
                              className="cursor-pointer text-xs"
                            >
                              Show edit history
                            </Label>
                            <Switch
                              id="includeEditHistory"
                              checked={certificate.includeEditHistory}
                              onCheckedChange={(checked) =>
                                handleToggleDisplayOption(
                                  'editHistory',
                                  checked
                                )
                              }
                              disabled={isUpdatingDisplay}
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="space-y-3 rounded-lg border border-border/70 p-4 text-xs">
                    <div>
                      <h3 className="text-sm font-medium">Identifiers</h3>
                      <p className="text-xs text-muted-foreground">
                        Technical identifiers for audit and support.
                      </p>
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
        ) : null}
      </div>
    </div>
  );
}

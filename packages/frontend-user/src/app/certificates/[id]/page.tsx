'use client';

import { useEffect, useState } from 'react';
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
} from 'lucide-react';
import { format } from 'date-fns';
import QRCode from 'qrcode';
import { Input } from '@/components/ui/input';
import { copyTextToClipboard } from '@/lib/clipboard';

export default function CertificateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const certificateId = params.id as string;
  const { certificate, aiStats, isLoading, isLoadingAiStats, error, downloadJSON, downloadPDF, openPDF, updateAccessCode, updateDisplayOptions } = useCertificate(certificateId);
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isEditingAccessCode, setIsEditingAccessCode] = useState(false);
  const [editedAccessCode, setEditedAccessCode] = useState('');
  const [isUpdatingAccessCode, setIsUpdatingAccessCode] = useState(false);
  const [isUpdatingDisplay, setIsUpdatingDisplay] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

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

  const handleDownloadPDF = async () => {
    try {
      const outcome = await downloadPDF();
      showDownloadToast('PDF certificate', outcome);
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to download PDF',
        variant: 'destructive',
      });
    }
  };

  const handleOpenPDF = async () => {
    try {
      await openPDF();
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to open PDF',
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

  const handleStartAddCode = () => {
    setEditedAccessCode('');
    setIsEditingAccessCode(true);
  };

  const handleSaveAccessCode = async () => {
    if (editedAccessCode.length < 4) {
      toast({
        title: 'Error',
        description: 'Access code must be at least 4 characters',
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
      <div className="container mx-auto max-w-5xl px-4 py-8">
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <h2 className="text-lg font-semibold text-destructive">Error</h2>
          <p className="mt-2 text-sm">{error || 'Certificate not found'}</p>
          <Button
            onClick={() => router.push('/certificates')}
            variant="outline"
            className="mt-4"
          >
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Certificates
          </Button>
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

  return (
    <div className="container mx-auto max-w-4xl px-4 py-8">
      <div className="mb-5">
        <Button
          onClick={() => router.push('/certificates')}
          variant="outline"
          size="sm"
          className="mb-5"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Certificates
        </Button>

        <Card>
          <CardContent className="p-5 sm:p-6">
            <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
              <div className="min-w-0 flex-1 space-y-3">
                <div className="flex items-start gap-3">
                  <Award className="mt-1 h-6 w-6 shrink-0 text-primary" />
                  <div className="min-w-0">
                    <h1 className="text-2xl font-bold tracking-tight break-words">{certificate.title}</h1>
                    <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                      <Calendar className="h-4 w-4" />
                      Generated {format(new Date(certificate.generatedAt), 'MMMM dd, yyyy')}
                    </p>
                  </div>
                </div>
                <p className="max-w-2xl text-sm text-muted-foreground">
                  A verifiable snapshot of how this document was written, including typing activity, pasted text, and AI assistance.
                </p>
              </div>

              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:w-72">
                <Button onClick={handleShareVerificationLink} variant="outline" size="sm" className="w-full">
                  <Share2 className="mr-2 h-4 w-4" />
                  Share Link
                </Button>
                <Button onClick={handleOpenPDF} size="sm" className="w-full">
                  <FileText className="mr-2 h-4 w-4" />
                  Open PDF
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="space-y-5">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-lg">Writing Process</CardTitle>
            <CardDescription>Core authorship signals for this certificate.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid gap-3 sm:grid-cols-4">
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Typed</p>
                <p className="mt-1 text-2xl font-semibold">{typedPercentage.toFixed(0)}%</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Pasted</p>
                <p className="mt-1 text-2xl font-semibold">{pastedPercentage.toFixed(0)}%</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
                <p className="text-xs text-muted-foreground">Final Text</p>
                <p className="mt-1 text-2xl font-semibold">{certificate.totalCharacters.toLocaleString()}</p>
              </div>
              <div className="rounded-lg bg-muted/50 p-3">
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
                <div className="bg-orange-500" style={{ width: `${pastedPercentage}%` }} />
              </div>
            </div>

          </CardContent>
        </Card>

        {(aiStats || isLoadingAiStats) && (
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Bot className="h-5 w-5 text-violet-600" />
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
                      <Wand2 className="h-4 w-4 text-violet-500" />
                      Text Improvements
                    </p>
                    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xs text-muted-foreground">Grammar</p>
                        <p className="text-xl font-semibold">{aiStats.selectionActions.grammarFixes}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xs text-muted-foreground">Improve</p>
                        <p className="text-xl font-semibold">{aiStats.selectionActions.improveWriting}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xs text-muted-foreground">Simplify</p>
                        <p className="text-xl font-semibold">{aiStats.selectionActions.simplify}</p>
                      </div>
                      <div className="rounded-lg bg-muted/50 p-3 text-center">
                        <p className="text-xs text-muted-foreground">Formal</p>
                        <p className="text-xl font-semibold">{aiStats.selectionActions.makeFormal}</p>
                      </div>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {textImprovementTotal} total · {aiStats.selectionActions.accepted} accepted · {aiStats.selectionActions.rejected} discarded
                      {textImprovementTotal > 0 ? ` · ${aiStats.selectionActions.acceptanceRate.toFixed(0)}% acceptance` : ''}
                    </p>
                  </div>

                  <div className="rounded-lg border p-4">
                    <p className="flex items-center gap-2 text-sm font-medium">
                      <MessageSquare className="h-4 w-4 text-blue-500" />
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
                  <p className="text-sm text-muted-foreground">Downloads, verification data, and sharing settings.</p>
                </div>
                <ChevronDown className={`h-5 w-5 text-muted-foreground transition-transform ${detailsOpen ? 'rotate-180' : ''}`} />
              </button>
            </CollapsibleTrigger>
            <CollapsibleContent>
              <Separator />
              <CardContent className="grid gap-5 p-5 lg:grid-cols-3">
                <div className="space-y-3">
                  <div>
                    <h3 className="text-sm font-medium">Verification</h3>
                    <p className="text-xs text-muted-foreground">Share or scan this link to verify the certificate.</p>
                  </div>
                  <div className="flex flex-col items-center rounded-lg border p-3">
                    {qrCodeDataURL ? (
                      <img
                        src={qrCodeDataURL}
                        alt="Verification QR Code"
                        className="h-36 w-36 rounded border"
                      />
                    ) : (
                      <div className="h-36 w-36 animate-pulse rounded bg-muted" />
                    )}
                    <Button
                      onClick={handleShareVerificationLink}
                      variant="outline"
                      size="sm"
                      className="mt-3 w-full"
                    >
                      <Share2 className="mr-2 h-4 w-4" />
                      Copy Link
                    </Button>
                  </div>
                </div>

                <div className="space-y-4">
                  <div>
                    <h3 className="text-sm font-medium">Downloads</h3>
                    <p className="text-xs text-muted-foreground">Open PDF to preview and save manually; download uses the browser's default folder.</p>
                  </div>
                  <div className="space-y-2">
                    <Button onClick={handleOpenPDF} className="w-full" size="sm">
                      <FileText className="mr-2 h-4 w-4" />
                      Open PDF
                    </Button>
                    <Button onClick={handleDownloadPDF} className="w-full" size="sm">
                      <FileText className="mr-2 h-4 w-4" />
                      Download PDF
                    </Button>
                    <Button onClick={handleDownloadJSON} variant="outline" className="w-full" size="sm">
                      <FileJson className="mr-2 h-4 w-4" />
                      JSON Data
                    </Button>
                  </div>

                  <div className="space-y-2 text-xs">
                    <div>
                      <p className="text-muted-foreground">Technical Activity</p>
                      <div className="mt-1 space-y-1 rounded-md border p-2">
                        <div className="flex items-center justify-between gap-3">
                          <span>Tracked actions</span>
                          <span className="font-medium">{certificate.totalEvents.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Typing updates</span>
                          <span className="font-medium">{certificate.typingEvents.toLocaleString()}</span>
                        </div>
                        <div className="flex items-center justify-between gap-3">
                          <span>Pastes</span>
                          <span className="font-medium">{certificate.pasteEvents.toLocaleString()}</span>
                        </div>
                      </div>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Certificate ID</p>
                      <p className="truncate font-mono">{certificate.id}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Document ID</p>
                      <p className="truncate font-mono">{certificate.documentId}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Verification Token</p>
                      <div className="mt-1 max-h-20 overflow-y-auto rounded-md bg-muted p-2 font-mono text-[10px] break-all">
                        {certificate.verificationToken}
                      </div>
                      <Button
                        onClick={handleCopyVerificationToken}
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full"
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
                </div>

                <div className="space-y-5">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2">
                      <Lock className={`h-4 w-4 ${certificate.isProtected ? 'text-yellow-600' : 'text-muted-foreground'}`} />
                      <h3 className="text-sm font-medium">Access Protection</h3>
                    </div>

                    {!isEditingAccessCode ? (
                      <>
                        {certificate.isProtected && certificate.accessCode ? (
                          <div className="flex items-center gap-1">
                            <div className="min-w-0 flex-1 truncate rounded bg-muted p-2 font-mono text-xs">
                              {certificate.accessCode}
                            </div>
                            <Button
                              onClick={async () => {
                                const didCopy = await copyTextToClipboard(certificate.accessCode!);
                                if (didCopy) {
                                  toast({ title: 'Copied', description: 'Access code copied' });
                                } else {
                                  showCopyUnavailableToast('Access code');
                                }
                              }}
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                            >
                              <Copy className="h-3 w-3" />
                            </Button>
                            <Button onClick={handleStartEdit} variant="ghost" size="sm" className="h-8 w-8 p-0">
                              <Edit2 className="h-3 w-3" />
                            </Button>
                            <Button
                              onClick={handleRemoveAccessCode}
                              variant="ghost"
                              size="sm"
                              disabled={isUpdatingAccessCode}
                              className="h-8 w-8 p-0"
                            >
                              <Trash2 className="h-3 w-3 text-destructive" />
                            </Button>
                          </div>
                        ) : (
                          <Button onClick={handleStartAddCode} variant="outline" size="sm" className="w-full">
                            <Lock className="mr-2 h-3 w-3" />
                            Add Access Code
                          </Button>
                        )}
                      </>
                    ) : (
                      <div className="flex items-center gap-1">
                        <Input
                          type="text"
                          placeholder="Code (min 4 chars)"
                          value={editedAccessCode}
                          onChange={(e) => setEditedAccessCode(e.target.value)}
                          disabled={isUpdatingAccessCode}
                          className="h-8 flex-1 font-mono text-xs"
                          autoFocus
                        />
                        <Button
                          onClick={handleSaveAccessCode}
                          size="sm"
                          disabled={isUpdatingAccessCode || editedAccessCode.trim().length < 4}
                          className="h-8 w-8 p-0"
                        >
                          <Check className="h-3 w-3" />
                        </Button>
                        <Button
                          onClick={handleCancelEdit}
                          size="sm"
                          variant="outline"
                          disabled={isUpdatingAccessCode}
                          className="h-8 w-8 p-0"
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </div>
                    )}
                  </div>

                  <Separator />

                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Settings className="h-4 w-4 text-muted-foreground" />
                      <h3 className="text-sm font-medium">Public Display</h3>
                    </div>
                    <div className="space-y-3">
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
              </CardContent>
            </CollapsibleContent>
          </Card>
        </Collapsible>
      </div>
    </div>
  );
}

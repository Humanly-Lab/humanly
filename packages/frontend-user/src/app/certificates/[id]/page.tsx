'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useCertificate } from '@/hooks/use-certificates';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { useToast } from '@/components/ui/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import {
  ArrowLeft,
  FileJson,
  FileText,
  Calendar,
  Award,
  Clock,
  Type,
  Copy,
  Check,
  Share2,
  Lock,
  Settings,
  Edit2,
  X,
  Trash2,
  Bot,
  CheckCircle,
  XCircle,
  MessageSquare,
  Wand2,
} from 'lucide-react';
import { format } from 'date-fns';
import QRCode from 'qrcode';
import { Input } from '@/components/ui/input';

export default function CertificateDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { toast } = useToast();
  const certificateId = params.id as string;
  const { certificate, aiStats, isLoading, isLoadingAiStats, error, downloadJSON, downloadPDF, updateAccessCode, updateDisplayOptions } = useCertificate(certificateId);
  const [qrCodeDataURL, setQrCodeDataURL] = useState<string>('');
  const [copied, setCopied] = useState(false);
  const [isEditingAccessCode, setIsEditingAccessCode] = useState(false);
  const [editedAccessCode, setEditedAccessCode] = useState('');
  const [isUpdatingAccessCode, setIsUpdatingAccessCode] = useState(false);
  const [isUpdatingDisplay, setIsUpdatingDisplay] = useState(false);

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

  const handleDownloadJSON = async () => {
    try {
      await downloadJSON();
      toast({
        title: 'Success',
        description: 'JSON certificate downloaded successfully',
      });
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
      await downloadPDF();
      toast({
        title: 'Success',
        description: 'PDF certificate downloaded successfully',
      });
    } catch (err: any) {
      toast({
        title: 'Error',
        description: err.message || 'Failed to download PDF',
        variant: 'destructive',
      });
    }
  };

  const handleCopyVerificationToken = () => {
    if (certificate) {
      navigator.clipboard.writeText(certificate.verificationToken);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
      toast({
        title: 'Copied',
        description: 'Verification token copied to clipboard',
      });
    }
  };

  const handleShareVerificationLink = () => {
    if (certificate) {
      const verifyUrl = `${window.location.origin}/verify/${certificate.verificationToken}`;
      navigator.clipboard.writeText(verifyUrl);
      toast({
        title: 'Link Copied',
        description: 'Verification link copied to clipboard',
      });
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

  return (
    <div className="container mx-auto max-w-5xl px-4 py-8">
      <div className="mb-8">
        <Button
          onClick={() => router.push('/certificates')}
          variant="outline"
          size="sm"
          className="mb-6"
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Certificates
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3">
              <Award className="h-6 w-6 sm:h-8 sm:w-8 text-primary" />
              <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight break-words">{certificate.title}</h1>
            </div>
            <p className="text-xs sm:text-sm text-muted-foreground mt-2 flex items-center gap-2">
              <Calendar className="h-3 w-3 sm:h-4 sm:w-4" />
              Generated on {format(new Date(certificate.generatedAt), 'MMMM dd, yyyy')}
            </p>
          </div>
          <Badge
            variant={certificate.certificateType === 'full_authorship' ? 'default' : 'secondary'}
            className="text-sm sm:text-base px-3 py-1 sm:px-4 sm:py-2 self-start"
          >
            {certificate.certificateType === 'full_authorship' ? 'Authorship Certificate' : 'Partial Certificate'}
          </Badge>
        </div>
      </div>

      {/* Main Content - Two Column Layout */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column (2/3 width) */}
        <div className="lg:col-span-2 space-y-6">
          {/* Authorship Statistics Card */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-lg">Authorship Statistics</CardTitle>
              <CardDescription>Detailed breakdown of document authorship</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Key Metrics Row */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Document Length</p>
                  <p className="text-xl font-bold">{certificate.totalCharacters.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Total Events</p>
                  <p className="text-xl font-bold">{certificate.totalEvents.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground">Typing Events</p>
                  <p className="text-xl font-bold">{certificate.typingEvents.toLocaleString()}</p>
                </div>
                <div className="p-3 bg-muted/50 rounded-lg text-center">
                  <p className="text-xs text-muted-foreground flex items-center justify-center gap-1">
                    <Clock className="h-3 w-3" />
                    Editing Time
                  </p>
                  <p className="text-xl font-bold">{Math.round(certificate.editingTimeSeconds / 60)} min</p>
                </div>
              </div>

              <Separator />

              {/* Authorship Composition */}
              <div className="space-y-3">
                <p className="text-sm font-medium">Authorship Composition</p>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <Type className="h-3 w-3" />
                        Typed
                      </p>
                      <p className="text-sm font-semibold">{typedPercentage.toFixed(1)}%</p>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-primary" style={{ width: `${typedPercentage}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">{certificate.typedCharacters.toLocaleString()} chars</p>
                  </div>
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <p className="text-sm text-muted-foreground flex items-center gap-1">
                        <FileText className="h-3 w-3" />
                        Pasted
                      </p>
                      <p className="text-sm font-semibold">{pastedPercentage.toFixed(1)}%</p>
                    </div>
                    <div className="h-2 bg-secondary rounded-full overflow-hidden">
                      <div className="h-full bg-orange-500" style={{ width: `${pastedPercentage}%` }} />
                    </div>
                    <p className="text-xs text-muted-foreground">{certificate.pastedCharacters.toLocaleString()} chars</p>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* AI Authorship Statistics Card */}
          {(aiStats || isLoadingAiStats) && (
            <Card>
              <CardHeader className="pb-3">
                <div className="flex items-center gap-2">
                  <Bot className="h-5 w-5 text-violet-600" />
                  <CardTitle className="text-lg">AI Assistance</CardTitle>
                </div>
                <CardDescription>AI usage during document creation</CardDescription>
              </CardHeader>
              <CardContent>
                {isLoadingAiStats ? (
                  <div className="flex items-center justify-center py-6">
                    <div className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-solid border-current border-r-transparent" />
                    <span className="ml-2 text-sm text-muted-foreground">Loading...</span>
                  </div>
                ) : aiStats ? (
                  <div className="space-y-4">
                    {/* Text Improvement Actions */}
                    <div className="space-y-3">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <Wand2 className="h-4 w-4 text-violet-500" />
                        Text Improvements
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="p-2 bg-muted/50 rounded-lg text-center">
                          <p className="text-[10px] text-muted-foreground">Grammar</p>
                          <p className="text-lg font-semibold">{aiStats.selectionActions.grammarFixes}</p>
                        </div>
                        <div className="p-2 bg-muted/50 rounded-lg text-center">
                          <p className="text-[10px] text-muted-foreground">Improve</p>
                          <p className="text-lg font-semibold">{aiStats.selectionActions.improveWriting}</p>
                        </div>
                        <div className="p-2 bg-muted/50 rounded-lg text-center">
                          <p className="text-[10px] text-muted-foreground">Simplify</p>
                          <p className="text-lg font-semibold">{aiStats.selectionActions.simplify}</p>
                        </div>
                        <div className="p-2 bg-muted/50 rounded-lg text-center">
                          <p className="text-[10px] text-muted-foreground">Formal</p>
                          <p className="text-lg font-semibold">{aiStats.selectionActions.makeFormal}</p>
                        </div>
                      </div>
                      {/* Acceptance Stats */}
                      <div className="flex flex-wrap items-center gap-3 text-xs pt-1">
                        <span className="text-muted-foreground">Total: <span className="font-medium text-foreground">{aiStats.selectionActions.total}</span></span>
                        <span className="flex items-center gap-1">
                          <CheckCircle className="h-3 w-3 text-green-600" />
                          <span className="text-green-600 font-medium">{aiStats.selectionActions.accepted}</span>
                        </span>
                        <span className="flex items-center gap-1">
                          <XCircle className="h-3 w-3 text-red-500" />
                          <span className="text-red-500 font-medium">{aiStats.selectionActions.rejected}</span>
                        </span>
                        {aiStats.selectionActions.total > 0 && (
                          <span className="text-muted-foreground">
                            Rate: <span className="font-medium text-foreground">{aiStats.selectionActions.acceptanceRate.toFixed(0)}%</span>
                          </span>
                        )}
                      </div>
                    </div>

                    <Separator />

                    {/* AI Questions */}
                    <div className="space-y-3">
                      <p className="text-sm font-medium flex items-center gap-2">
                        <MessageSquare className="h-4 w-4 text-blue-500" />
                        AI Questions
                      </p>
                      <div className="grid grid-cols-4 gap-2">
                        <div className="p-2 bg-muted/50 rounded-lg text-center">
                          <p className="text-[10px] text-muted-foreground">Total</p>
                          <p className="text-lg font-semibold">{aiStats.aiQuestions.total}</p>
                        </div>
                        <div className="p-2 bg-blue-50 rounded-lg text-center border border-blue-100">
                          <p className="text-[10px] text-blue-700">Understanding</p>
                          <p className="text-lg font-semibold text-blue-700">{aiStats.aiQuestions.understanding}</p>
                        </div>
                        <div className="p-2 bg-violet-50 rounded-lg text-center border border-violet-100">
                          <p className="text-[10px] text-violet-700">Generation</p>
                          <p className="text-lg font-semibold text-violet-700">{aiStats.aiQuestions.generation}</p>
                        </div>
                        <div className="p-2 bg-muted/50 rounded-lg text-center">
                          <p className="text-[10px] text-muted-foreground">Other</p>
                          <p className="text-lg font-semibold">{aiStats.aiQuestions.other}</p>
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4">
                    No AI statistics available.
                  </p>
                )}
              </CardContent>
            </Card>
          )}

          {/* Download & Details Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Download</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                <Button onClick={handleDownloadPDF} className="w-full" size="sm">
                  <FileText className="mr-2 h-4 w-4" />
                  PDF Certificate
                </Button>
                <Button onClick={handleDownloadJSON} variant="outline" className="w-full" size="sm">
                  <FileJson className="mr-2 h-4 w-4" />
                  JSON Data
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2 text-xs">
                <div>
                  <p className="text-muted-foreground">Certificate ID</p>
                  <p className="font-mono truncate">{certificate.id}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Document ID</p>
                  <p className="font-mono truncate">{certificate.documentId}</p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>

        {/* Right Column (1/3 width) */}
        <div className="space-y-6">
          {/* Verification QR Code */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Verification</CardTitle>
              <CardDescription>Scan QR code to verify</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center">
              {qrCodeDataURL ? (
                <img
                  src={qrCodeDataURL}
                  alt="Verification QR Code"
                  className="w-40 h-40 border rounded-lg"
                />
              ) : (
                <div className="w-40 h-40 bg-muted animate-pulse rounded-lg" />
              )}
              <Button
                onClick={handleShareVerificationLink}
                variant="outline"
                size="sm"
                className="mt-3 w-full"
              >
                <Share2 className="mr-2 h-4 w-4" />
                Share Link
              </Button>
            </CardContent>
          </Card>

          {/* Verification Token */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Token</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              <div className="p-2 bg-muted rounded-md font-mono text-[10px] break-all max-h-20 overflow-y-auto">
                {certificate.verificationToken}
              </div>
              <Button
                onClick={handleCopyVerificationToken}
                variant="outline"
                size="sm"
                className="w-full"
              >
                {copied ? (
                  <>
                    <Check className="mr-2 h-4 w-4" />
                    Copied!
                  </>
                ) : (
                  <>
                    <Copy className="mr-2 h-4 w-4" />
                    Copy
                  </>
                )}
              </Button>
            </CardContent>
          </Card>

          {/* Certificate Settings */}
          <Card>
            <CardHeader className="pb-3">
              <div className="flex items-center gap-2">
                <Settings className="h-4 w-4 text-muted-foreground" />
                <CardTitle className="text-base">Settings</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Access Protection */}
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Lock className={`h-3 w-3 ${certificate.isProtected ? 'text-yellow-600' : 'text-muted-foreground'}`} />
                  <h3 className="font-medium text-sm">Protection</h3>
                </div>

                {!isEditingAccessCode ? (
                  <>
                    {certificate.isProtected && certificate.accessCode ? (
                      <div className="space-y-2">
                        <div className="flex items-center gap-1">
                          <div className="flex-1 p-2 bg-muted rounded font-mono text-xs truncate">
                            {certificate.accessCode}
                          </div>
                          <Button
                            onClick={() => {
                              navigator.clipboard.writeText(certificate.accessCode!);
                              toast({ title: 'Copied', description: 'Access code copied' });
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
                      </div>
                    ) : (
                      <Button onClick={handleStartAddCode} variant="outline" size="sm" className="w-full">
                        <Lock className="h-3 w-3 mr-2" />
                        Add Access Code
                      </Button>
                    )}
                  </>
                ) : (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1">
                      <Input
                        type="text"
                        placeholder="Code (min 4 chars)"
                        value={editedAccessCode}
                        onChange={(e) => setEditedAccessCode(e.target.value)}
                        disabled={isUpdatingAccessCode}
                        className="flex-1 h-8 text-xs font-mono"
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
                  </div>
                )}
              </div>

              <Separator />

              {/* Display Options */}
              <div className="space-y-3">
                <h3 className="font-medium text-sm">Display</h3>
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="includeFullText" className="text-xs cursor-pointer">
                      Show Full Text
                    </Label>
                    <Switch
                      id="includeFullText"
                      checked={certificate.includeFullText}
                      onCheckedChange={(checked) => handleToggleDisplayOption('fullText', checked)}
                      disabled={isUpdatingDisplay}
                    />
                  </div>
                  <div className="flex items-center justify-between">
                    <Label htmlFor="includeEditHistory" className="text-xs cursor-pointer">
                      Show Edit History
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
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

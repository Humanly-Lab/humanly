'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useCertificates } from '@/hooks/use-certificates';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Award, ChevronDown, FileText, Folder, Trash2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import {
  groupCertificatesByDocument,
  type CertificateTaskGroup,
} from '@/lib/certificate-groups';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  getCertificateFinalTextCharacterCount,
  type Certificate,
} from '@humanly/shared';

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getActivityLabel(certificate: Certificate) {
  const finalTextCharacterCount = getCertificateFinalTextCharacterCount(certificate);
  const showMetrics = finalTextCharacterCount > 0;
  const lowActivity = certificate.totalEvents < 5;
  const pendingActivity = !certificate.totalEvents && !finalTextCharacterCount;

  if (pendingActivity) return 'Certificate pending activity';
  if (lowActivity) return 'Low activity';
  if (showMetrics) {
    return `Input events: ${certificate.totalEvents} · Final characters: ${finalTextCharacterCount}`;
  }

  return null;
}

type DeleteTarget =
  | {
      type: 'certificate';
      certificate: Certificate;
    }
  | {
      type: 'folder';
      group: CertificateTaskGroup;
    };

export default function CertificatesPage() {
  const router = useRouter();
  const { toast } = useToast();
  const { certificates, isLoading, error, deleteCertificate } = useCertificates({
    limit: 50,
    offset: 0,
    sortBy: 'generatedAt',
    sortOrder: 'desc',
  });
  const [deleteTarget, setDeleteTarget] = useState<DeleteTarget | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const certificateGroups = useMemo(
    () => groupCertificatesByDocument(certificates),
    [certificates]
  );

  const handleDelete = async () => {
    if (!deleteTarget) return;

    try {
      setIsDeleting(true);

      if (deleteTarget.type === 'certificate') {
        await deleteCertificate(deleteTarget.certificate.id);
        toast({
          title: 'Certificate deleted',
          description: 'The certificate was removed from your records.',
        });
      } else {
        await Promise.all(
          deleteTarget.group.certificates.map((certificate) => deleteCertificate(certificate.id))
        );
        toast({
          title: 'Certificate folder deleted',
          description: `${deleteTarget.group.certificates.length} certificate${
            deleteTarget.group.certificates.length === 1 ? '' : 's'
          } removed from ${deleteTarget.group.title}.`,
        });
      }

      setDeleteTarget(null);
    } catch (err: any) {
      toast({
        title: 'Delete failed',
        description: err?.message || 'Unable to delete certificate records.',
        variant: 'destructive',
      });
    } finally {
      setIsDeleting(false);
    }
  };

  const deleteDialogTitle = deleteTarget?.type === 'folder'
    ? 'Delete certificate folder?'
    : 'Delete certificate?';
  const deleteDialogDescription = deleteTarget?.type === 'folder'
    ? `This will delete all ${deleteTarget.group.certificates.length} certificate${
        deleteTarget.group.certificates.length === 1 ? '' : 's'
      } currently in "${deleteTarget.group.title}". If you generate another certificate for this task later, the folder will be created again.`
    : deleteTarget
    ? `This will delete the certificate issued ${formatDate(deleteTarget.certificate.generatedAt)}.`
    : '';

  if (isLoading) {
    return (
      <div className="humanly-page">
        <div className="mb-8">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <Card key={i}>
              <CardContent className="flex flex-col gap-3 p-5">
                <div className="flex items-center justify-between gap-4">
                  <Skeleton className="h-6 w-2/5" />
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-12 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="humanly-page">
      <div className="mb-8">
        <Button
          variant="ghost"
          size="sm"
          className="mb-5 -ml-2 h-auto px-2 py-1 text-muted-foreground hover:bg-transparent hover:text-foreground"
          onClick={() => router.push('/documents')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Workspace
        </Button>
        <p className="humanly-eyebrow">Certificates</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">Authorship records</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Proof of authorship grouped by writing task
        </p>
      </div>

      {error && (
        <div className="mb-6 rounded-lg border border-destructive/50 bg-destructive/10 p-4">
          <p className="text-sm text-destructive">{error}</p>
        </div>
      )}

      {!isLoading && certificates.length === 0 ? (
        <Card>
          <CardContent className="flex min-h-[400px] flex-col items-center justify-center py-12">
            <Award className="h-12 w-12 text-accent" />
            <h3 className="mt-4 text-lg font-semibold">No certificates yet</h3>
            <p className="mt-2 text-center text-sm text-muted-foreground max-w-md">
              Generate a certificate from a personal document after you have enough writing activity.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {certificateGroups.map((group) => (
            <details
              key={group.documentId}
              className="group rounded-lg border bg-card text-card-foreground shadow-sm"
            >
              <summary className="flex cursor-pointer list-none items-start gap-3 px-4 py-4 marker:content-none sm:px-5">
                <Folder className="mt-1 h-5 w-5 shrink-0 text-accent" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:justify-between">
                    <div className="min-w-0">
                      <h3 className="line-clamp-1 text-base font-semibold leading-snug sm:text-lg">
                        {group.title}
                      </h3>
                      <p className="mt-1 text-sm text-muted-foreground">
                        {group.certificates.length} {group.certificates.length === 1 ? 'certificate' : 'certificates'}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2 text-sm text-muted-foreground">
                      <span>Latest {formatDate(group.latestCertificate.generatedAt)}</span>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-9 w-9 text-muted-foreground hover:text-destructive"
                        aria-label={`Delete ${group.title} certificate folder`}
                        onClick={(event) => {
                          event.preventDefault();
                          event.stopPropagation();
                          setDeleteTarget({ type: 'folder', group });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                </div>
                <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>

              <div className="border-t">
                {group.certificates.map((certificate) => {
                  const activityLabel = getActivityLabel(certificate);

                  return (
                    <div
                      key={certificate.id}
                      className="flex w-full items-center gap-2 border-b transition-colors last:border-b-0 hover:bg-muted/40"
                    >
                      <button
                        type="button"
                        aria-label={`Open certificate issued ${formatDate(certificate.generatedAt)}`}
                        className="flex min-w-0 flex-1 flex-col gap-3 px-4 py-3 text-left sm:flex-row sm:items-center sm:px-5"
                        onClick={() => router.push(`/certificates/${certificate.id}`)}
                      >
                        <div className="flex min-w-0 items-start gap-3">
                          <FileText className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-medium text-foreground">
                                Issued {formatDate(certificate.generatedAt)}
                              </span>
                              {certificate.certificateType && (
                                <Badge
                                  variant={certificate.certificateType === 'full_authorship' ? 'default' : 'secondary'}
                                  className="shrink-0 rounded-md"
                                >
                                  {certificate.certificateType === 'full_authorship' ? 'Certificate' : 'Partial'}
                                </Badge>
                              )}
                            </div>
                            {activityLabel && (
                              <p className="mt-1 text-sm text-muted-foreground">
                                {activityLabel}
                              </p>
                            )}
                          </div>
                        </div>
                      </button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="mr-3 h-9 w-9 shrink-0 text-muted-foreground hover:text-destructive sm:mr-4"
                        aria-label={`Delete certificate issued ${formatDate(certificate.generatedAt)}`}
                        onClick={(event) => {
                          event.stopPropagation();
                          setDeleteTarget({ type: 'certificate', certificate });
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}
      <AlertDialog
        open={Boolean(deleteTarget)}
        onOpenChange={(open) => {
          if (!open && !isDeleting) setDeleteTarget(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{deleteDialogTitle}</AlertDialogTitle>
            <AlertDialogDescription>
              {deleteDialogDescription} This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={isDeleting}
              onClick={(event) => {
                event.preventDefault();
                void handleDelete();
              }}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useCertificates } from '@/hooks/use-certificates';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Award, ChevronDown, FileText, Folder } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { groupCertificatesByDocument } from '@/lib/certificate-groups';
import type { Certificate } from '@humanly/shared';

function formatDate(date: Date | string) {
  return new Date(date).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function getActivityLabel(certificate: Certificate) {
  const showMetrics = certificate.totalCharacters > 0;
  const lowActivity = certificate.totalEvents < 5;
  const pendingActivity = !certificate.totalEvents && !certificate.totalCharacters;

  if (pendingActivity) return 'Certificate pending activity';
  if (lowActivity) return 'Low activity';
  if (showMetrics) {
    return `Input events: ${certificate.totalEvents} · Final characters: ${certificate.totalCharacters}`;
  }

  return null;
}

export default function CertificatesPage() {
  const router = useRouter();
  const { certificates, isLoading, error } = useCertificates({
    limit: 50,
    offset: 0,
    sortBy: 'generatedAt',
    sortOrder: 'desc',
  });
  const certificateGroups = useMemo(
    () => groupCertificatesByDocument(certificates),
    [certificates]
  );

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
              open
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
                    <div className="shrink-0 text-sm text-muted-foreground">
                      Latest {formatDate(group.latestCertificate.generatedAt)}
                    </div>
                  </div>
                </div>
                <ChevronDown className="mt-1 h-5 w-5 shrink-0 text-muted-foreground transition-transform group-open:rotate-180" />
              </summary>

              <div className="border-t">
                {group.certificates.map((certificate) => {
                  const activityLabel = getActivityLabel(certificate);

                  return (
                    <button
                      key={certificate.id}
                      type="button"
                      className="flex w-full flex-col gap-3 border-b px-4 py-3 text-left transition-colors last:border-b-0 hover:bg-muted/40 sm:flex-row sm:items-center sm:justify-between sm:px-5"
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
                      <span className="text-sm text-muted-foreground">
                        Open
                      </span>
                    </button>
                  );
                })}
              </div>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

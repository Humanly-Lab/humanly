'use client';

import { useRouter } from 'next/navigation';
import { useCertificates } from '@/hooks/use-certificates';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Award } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';

export default function CertificatesPage() {
  const router = useRouter();
  const { certificates, isLoading, error } = useCertificates({
    limit: 50,
    offset: 0,
    sortBy: 'generatedAt',
    sortOrder: 'desc',
  });

  if (isLoading) {
    return (
      <div className="humanly-page">
        <div className="mb-8">
          <Skeleton className="h-8 w-64 mb-2" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <Card key={i}>
              <CardContent className="p-5 flex flex-col gap-3">
                <Skeleton className="h-6 w-3/4" />
                <Skeleton className="h-4 w-1/2" />
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-20 mt-2" />
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
          variant="outline"
          size="sm"
          className="mb-5"
          onClick={() => router.push('/documents')}
        >
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Workspace
        </Button>
        <p className="humanly-eyebrow">Certificates</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-normal sm:text-3xl">Authorship records</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground sm:text-base">
          Proof of authorship generated from your personal documents
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
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {certificates.map((certificate) => {
            const formatDate = (date: Date | string) => {
              return new Date(date).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
              });
            };

            // Determine if we should show metrics
            const showMetrics = certificate.totalCharacters > 0;
            const lowActivity = certificate.totalEvents < 5;
            const pendingActivity = !certificate.totalEvents && !certificate.totalCharacters;

            return (
              <Card 
                key={certificate.id} 
                className="cursor-pointer transition-colors hover:border-foreground/30"
                onClick={() => router.push(`/certificates/${certificate.id}`)}
              >
                <CardContent className="flex flex-col gap-3 p-4 sm:p-5">
                  {/* Title and Badge row */}
                  <div className="flex items-start justify-between gap-2">
                      <h3 className="min-w-0 flex-1 text-base font-semibold leading-snug text-foreground line-clamp-1 sm:text-lg">
                        {certificate.title}
                      </h3>
                      {certificate.certificateType && (
                      <Badge variant={certificate.certificateType === 'full_authorship' ? 'default' : 'secondary'} className="shrink-0 rounded-md">
                        {certificate.certificateType === 'full_authorship' ? 'Certificate' : 'Partial'}
                      </Badge>
                    )}
                  </div>

                  {/* Metadata row */}
                  <div className="text-xs text-muted-foreground">
                    Issued {formatDate(certificate.generatedAt)}
                  </div>

                  {/* Metrics block */}
                  {pendingActivity ? (
                    <div className="text-sm text-muted-foreground">
                      Certificate pending activity
                    </div>
                  ) : lowActivity ? (
                    <div className="text-sm text-muted-foreground">
                      Low activity
                    </div>
                  ) : showMetrics ? (
                    <div className="text-sm text-muted-foreground">
                      Input events: {certificate.totalEvents} · Final characters: {certificate.totalCharacters}
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

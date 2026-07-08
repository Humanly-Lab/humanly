import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';

// Streamed instantly on navigation into /certificates. Mirrors the page's own
// isLoading skeleton so there is no layout jump. See issue #971.
export default function CertificatesLoading() {
  return (
    <div className="humanly-page">
      <div className="mb-8">
        <Skeleton className="mb-2 h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
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

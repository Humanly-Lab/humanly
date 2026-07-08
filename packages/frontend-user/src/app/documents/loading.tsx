import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent, CardHeader } from '@/components/ui/card';

// Streamed instantly on navigation into /documents so the previous page does
// not freeze while the dashboard loads. Mirrors the real page's header + card
// grid to avoid a layout jump. See issue #971.
export default function DocumentsLoading() {
  return (
    <main className="humanly-dashboard-page">
      <div className="mb-8 space-y-3">
        <Skeleton className="mb-2 h-8 w-64" />
        <Skeleton className="h-4 w-96 max-w-full" />
      </div>
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3, 4, 5, 6].map((i) => (
          <Card key={i}>
            <CardHeader>
              <Skeleton className="mb-2 h-6 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-2/3" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>
    </main>
  );
}

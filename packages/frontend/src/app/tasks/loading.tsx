import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card';

// Streamed instantly on navigation into /tasks (renders inside the layout's
// humanly-dashboard-page main). Mirrors the page's own loading skeleton so
// there is no layout jump. See issue #971.
export default function TasksLoading() {
  return (
    <div className="space-y-7">
      <div className="mb-8 space-y-3">
        <div className="h-3 w-32 rounded bg-muted" />
        <div className="h-8 w-64 rounded bg-muted" />
        <div className="h-4 w-96 max-w-full rounded bg-muted" />
      </div>

      <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse shadow-none">
            <CardHeader>
              <div className="mb-2 h-6 w-3/4 rounded bg-muted" />
              <div className="h-4 w-1/2 rounded bg-muted" />
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="h-4 rounded bg-muted" />
                <div className="h-4 w-5/6 rounded bg-muted" />
              </div>
            </CardContent>
            <CardFooter>
              <div className="h-10 w-full rounded bg-muted" />
            </CardFooter>
          </Card>
        ))}
      </div>
    </div>
  );
}

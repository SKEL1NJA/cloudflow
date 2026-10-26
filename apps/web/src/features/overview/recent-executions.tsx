import { Inbox } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/layout/empty-state';
import { ErrorState } from '@/components/layout/error-state';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ExecutionsTable } from '@/features/executions/executions-table';
import { useRecentExecutions } from '@/queries/executions';

export function RecentExecutions() {
  const { data, error, isError, refetch } = useRecentExecutions();

  return (
    <Card>
      <CardContent className="p-0">
        <div className="flex items-center justify-between px-5 py-4">
          <h2 className="text-sm font-medium">Recent executions</h2>
          <Link
            to="/executions"
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            View all
          </Link>
        </div>

        {isError && !data ? (
          <div className="px-5 pb-5">
            <ErrorState what="recent executions" error={error} onRetry={() => void refetch()} />
          </div>
        ) : !data ? (
          <div className="space-y-3 px-5 pb-5">
            {Array.from({ length: 5 }, (_, index) => (
              <Skeleton key={index} className="h-8 w-full" />
            ))}
          </div>
        ) : data.data.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState
              icon={Inbox}
              title="No executions yet"
              description="Run a workflow to see its executions here."
              className="py-10"
              action={
                <Link
                  to="/workflows"
                  className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-accent"
                >
                  Go to workflows
                </Link>
              }
            />
          </div>
        ) : (
          <div className="border-t">
            <ExecutionsTable rows={data.data} caption="Most recent workflow executions" />
          </div>
        )}
      </CardContent>
    </Card>
  );
}
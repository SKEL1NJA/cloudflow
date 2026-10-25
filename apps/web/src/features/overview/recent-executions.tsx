import { Inbox } from 'lucide-react';
import { Link, useNavigate } from 'react-router';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/layout/empty-state';
import { ErrorState } from '@/components/layout/error-state';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useNow } from '@/hooks/use-now';
import { formatDateTime, formatDuration, formatRelativeTime, shortExecutionId } from '@/lib/format';
import { useRecentExecutions } from '@/queries/executions';

const HEADERS = ['Execution', 'Workflow', 'Status', 'Duration', 'Started'];

export function RecentExecutions() {
  const navigate = useNavigate();
  const now = useNow(30_000);
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
          <div className="overflow-x-auto border-t">
            <table className="w-full text-sm">
              <caption className="sr-only">Most recent workflow executions</caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  {HEADERS.map((header) => (
                    <th
                      key={header}
                      scope="col"
                      className="px-5 py-2 font-medium whitespace-nowrap"
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((execution) => {
                  const started = execution.startedAt ?? execution.createdAt;
                  return (
                    <tr
                      key={execution.id}
                      onClick={() => void navigate(`/executions/${execution.id}`)}
                      className="cursor-pointer transition-colors hover:bg-accent/50"
                    >
                      <td className="px-5 py-2.5 whitespace-nowrap">
                        <Link
                          to={`/executions/${execution.id}`}
                          onClick={(event) => event.stopPropagation()}
                          className="font-mono text-xs outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          {shortExecutionId(execution.id)}
                        </Link>
                      </td>
                      <td className="max-w-64 truncate px-5 py-2.5">{execution.workflowName}</td>
                      <td className="px-5 py-2.5">
                        <StatusBadge status={execution.status} />
                      </td>
                      <td className="px-5 py-2.5 tabular-nums text-muted-foreground">
                        {formatDuration(execution.durationMs)}
                      </td>
                      <td
                        title={formatDateTime(started)}
                        className="px-5 py-2.5 whitespace-nowrap text-muted-foreground"
                      >
                        {formatRelativeTime(started, now)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

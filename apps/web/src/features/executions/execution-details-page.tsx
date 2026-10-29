import type { ExecutionDetail } from '@cloudflow/shared';
import { LoaderCircle, RotateCw, SearchX } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router';
import { ApiError } from '@/api/errors';
import { EmptyState } from '@/components/layout/empty-state';
import { ErrorState } from '@/components/layout/error-state';
import { PageHeader } from '@/components/layout/page-header';
import { StatusBadge } from '@/components/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { Stat } from '@/components/ui/stat';
import { useNow } from '@/hooks/use-now';
import { formatDateTime, formatDuration, shortExecutionId } from '@/lib/format';
import { LogLines } from './log-lines';
import { useCancelExecution, useRetryExecution } from './mutations';
import { isActive, useExecution, useExecutionLogs } from './queries';
import { StepTimeline } from './step-timeline';

function ElapsedTime({ startedAt }: { startedAt: string }) {
  const now = useNow(1000);
  return <>{formatDuration(Math.max(0, now - Date.parse(startedAt)))}</>;
}

function DurationText({ execution }: { execution: ExecutionDetail }) {
  if (execution.durationMs !== null) return <>{formatDuration(execution.durationMs)}</>;
  if (isActive(execution.status) && execution.startedAt)
    return <ElapsedTime startedAt={execution.startedAt} />;
  return <>-</>;
}

function ExecutionNotFound() {
  return (
    <>
      <PageHeader title="Execution not found" />
      <EmptyState
        icon={SearchX}
        title="This execution doesn't exist"
        description="It may have been deleted along with its workflow, or the link is wrong."
        action={
          <Link to="/executions" className={buttonVariants({ variant: 'outline' })}>
            Back to executions
          </Link>
        }
      />
    </>
  );
}

function DetailsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading execution">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {Array.from({ length: 5 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function ExecutionDetailsPage() {
  const { id = '' } = useParams();
  const { data: execution, error, isError, refetch } = useExecution(id);
  const active = isActive(execution?.status);
  const logsQuery = useExecutionLogs(id, active);
  const cancel = useCancelExecution();
  const retry = useRetryExecution();
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const logs = useMemo(() => [...(logsQuery.data?.data ?? [])].reverse(), [logsQuery.data]);
  const executionLogs = logs.filter((entry) => entry.stepExecutionId === null);

  if (isError && !execution) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return <ExecutionNotFound />;
    }
    return <ErrorState what="this execution" error={error} onRetry={() => void refetch()} />;
  }
  if (!execution) return <DetailsSkeleton />;

  const failed = execution.status === 'FAILED';
  const started = execution.startedAt ?? execution.createdAt;

  return (
    <>
      <PageHeader
        title={`Execution ${shortExecutionId(execution.id)}`}
        actions={
          <>
            {failed ? (
              <Button disabled={retry.isPending} onClick={() => retry.mutate(execution.id)}>
                {retry.isPending ? (
                  <LoaderCircle className="animate-spin" aria-hidden="true" />
                ) : (
                  <RotateCw aria-hidden="true" />
                )}
                Retry execution
              </Button>
            ) : null}
            {active ? (
              <Button variant="outline" onClick={() => setConfirmingCancel(true)}>
                Cancel
              </Button>
            ) : null}
          </>
        }
      />

      <dl className="mb-6 grid grid-cols-2 gap-4 lg:grid-cols-5">
        <Stat label="Status">
          <StatusBadge status={execution.status} />
        </Stat>
        <Stat label="Workflow">
          <Link to={`/workflows/${execution.workflowId}`} className="font-medium hover:underline">
            {execution.workflowName}
          </Link>
        </Stat>
        <Stat label="Started">
          <time dateTime={started}>{formatDateTime(started)}</time>
        </Stat>
        <Stat label="Duration">
          <DurationText execution={execution} />
        </Stat>
        <Stat label="Attempts">
          <span className="tabular-nums">{execution.attempts}</span>
          <span className="ml-1.5 text-xs text-muted-foreground">
            across {execution.stepCount} steps
          </span>
        </Stat>
      </dl>

      {failed && execution.error ? (
        <div
          role="alert"
          className="mb-6 rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
        >
          {execution.error}
        </div>
      ) : null}

      <section aria-labelledby="steps-heading">
        <h2 id="steps-heading" className="mb-4 text-sm font-medium">
          Steps
        </h2>
        <StepTimeline
          execution={execution}
          logs={logs}
          canRetry={failed}
          retrying={retry.isPending}
          onRetry={() => retry.mutate(execution.id)}
        />
      </section>

      <section aria-labelledby="execution-log-heading" className="mt-8">
        <div className="mb-3 flex items-center justify-between">
          <h2 id="execution-log-heading" className="text-sm font-medium">
            Execution log
          </h2>
          <Link
            to={`/logs?execution=${execution.id}`}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Open in log viewer
          </Link>
        </div>
        {logsQuery.isError && !logsQuery.data ? (
          <ErrorState
            what="the execution log"
            error={logsQuery.error}
            onRetry={() => void logsQuery.refetch()}
          />
        ) : !logsQuery.data ? (
          <Skeleton className="h-24 w-full" />
        ) : (
          <>
            <LogLines entries={executionLogs} />
            {logsQuery.data.nextCursor ? (
              <p className="mt-2 text-xs text-muted-foreground">
                Showing the 200 most recent log lines.
              </p>
            ) : null}
          </>
        )}
      </section>

      <ConfirmDialog
        open={confirmingCancel}
        onOpenChange={setConfirmingCancel}
        title="Cancel this execution?"
        description="Steps that haven't started are skipped. A step that is already running will finish first."
        confirmLabel="Cancel execution"
        cancelLabel="Keep running"
        pending={cancel.isPending}
        onConfirm={() =>
          cancel.mutate(execution.id, { onSettled: () => setConfirmingCancel(false) })
        }
      />
    </>
  );
}

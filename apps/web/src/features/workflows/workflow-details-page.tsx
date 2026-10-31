import type { WorkflowDetail } from '@cloudflow/shared';
import { Ellipsis, Inbox, LoaderCircle, Play } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { z } from 'zod';
import { ApiError } from '@/api/errors';
import { StatusBadge } from '@/components/status-badge';
import { EmptyState } from '@/components/layout/empty-state';
import { ErrorState } from '@/components/layout/error-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Stat } from '@/components/ui/stat';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ExecutionsTable } from '@/features/executions/executions-table';
import { useNow } from '@/hooks/use-now';
import { formatDateTime, formatDuration, formatRelativeTime } from '@/lib/format';
import { useWorkflowExecutions } from '@/queries/executions';
import { useWorkflow } from '@/queries/workflows';
import { DeleteWorkflowDialog } from './delete-workflow-dialog';
import { newRunVariables, useRunWorkflow, useToggleWorkflow } from './mutations';
import { StepFlow } from './step-flow';
import { maskedDefinition } from './step-summary';
import { WorkflowNotFound } from './workflow-not-found';

const tabSchema = z.enum(['overview', 'executions', 'configuration']).catch('overview');

function OverviewTab({ workflow }: { workflow: WorkflowDetail }) {
  const now = useNow(30_000);

  return (
    <div className="space-y-8">
      <dl className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <Stat label="Steps">
          <span className="text-2xl font-semibold tabular-nums">{workflow.stepCount}</span>
        </Stat>

        <Stat label="Success rate">
          <span className="text-2xl font-semibold tabular-nums">
            {workflow.successRate === null ? '-' : `${Math.round(workflow.successRate * 100)}%`}
          </span>
          <span className="ml-2 text-xs text-muted-foreground">
            {workflow.finishedRuns} runs in 30 days
          </span>
        </Stat>

        <Stat label="Last run">
          {workflow.lastRun ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusBadge status={workflow.lastRun.status} />
              <span
                className="text-xs text-muted-foreground"
                title={formatDateTime(workflow.lastRun.at)}
              >
                {formatRelativeTime(workflow.lastRun.at, now)}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">Never run</span>
          )}
        </Stat>

        <Stat label="Retries">
          {workflow.maxAttempts} {workflow.maxAttempts === 1 ? 'attempt' : 'attempts'},{' '}
          {formatDuration(workflow.backoffBaseMs)} backoff
        </Stat>
      </dl>

      <section>
        <h2 className="mb-4 text-sm font-medium">Flow</h2>
        <Card>
          <CardContent className="p-5">
            <StepFlow steps={workflow.steps} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function ExecutionsTab({ workflowId }: { workflowId: string }) {
  const { data, error, isError, refetch } = useWorkflowExecutions(workflowId);

  if (isError && !data) {
    return (
      <ErrorState what="this workflow's executions" error={error} onRetry={() => void refetch()} />
    );
  }

  if (!data) return <Skeleton className="h-48 w-full" />;

  if (data.data.length === 0) {
    return (
      <EmptyState
        icon={Inbox}
        title="This workflow hasn't run yet"
        description="Run it, and its executions will show up here."
      />
    );
  }

  return (
    <Card>
      <ExecutionsTable
        rows={data.data}
        caption="Executions of this workflow"
        showWorkflow={false}
      />
    </Card>
  );
}

function ConfigurationTab({ workflow }: { workflow: WorkflowDetail }) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-muted-foreground">Header values are hidden.</p>
      <pre
        tabIndex={0}
        role="group"
        aria-label="Workflow definition"
        className="overflow-x-auto rounded-lg border bg-card p-4 font-mono text-xs leading-relaxed"
      >
        {JSON.stringify(maskedDefinition(workflow), null, 2)}
      </pre>
    </div>
  );
}

function DetailsSkeleton() {
  return (
    <div className="space-y-6" role="status" aria-label="Loading workflow">
      <Skeleton className="h-8 w-64" />
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <Skeleton key={index} className="h-20 w-full" />
        ))}
      </div>
      <Skeleton className="h-64 w-full" />
    </div>
  );
}

export function WorkflowDetailsPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const [search, setSearch] = useSearchParams();
  const tab = tabSchema.parse(search.get('tab') ?? undefined);
  const { data: workflow, error, isError, refetch } = useWorkflow(id);
  const toggle = useToggleWorkflow();
  const run = useRunWorkflow();
  const [confirmingDelete, setConfirmingDelete] = useState(false);

  function selectTab(next: string) {
    setSearch(
      (current) => {
        const updated = new URLSearchParams(current);
        updated.set('tab', next);
        return updated;
      },
      { replace: true },
    );
  }

  if (isError && !workflow) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return <WorkflowNotFound />;
    }

    return <ErrorState what="this workflow" error={error} onRetry={() => void refetch()} />;
  }

  if (!workflow) return <DetailsSkeleton />;

  return (
    <>
      <PageHeader
        title={workflow.name}
        {...(workflow.description ? { description: workflow.description } : {})}
        actions={
          <>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={workflow.enabled}
                disabled={toggle.isPending}
                onCheckedChange={(enabled) => toggle.mutate({ id: workflow.id, enabled })}
              />
              Enabled
            </label>

            <Link
              to={`/workflows/${workflow.id}/edit`}
              className={buttonVariants({ variant: 'outline' })}
            >
              Edit
            </Link>

            <Button
              disabled={!workflow.enabled || run.isPending}
              title={workflow.enabled ? undefined : 'Enable the workflow to run it'}
              onClick={() => run.mutate(newRunVariables(workflow.id))}
            >
              {run.isPending ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : (
                <Play aria-hidden="true" />
              )}
              Run workflow
            </Button>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" aria-label="More actions">
                  <Ellipsis aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>

              <DropdownMenuContent>
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <Tabs value={tab} onValueChange={selectTab}>
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="executions">Executions</TabsTrigger>
          <TabsTrigger value="configuration">Configuration</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <OverviewTab workflow={workflow} />
        </TabsContent>

        <TabsContent value="executions">
          <ExecutionsTab workflowId={workflow.id} />
        </TabsContent>

        <TabsContent value="configuration">
          <ConfigurationTab workflow={workflow} />
        </TabsContent>
      </Tabs>

      <DeleteWorkflowDialog
        workflow={workflow}
        open={confirmingDelete}
        onOpenChange={setConfirmingDelete}
        onDeleted={() => void navigate('/workflows')}
      />
    </>
  );
}

import { useParams } from 'react-router';
import { ApiError } from '@/api/errors';
import { ErrorState } from '@/components/layout/error-state';
import { Skeleton } from '@/components/ui/skeleton';
import { useWorkflow } from '@/queries/workflows';
import { emptyWorkflow, toFormValues } from './builder/form-values';
import { WorkflowForm } from './builder/workflow-form';
import { WorkflowNotFound } from './workflow-not-found';

export function CreateWorkflowPage() {
  return (
    <WorkflowForm
      mode="create"
      title="Create workflow"
      description="Define the steps CloudFlow runs, in order."
      initialValues={emptyWorkflow()}
    />
  );
}

export function EditWorkflowPage() {
  const { id = '' } = useParams();
  const { data: workflow, error, isError, refetch } = useWorkflow(id);

  if (isError && !workflow) {
    if (error instanceof ApiError && (error.status === 404 || error.status === 400)) {
      return <WorkflowNotFound />;
    }
    return <ErrorState what="this workflow" error={error} onRetry={() => void refetch()} />;
  }
  if (!workflow) {
    return (
      <div className="space-y-6" role="status" aria-label="Loading workflow">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-48 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <WorkflowForm
      key={workflow.id}
      mode="edit"
      workflowId={workflow.id}
      title={`Edit ${workflow.name}`}
      description="Saving replaces the workflow's steps. Past executions keep the steps they ran with."
      initialValues={toFormValues(workflow)}
    />
  );
}

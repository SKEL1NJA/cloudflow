import type { Paginated, WorkflowDetail, WorkflowSummary } from '@cloudflow/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router';
import { toast } from 'sonner';
import { describeError } from '@/api/errors';
import { deleteWorkflow, patchWorkflow, runWorkflow } from '@/api/workflows';
import { queryKeys } from '@/queries/keys';

interface ToggleVariables {
  id: string;
  enabled: boolean;
}

export function useToggleWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: ({ id, enabled }: ToggleVariables) => patchWorkflow(id, { enabled }),

    onMutate: async ({ id, enabled }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.workflows.all });

      const lists = queryClient.getQueriesData<Paginated<WorkflowSummary>>({
        queryKey: queryKeys.workflows.lists,
      });
      const detail = queryClient.getQueryData<WorkflowDetail>(queryKeys.workflows.detail(id));

      queryClient.setQueriesData<Paginated<WorkflowSummary>>(
        { queryKey: queryKeys.workflows.lists },
        (page) =>
          page && {
            ...page,
            data: page.data.map((workflow) => (workflow.id === id ? { ...workflow, enabled } : workflow)),
          },
      );
      queryClient.setQueryData<WorkflowDetail>(
        queryKeys.workflows.detail(id),
        (current) => current && { ...current, enabled },
      );

      return { lists, detail };
    },

    onError: (error, { id }, context) => {
      for (const [key, data] of context?.lists ?? []) queryClient.setQueryData(key, data);
      if (context?.detail) queryClient.setQueryData(queryKeys.workflows.detail(id), context.detail);
      toast.error('Could not update the workflow', { description: describeError(error) });
    },

    onSuccess: (_workflow, { enabled }) => {
      toast.success(enabled ? 'Workflow enabled' : 'Workflow disabled');
    },

    onSettled: (_workflow, _error, { id }) => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflows.lists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflows.detail(id) });
    },
  });
}

export function useDeleteWorkflow() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => deleteWorkflow(id),

    onSuccess: (_result, id) => {
      toast.success('Workflow deleted');
      queryClient.removeQueries({ queryKey: queryKeys.workflows.detail(id) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflows.lists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.executions.lists });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },

    onError: (error) => {
      toast.error('Could not delete the workflow', { description: describeError(error) });
    },
  });
}

export interface RunVariables {
  id: string;
  idempotencyKey: string;
}

export function newRunVariables(id: string): RunVariables {
  return { id, idempotencyKey: crypto.randomUUID() };
}

export function useRunWorkflow() {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  return useMutation({
    mutationFn: ({ id, idempotencyKey }: RunVariables) => runWorkflow(id, idempotencyKey),

    onSuccess: (execution) => {
      toast.success('Execution started', {
        description: `${execution.workflowName} is queued.`,
        action: { label: 'View', onClick: () => void navigate(`/executions/${execution.id}`) },
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.executions.lists });
      void queryClient.invalidateQueries({ queryKey: queryKeys.workflows.lists });
      void queryClient.invalidateQueries({ queryKey: ['overview'] });
    },

    onError: (error) => {
      toast.error('Could not start the workflow', { description: describeError(error) });
    },
  });
}
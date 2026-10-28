import type { ExecutionDetail } from '@cloudflow/shared';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { describeError } from '@/api/errors';
import { cancelExecution, retryExecution } from '@/api/executions';
import { queryKeys } from '@/queries/keys';

function useApplyChange() {
  const queryClient = useQueryClient();

  return (execution: ExecutionDetail) => {
    queryClient.setQueryData(queryKeys.executions.detail(execution.id), execution);
    void queryClient.invalidateQueries({ queryKey: queryKeys.executions.logs(execution.id) });
    void queryClient.invalidateQueries({ queryKey: queryKeys.executions.lists });
    void queryClient.invalidateQueries({ queryKey: queryKeys.workflows.lists });
    void queryClient.invalidateQueries({ queryKey: ['overview'] });
    void queryClient.invalidateQueries({ queryKey: ['stats'] });
  };
}

export function useCancelExecution() {
  const queryClient = useQueryClient();
  const applyChange = useApplyChange();

  return useMutation({
    mutationFn: (id: string) => cancelExecution(id),
    onSuccess: (execution) => {
      applyChange(execution);
      toast.success('Execution cancelled');
    },
    onError: (error, id) => {
      toast.error('Could not cancel the execution', { description: describeError(error) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.executions.detail(id) });
    },
  });
}

export function useRetryExecution() {
  const queryClient = useQueryClient();
  const applyChange = useApplyChange();

  return useMutation({
    mutationFn: (id: string) => retryExecution(id),
    onSuccess: (execution) => {
      applyChange(execution);
      toast.success('Retrying from the failed step');
    },
    onError: (error, id) => {
      toast.error('Could not retry the execution', { description: describeError(error) });
      void queryClient.invalidateQueries({ queryKey: queryKeys.executions.detail(id) });
    },
  });
}

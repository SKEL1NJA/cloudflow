import type { RealtimeEvent } from '@cloudflow/shared';
import type { QueryClient, QueryKey } from '@tanstack/react-query';
import { queryKeys } from '@/queries/keys';

export interface Invalidator {
  handleEvent: (event: RealtimeEvent) => void;
  handleResync: () => void;
  dispose: () => void;
}

export function createInvalidator(queryClient: QueryClient, delayMs = 300): Invalidator {
  const pending = new Map<string, QueryKey>();
  let timer: ReturnType<typeof setTimeout> | undefined;

  function flush(): void {
    timer = undefined;
    const keys = [...pending.values()];
    pending.clear();
    for (const queryKey of keys) void queryClient.invalidateQueries({ queryKey });
  }

  function schedule(queryKey: QueryKey): void {
    pending.set(JSON.stringify(queryKey), queryKey);
    timer ??= setTimeout(flush, delayMs);
  }

  function reset(): void {
    clearTimeout(timer);
    timer = undefined;
    pending.clear();
  }

  return {
    handleEvent(event) {
      if (event.type === 'execution.updated') {
        schedule(['overview']);
        schedule(['stats']);
        schedule(queryKeys.executions.lists);
        schedule(queryKeys.workflows.lists);
        schedule(queryKeys.workflows.detail(event.workflowId));
      }
      schedule(queryKeys.executions.detail(event.executionId));
      schedule(queryKeys.executions.logs(event.executionId));
      schedule(queryKeys.queue.all);
    },

    handleResync() {
      reset();
      void queryClient.invalidateQueries();
    },

    dispose: reset,
  };
}

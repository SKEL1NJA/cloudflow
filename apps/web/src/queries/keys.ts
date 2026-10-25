import type { StatsRange } from '@cloudflow/shared';
import type { ExecutionListParams } from '@/api/executions';

export const queryKeys = {
  overview: (range: StatsRange) => ['overview', range] as const,
  executionSeries: (range: StatsRange) => ['stats', 'executions', range] as const,
  executions: {
    lists: ['executions', 'list'] as const,
    list: (params: ExecutionListParams) => ['executions', 'list', params] as const,
    detail: (id: string) => ['executions', 'detail', id] as const,
  },
};

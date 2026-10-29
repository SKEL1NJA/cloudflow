import type { StatsRange } from '@cloudflow/shared';
import type { WorkflowListParams } from '@/api/workflows';

export const queryKeys = {
  overview: (range: StatsRange) => ['overview', range] as const,
  executionSeries: (range: StatsRange) => ['stats', 'executions', range] as const,

  executions: {
    lists: ['executions', 'list'] as const,
    list: (params: object) => ['executions', 'list', params] as const,
    detail: (id: string) => ['executions', 'detail', id] as const,
    logs: (id: string) => ['executions', 'logs', id] as const,
  },

  workflows: {
    all: ['workflows'] as const,
    lists: ['workflows', 'list'] as const,
    list: (params: WorkflowListParams) => ['workflows', 'list', params] as const,
    detail: (id: string) => ['workflows', 'detail', id] as const,
    options: ['workflows', 'options'] as const,
  },

  workers: ['workers'] as const,

  queue: {
    all: ['queue'] as const,
    counts: ['queue', 'counts'] as const,
    activity: (range: StatsRange) => ['queue', 'activity', range] as const,
  },

  logs: {
    list: (params: object) => ['logs', 'list', params] as const,
  },

  account: {
    sessions: ['account', 'sessions'] as const,
  },

  apiKeys: ['api-keys'] as const,
};

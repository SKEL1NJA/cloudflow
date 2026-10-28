import { EXECUTION_STATUSES } from '@cloudflow/shared';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { z } from 'zod';
import type { ExecutionListParams } from '@/api/executions';

export const PAGE_SIZE = 20;

export const WHEN_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
] as const;

export const DURATION_OPTIONS = [
  { value: '', label: 'Any duration' },
  { value: 'lt1s', label: 'Under 1 second' },
  { value: '1to10s', label: '1 to 10 seconds' },
  { value: '10to60s', label: '10 to 60 seconds' },
  { value: 'gt1m', label: 'Over 1 minute' },
] as const;

const WHEN_MS = {
  '1h': 3_600_000,
  '24h': 86_400_000,
  '7d': 604_800_000,
  '30d': 2_592_000_000,
} as const;

const DURATION_BOUNDS: Record<
  'lt1s' | '1to10s' | '10to60s' | 'gt1m',
  { min?: number; max?: number }
> = {
  lt1s: { max: 999 },
  '1to10s': { min: 1000, max: 9999 },
  '10to60s': { min: 10_000, max: 59_999 },
  gt1m: { min: 60_000 },
};

const urlSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  status: z.enum(EXECUTION_STATUSES).optional().catch(undefined),
  workflow: z.uuid().optional().catch(undefined),
  when: z.enum(['1h', '24h', '7d', '30d']).optional().catch(undefined),
  duration: z.enum(['lt1s', '1to10s', '10to60s', 'gt1m']).optional().catch(undefined),
});

export type ExecutionFilters = z.infer<typeof urlSchema>;

export function parseFilters(search: URLSearchParams): ExecutionFilters {
  return urlSchema.parse(Object.fromEntries(search));
}

export function applyFilterPatch(
  current: URLSearchParams,
  patch: Partial<ExecutionFilters>,
): URLSearchParams {
  const next = { ...parseFilters(current), ...patch };
  if (!('page' in patch)) next.page = 1;

  const result = new URLSearchParams();
  if (next.page !== 1) result.set('page', String(next.page));
  if (next.status) result.set('status', next.status);
  if (next.workflow) result.set('workflow', next.workflow);
  if (next.when) result.set('when', next.when);
  if (next.duration) result.set('duration', next.duration);
  return result;
}

export function hasFilters(filters: ExecutionFilters): boolean {
  return Boolean(filters.status || filters.workflow || filters.when || filters.duration);
}

export function toApiParams(filters: ExecutionFilters, nowMs: number): ExecutionListParams {
  const bounds = filters.duration ? DURATION_BOUNDS[filters.duration] : undefined;

  return {
    page: filters.page,
    pageSize: PAGE_SIZE,
    ...(filters.status && { status: filters.status }),
    ...(filters.workflow && { workflowId: filters.workflow }),
    ...(filters.when && { from: new Date(nowMs - WHEN_MS[filters.when]).toISOString() }),
    ...(bounds?.min !== undefined && { minDurationMs: bounds.min }),
    ...(bounds?.max !== undefined && { maxDurationMs: bounds.max }),
  };
}

export function useExecutionFilters() {
  const [search, setSearch] = useSearchParams();
  const filters = useMemo(() => parseFilters(search), [search]);

  const update = useCallback(
    (patch: Partial<ExecutionFilters>, options?: { replace?: boolean }) => {
      setSearch((current) => applyFilterPatch(current, patch), {
        replace: options?.replace ?? false,
      });
    },
    [setSearch],
  );

  return { filters, update };
}

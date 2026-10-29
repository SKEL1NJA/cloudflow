import { LOG_LEVELS } from '@cloudflow/shared';
import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { z } from 'zod';
import type { LogParams } from '@/api/logs';

export const PAGE_LIMIT = 200;

export const LEVEL_OPTIONS = [
  { value: '', label: 'All levels' },
  ...LOG_LEVELS.map((level) => ({ value: level, label: level })),
] as const;

export const WHEN_OPTIONS = [
  { value: '', label: 'Any time' },
  { value: '15m', label: 'Last 15 minutes' },
  { value: '1h', label: 'Last hour' },
  { value: '24h', label: 'Last 24 hours' },
  { value: '7d', label: 'Last 7 days' },
] as const;

const WHEN_MS = { '15m': 900_000, '1h': 3_600_000, '24h': 86_400_000, '7d': 604_800_000 } as const;

const urlSchema = z.object({
  q: z.string().trim().max(200).catch(''),
  level: z.enum(LOG_LEVELS).optional().catch(undefined),
  workflow: z.uuid().optional().catch(undefined),
  execution: z.uuid().optional().catch(undefined),
  when: z.enum(['15m', '1h', '24h', '7d']).optional().catch(undefined),
  live: z
    .enum(['on', 'off'])
    .catch('on')
    .transform((value) => value === 'on'),
});

export type LogFilters = z.infer<typeof urlSchema>;
export type QueryFilters = Omit<LogFilters, 'live'>;

export function parseLogFilters(search: URLSearchParams): LogFilters {
  return urlSchema.parse(Object.fromEntries(search));
}

export function applyLogPatch(
  current: URLSearchParams,
  patch: Partial<LogFilters>,
): URLSearchParams {
  const next = { ...parseLogFilters(current), ...patch };

  const result = new URLSearchParams();
  if (next.q !== '') result.set('q', next.q);
  if (next.level) result.set('level', next.level);
  if (next.workflow) result.set('workflow', next.workflow);
  if (next.execution) result.set('execution', next.execution);
  if (next.when) result.set('when', next.when);
  if (!next.live) result.set('live', 'off');
  return result;
}

export function hasLogFilters(filters: QueryFilters): boolean {
  return Boolean(
    filters.q || filters.level || filters.workflow || filters.execution || filters.when,
  );
}

export function toLogParams(filters: QueryFilters, nowMs: number, cursor?: string): LogParams {
  return {
    limit: PAGE_LIMIT,
    ...(filters.q !== '' && { search: filters.q }),
    ...(filters.level && { level: filters.level }),
    ...(filters.workflow && { workflowId: filters.workflow }),
    ...(filters.execution && { executionId: filters.execution }),
    ...(filters.when && { from: new Date(nowMs - WHEN_MS[filters.when]).toISOString() }),
    ...(cursor && { cursor }),
  };
}

export function useLogFilters() {
  const [search, setSearch] = useSearchParams();
  const filters = useMemo(() => parseLogFilters(search), [search]);

  const update = useCallback(
    (patch: Partial<LogFilters>, options?: { replace?: boolean }) => {
      setSearch((current) => applyLogPatch(current, patch), { replace: options?.replace ?? false });
    },
    [setSearch],
  );

  return { filters, update };
}

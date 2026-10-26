import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { z } from 'zod';
import type { WorkflowListParams } from '@/api/workflows';

export const PAGE_SIZE = 20;

const urlSchema = z.object({
  page: z.coerce.number().int().min(1).catch(1),
  q: z.string().trim().max(100).catch(''),
  status: z.enum(['all', 'enabled', 'disabled']).catch('all'),
  sort: z.enum(['name', 'updatedAt', 'createdAt']).catch('updatedAt'),
  order: z.enum(['asc', 'desc']).catch('desc'),
});

export type ListParams = z.infer<typeof urlSchema>;

const DEFAULTS = urlSchema.parse({});

export function parseListParams(search: URLSearchParams): ListParams {
  return urlSchema.parse(Object.fromEntries(search));
}

export function applyListPatch(current: URLSearchParams, patch: Partial<ListParams>): URLSearchParams {
  const next = { ...parseListParams(current), ...patch };
  if (!('page' in patch)) next.page = 1;

  const result = new URLSearchParams();
  if (next.page !== DEFAULTS.page) result.set('page', String(next.page));
  if (next.q !== DEFAULTS.q) result.set('q', next.q);
  if (next.status !== DEFAULTS.status) result.set('status', next.status);
  if (next.sort !== DEFAULTS.sort) result.set('sort', next.sort);
  if (next.order !== DEFAULTS.order) result.set('order', next.order);
  return result;
}

export function toApiParams(params: ListParams): WorkflowListParams {
  return {
    page: params.page,
    pageSize: PAGE_SIZE,
    sortBy: params.sort,
    sortOrder: params.order,
    ...(params.q !== '' && { search: params.q }),
    ...(params.status !== 'all' && { enabled: params.status === 'enabled' }),
  };
}

export function useWorkflowListParams() {
  const [search, setSearch] = useSearchParams();
  const params = useMemo(() => parseListParams(search), [search]);

  const update = useCallback(
    (patch: Partial<ListParams>, options?: { replace?: boolean }) => {
      setSearch((current) => applyListPatch(current, patch), { replace: options?.replace ?? false });
    },
    [setSearch],
  );

  return { params, update };
}
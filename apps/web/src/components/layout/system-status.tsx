import { useQuery } from '@tanstack/react-query';
import { ApiError } from '@/api/errors';
import { request } from '@/api/client';
import { cn } from '@/lib/utils';

type Status = 'checking' | 'operational' | 'degraded' | 'unreachable';

const PRESENTATION: Record<Status, { label: string; dot: string }> = {
  checking: { label: 'Checking status', dot: 'bg-muted-foreground/40' },
  operational: { label: 'All systems operational', dot: 'bg-success' },
  degraded: { label: 'Degraded', dot: 'bg-warning' },
  unreachable: { label: 'API unreachable', dot: 'bg-danger' },
};

function useSystemStatus(): Status {
  const query = useQuery({
    queryKey: ['system', 'ready'],
    queryFn: ({ signal }) => request<unknown>('/health/ready', { auth: false, signal }),
    refetchInterval: 30_000,
    retry: false,
  });

  if (query.isSuccess) return 'operational';
  if (query.isError) {
    return query.error instanceof ApiError && query.error.status === 503 ? 'degraded' : 'unreachable';
  }
  return 'checking';
}

export function SystemStatus({ className }: { className?: string }) {
  const { label, dot } = PRESENTATION[useSystemStatus()];

  return (
    <div role="status" className={cn('flex items-center gap-2', className)}>
      <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />
      <span className="text-xs text-muted-foreground">{label}</span>
    </div>
  );
}
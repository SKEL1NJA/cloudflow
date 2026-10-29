import { Skeleton } from '@/components/ui/skeleton';
import { formatCount } from '@/lib/format';
import { cn } from '@/lib/utils';

export type Tone = 'neutral' | 'running' | 'success' | 'warning' | 'danger';

const DOT: Record<Tone, string> = {
  neutral: 'bg-muted-foreground/40',
  running: 'bg-running',
  success: 'bg-success',
  warning: 'bg-warning',
  danger: 'bg-danger',
};

interface MetricCardProps {
  label: string;
  value: number | string | undefined;
  hint: string | undefined;
  tone: Tone;
  dimmed?: boolean;
}

export function MetricCard({ label, value, hint, tone, dimmed = false }: MetricCardProps) {
  return (
    <div role="group" aria-label={label} className="rounded-lg border bg-card p-4 shadow-xs">
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <span className={cn('size-2 rounded-full', DOT[tone])} aria-hidden="true" />
        {label}
      </div>
      <div className={cn('mt-2 transition-opacity', dimmed && 'opacity-60')}>
        {value === undefined ? (
          <Skeleton className="h-8 w-16" />
        ) : (
          <p className="text-2xl font-semibold tracking-tight tabular-nums">
            {typeof value === 'number' ? formatCount(value) : value}
          </p>
        )}
        {hint === undefined ? (
          <Skeleton className="mt-2 h-3 w-24" />
        ) : (
          <p className="mt-1 text-xs text-muted-foreground">{hint}</p>
        )}
      </div>
    </div>
  );
}

import { cn } from '@/lib/utils';
import { useRealtimeStatus } from '@/realtime/provider';
import type { RealtimeStatus } from '@/realtime/client';

const PRESENTATION: Record<RealtimeStatus, { label: string; dot: string }> = {
  live: { label: 'Live', dot: 'bg-success' },
  connecting: { label: 'Connecting', dot: 'bg-warning' },
  reconnecting: { label: 'Reconnecting', dot: 'bg-warning' },
  stopped: { label: 'Paused', dot: 'bg-muted-foreground/40' },
};

export function LiveIndicator({ className }: { className?: string }) {
  const { label, dot } = PRESENTATION[useRealtimeStatus()];

  return (
    <div title="Real-time updates" className={cn('flex items-center gap-2', className)}>
      <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />
      <span className="sr-only text-xs text-muted-foreground sm:not-sr-only">{label}</span>
    </div>
  );
}

import type { WorkerStatus } from '@cloudflow/shared';
import { Activity, CircleCheck, CircleOff, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

const PRESENTATION: Record<WorkerStatus, { label: string; icon: LucideIcon; className: string }> = {
  online: { label: 'Online', icon: CircleCheck, className: 'bg-success/10 text-success' },
  busy: { label: 'Busy', icon: Activity, className: 'bg-running/10 text-running' },
  offline: { label: 'Offline', icon: CircleOff, className: 'bg-muted text-muted-foreground' },
};

export function WorkerStatusBadge({ status }: { status: WorkerStatus }) {
  const { label, icon: Icon, className } = PRESENTATION[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      <Icon className="size-3.5" aria-hidden="true" />
      {label}
    </span>
  );
}

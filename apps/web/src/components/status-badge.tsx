import type { ExecutionStatus } from '@cloudflow/shared';
import { Ban, CircleCheck, CircleX, Clock, LoaderCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Presentation {
  label: string;
  icon: LucideIcon;
  className: string;
  spin?: boolean;
}

const PRESENTATION: Record<ExecutionStatus, Presentation> = {
  QUEUED: { label: 'Queued', icon: Clock, className: 'bg-muted text-muted-foreground' },
  RUNNING: {
    label: 'Running',
    icon: LoaderCircle,
    className: 'bg-running/10 text-running',
    spin: true,
  },
  SUCCESS: { label: 'Success', icon: CircleCheck, className: 'bg-success/10 text-success' },
  FAILED: { label: 'Failed', icon: CircleX, className: 'bg-danger/10 text-danger' },
  CANCELLED: { label: 'Cancelled', icon: Ban, className: 'bg-muted text-muted-foreground' },
};

export function StatusBadge({ status }: { status: ExecutionStatus }) {
  const { label, icon: Icon, className, spin } = PRESENTATION[status];

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-medium',
        className,
      )}
    >
      <Icon className={cn('size-3.5', spin && 'animate-spin')} aria-hidden="true" />
      {label}
    </span>
  );
}

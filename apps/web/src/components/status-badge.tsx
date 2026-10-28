import type { ExecutionStatus, StepExecutionStatus } from '@cloudflow/shared';
import {
  Ban,
  CircleCheck,
  CircleX,
  Clock,
  LoaderCircle,
  RotateCw,
  SkipForward,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

export type BadgeStatus = ExecutionStatus | StepExecutionStatus;

interface Presentation {
  label: string;
  icon: LucideIcon;
  className: string;
  spin?: boolean;
}

const MUTED = 'bg-muted text-muted-foreground';

export const STATUS_PRESENTATION: Record<BadgeStatus, Presentation> = {
  QUEUED: { label: 'Queued', icon: Clock, className: MUTED },
  PENDING: { label: 'Pending', icon: Clock, className: MUTED },
  RUNNING: {
    label: 'Running',
    icon: LoaderCircle,
    className: 'bg-running/10 text-running',
    spin: true,
  },
  RETRYING: { label: 'Retrying', icon: RotateCw, className: 'bg-warning/10 text-warning' },
  SUCCESS: { label: 'Success', icon: CircleCheck, className: 'bg-success/10 text-success' },
  FAILED: { label: 'Failed', icon: CircleX, className: 'bg-danger/10 text-danger' },
  CANCELLED: { label: 'Cancelled', icon: Ban, className: MUTED },
  SKIPPED: { label: 'Skipped', icon: SkipForward, className: MUTED },
};

export function StatusBadge({ status }: { status: BadgeStatus }) {
  const { label, icon: Icon, className, spin } = STATUS_PRESENTATION[status];

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

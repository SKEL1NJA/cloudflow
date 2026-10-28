import type { ExecutionDetail, LogEntry } from '@cloudflow/shared';
import { ChevronDown } from 'lucide-react';
import { useId, useState } from 'react';
import { STATUS_PRESENTATION, StatusBadge } from '@/components/status-badge';
import { formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { STEP_TYPE_LABELS } from '../workflows/step-summary';
import { StepPanel } from './step-panel';

interface StepTimelineProps {
  execution: ExecutionDetail;
  logs: LogEntry[];
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
}

export function StepTimeline({ execution, logs, canRetry, retrying, onRetry }: StepTimelineProps) {
  const [overrides, setOverrides] = useState<Record<string, boolean>>({});
  const baseId = useId();
  const lastIndex = execution.steps.length - 1;

  return (
    <ol aria-label="Execution steps">
      {execution.steps.map((step, index) => {
        const expanded =
          overrides[step.id] ?? (step.status === 'FAILED' || step.status === 'RETRYING');
        const panelId = `${baseId}-${step.id}`;
        const { icon: Icon, className, spin } = STATUS_PRESENTATION[step.status];

        return (
          <li key={step.id} className="relative flex gap-4 pb-4 last:pb-0">
            {index < lastIndex ? (
              <span
                className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-border"
                aria-hidden="true"
              />
            ) : null}
            <div
              className={cn(
                'z-10 flex size-8 shrink-0 items-center justify-center rounded-full',
                className,
              )}
              aria-hidden="true"
            >
              <Icon className={cn('size-4', spin && 'animate-spin')} />
            </div>
            <div className="min-w-0 flex-1 rounded-lg border bg-card shadow-xs">
              <h3>
                <button
                  type="button"
                  aria-expanded={expanded}
                  aria-controls={panelId}
                  onClick={() => setOverrides((current) => ({ ...current, [step.id]: !expanded }))}
                  className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 rounded-lg px-4 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <span className="text-sm font-medium">{step.name}</span>
                  <span className="font-mono text-xs text-muted-foreground">
                    {STEP_TYPE_LABELS[step.type]}
                  </span>
                  <StatusBadge status={step.status} />
                  <span className="ml-auto flex items-center gap-3">
                    <span className="text-xs tabular-nums text-muted-foreground">
                      {formatDuration(step.durationMs)}
                    </span>
                    <ChevronDown
                      className={cn(
                        'size-4 text-muted-foreground transition-transform',
                        expanded && 'rotate-180',
                      )}
                      aria-hidden="true"
                    />
                  </span>
                </button>
              </h3>
              {expanded ? (
                <StepPanel
                  id={panelId}
                  execution={execution}
                  step={step}
                  logs={logs.filter((entry) => entry.stepExecutionId === step.id)}
                  canRetry={canRetry}
                  retrying={retrying}
                  onRetry={onRetry}
                />
              ) : null}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

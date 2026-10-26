import type { StepType, WorkflowStepView } from '@cloudflow/shared';
import { Bell, Globe, Shuffle, Timer, type LucideIcon } from 'lucide-react';
import { STEP_TYPE_LABELS, summarizeStep } from './step-summary';

const ICONS: Record<StepType, LucideIcon> = {
  HTTP_REQUEST: Globe,
  DELAY: Timer,
  TRANSFORM: Shuffle,
  NOTIFICATION: Bell,
};

export function StepFlow({ steps }: { steps: WorkflowStepView[] }) {
  return (
    <ol aria-label="Workflow steps">
      {steps.map((step, index) => {
        const Icon = ICONS[step.type];
        return (
          <li key={step.id} className="relative flex gap-4 pb-6 last:pb-0">
            {index < steps.length - 1 ? (
              <span className="absolute top-8 bottom-0 left-4 w-px -translate-x-1/2 bg-border" aria-hidden="true" />
            ) : null}
            <div className="z-10 flex size-8 shrink-0 items-center justify-center rounded-full border bg-card text-muted-foreground">
              <Icon className="size-4" aria-hidden="true" />
            </div>
            <div className="min-w-0 flex-1 pt-0.5">
              <p className="text-sm font-medium">{step.name}</p>
              <p className="truncate text-xs text-muted-foreground">
                <span className="font-mono">{STEP_TYPE_LABELS[step.type]}</span> · {summarizeStep(step)}
              </p>
            </div>
          </li>
        );
      })}
    </ol>
  );
}
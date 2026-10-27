import { STEP_TYPES } from '@cloudflow/shared';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useId } from 'react';
import { useFormContext, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { STEP_ICONS } from '../step-icons';
import { STEP_TYPE_LABELS } from '../step-summary';
import type { WorkflowFormValues } from './form-values';
import { StepConfigFields } from './step-fields';
import { useFieldError } from './use-field-error';

const TYPE_OPTIONS = STEP_TYPES.map((type) => ({ value: type, label: STEP_TYPE_LABELS[type] }));

interface StepCardProps {
  index: number;
  total: number;
  onMove: (from: number, to: number) => void;
  onRemove: (index: number) => void;
}

export function StepCard({ index, total, onMove, onRemove }: StepCardProps) {
  const { register, control } = useFormContext<WorkflowFormValues>();
  const fieldError = useFieldError();
  const base = useId();
  const type = useWatch({ control, name: `steps.${index}.type` });
  const Icon = STEP_ICONS[type];
  const position = index + 1;

  return (
    <div
      role="group"
      aria-label={`Step ${position}`}
      className="rounded-lg border bg-card shadow-xs"
    >
      <div className="flex items-center gap-3 border-b px-4 py-2.5">
        <span className="flex size-6 items-center justify-center rounded-full bg-muted text-xs font-medium tabular-nums">
          {position}
        </span>
        <Icon className="size-4 text-muted-foreground" aria-hidden="true" />
        <span className="text-sm font-medium">{STEP_TYPE_LABELS[type]}</span>
        <div className="ml-auto flex gap-1">
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Move step ${position} up`}
            disabled={index === 0}
            onClick={() => onMove(index, index - 1)}
          >
            <ArrowUp aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Move step ${position} down`}
            disabled={index === total - 1}
            onClick={() => onMove(index, index + 1)}
          >
            <ArrowDown aria-hidden="true" />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="size-8"
            aria-label={`Remove step ${position}`}
            onClick={() => onRemove(index)}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      <div className="grid gap-4 p-4 sm:grid-cols-2">
        <TextField
          id={`${base}-name`}
          label="Step name"
          error={fieldError(`steps.${index}.name`)}
          {...register(`steps.${index}.name`)}
        />
        <SelectField
          id={`${base}-type`}
          label="Type"
          options={TYPE_OPTIONS}
          error={fieldError(`steps.${index}.type`)}
          {...register(`steps.${index}.type`)}
        />
        <StepConfigFields type={type} index={index} base={base} />
      </div>
    </div>
  );
}

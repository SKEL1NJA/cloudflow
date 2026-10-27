import { HTTP_METHODS, assertNever, type StepType } from '@cloudflow/shared';
import { Eye, EyeOff, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useFieldArray, useFormContext, useWatch } from 'react-hook-form';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { SelectField } from '@/components/ui/select-field';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import type { WorkflowFormValues } from './form-values';
import { useFieldError } from './use-field-error';

const METHOD_OPTIONS = HTTP_METHODS.map((method) => ({ value: method, label: method }));

interface FieldsProps {
  index: number;
  base: string;
}

function RowError({ message }: { message: string | undefined }) {
  return message ? (
    <p role="alert" className="text-xs text-danger">
      {message}
    </p>
  ) : null;
}

interface HeaderRowProps {
  stepIndex: number;
  rowIndex: number;
  onRemove: () => void;
}

function HeaderRow({ stepIndex, rowIndex, onRemove }: HeaderRowProps) {
  const { register } = useFormContext<WorkflowFormValues>();
  const fieldError = useFieldError();
  const [visible, setVisible] = useState(false);
  const path = `steps.${stepIndex}.headers.${rowIndex}` as const;
  const nameError = fieldError(`${path}.name`);
  const valueError = fieldError(`${path}.value`);
  const label = rowIndex + 1;

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        <Input
          aria-label={`Header ${label} name`}
          aria-invalid={nameError ? true : undefined}
          placeholder="Name"
          autoComplete="off"
          spellCheck={false}
          {...register(`${path}.name`)}
        />
        <div className="relative w-full">
          <Input
            aria-label={`Header ${label} value`}
            aria-invalid={valueError ? true : undefined}
            placeholder="Value"
            type={visible ? 'text' : 'password'}
            autoComplete="off"
            spellCheck={false}
            data-1p-ignore
            data-lpignore="true"
            className="pr-9"
            {...register(`${path}.value`)}
          />
          <button
            type="button"
            aria-label={`${visible ? 'Hide' : 'Show'} header ${label} value`}
            onClick={() => setVisible((current) => !current)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-sm p-1 text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {visible ? (
              <EyeOff className="size-4" aria-hidden="true" />
            ) : (
              <Eye className="size-4" aria-hidden="true" />
            )}
          </button>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          aria-label={`Remove header ${label}`}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <RowError message={nameError} />
      <RowError message={valueError} />
    </div>
  );
}

function HeadersEditor({ index }: { index: number }) {
  const { control } = useFormContext<WorkflowFormValues>();
  const fieldError = useFieldError();
  const { fields, append, remove } = useFieldArray({ control, name: `steps.${index}.headers` });

  return (
    <fieldset className="space-y-2">
      <legend className="mb-1 text-sm font-medium">Headers</legend>
      {fields.length === 0 ? (
        <p className="text-xs text-muted-foreground">No custom headers.</p>
      ) : null}
      {fields.map((field, rowIndex) => (
        <HeaderRow
          key={field.id}
          stepIndex={index}
          rowIndex={rowIndex}
          onRemove={() => remove(rowIndex)}
        />
      ))}
      <RowError message={fieldError(`steps.${index}.headers.root`)} />
      <Button variant="outline" size="sm" onClick={() => append({ name: '', value: '' })}>
        <Plus aria-hidden="true" />
        Add header
      </Button>
    </fieldset>
  );
}

function HttpFields({ index, base }: FieldsProps) {
  const { register, control } = useFormContext<WorkflowFormValues>();
  const fieldError = useFieldError();
  const method = useWatch({ control, name: `steps.${index}.method` });
  const prefix = `steps.${index}` as const;

  return (
    <>
      <SelectField
        id={`${base}-method`}
        label="Method"
        options={METHOD_OPTIONS}
        error={fieldError(`${prefix}.method`)}
        {...register(`${prefix}.method`)}
      />
      <TextField
        id={`${base}-timeout`}
        label="Timeout (ms)"
        inputMode="numeric"
        error={fieldError(`${prefix}.timeoutMs`)}
        {...register(`${prefix}.timeoutMs`)}
      />
      <div className="sm:col-span-2">
        <TextField
          id={`${base}-url`}
          label="URL"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          placeholder="https://api.example.com/endpoint"
          error={fieldError(`${prefix}.url`)}
          {...register(`${prefix}.url`)}
        />
      </div>
      <div className="sm:col-span-2">
        <HeadersEditor index={index} />
      </div>
      {method !== 'GET' ? (
        <div className="sm:col-span-2">
          <TextareaField
            id={`${base}-body`}
            label="Body (JSON)"
            rows={5}
            spellCheck={false}
            className="font-mono text-xs"
            hint="Sent as application/json."
            error={fieldError(`${prefix}.body`)}
            {...register(`${prefix}.body`)}
          />
        </div>
      ) : null}
    </>
  );
}

function DelayFields({ index, base }: FieldsProps) {
  const { register } = useFormContext<WorkflowFormValues>();
  const fieldError = useFieldError();
  const prefix = `steps.${index}` as const;

  return (
    <TextField
      id={`${base}-duration`}
      label="Duration (ms)"
      inputMode="numeric"
      hint="Between 100 and 300000 milliseconds."
      error={fieldError(`${prefix}.durationMs`)}
      {...register(`${prefix}.durationMs`)}
    />
  );
}

interface MappingRowProps {
  stepIndex: number;
  rowIndex: number;
  onRemove: () => void;
}

function MappingRow({ stepIndex, rowIndex, onRemove }: MappingRowProps) {
  const { register } = useFormContext<WorkflowFormValues>();
  const fieldError = useFieldError();
  const path = `steps.${stepIndex}.mappings.${rowIndex}` as const;
  const targetError = fieldError(`${path}.target`);
  const sourceError = fieldError(`${path}.source`);
  const label = rowIndex + 1;

  return (
    <div className="space-y-1">
      <div className="flex items-start gap-2">
        <Input
          aria-label={`Mapping ${label} target`}
          aria-invalid={targetError ? true : undefined}
          placeholder="Output field, for example id"
          autoComplete="off"
          spellCheck={false}
          {...register(`${path}.target`)}
        />
        <Input
          aria-label={`Mapping ${label} source`}
          aria-invalid={sourceError ? true : undefined}
          placeholder="Source path, for example body.user.id"
          autoComplete="off"
          spellCheck={false}
          {...register(`${path}.source`)}
        />
        <Button
          variant="ghost"
          size="icon"
          className="size-9 shrink-0"
          aria-label={`Remove mapping ${label}`}
          onClick={onRemove}
        >
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
      <RowError message={targetError} />
      <RowError message={sourceError} />
    </div>
  );
}

function TransformFields({ index }: FieldsProps) {
  const { control } = useFormContext<WorkflowFormValues>();
  const fieldError = useFieldError();
  const { fields, append, remove } = useFieldArray({ control, name: `steps.${index}.mappings` });

  return (
    <fieldset className="space-y-2 sm:col-span-2">
      <legend className="mb-1 text-sm font-medium">Field mappings</legend>
      <p className="text-xs text-muted-foreground">
        Each mapping copies a value from the previous step&apos;s output, using a dot path, into a
        field of this step&apos;s output.
      </p>
      {fields.map((field, rowIndex) => (
        <MappingRow
          key={field.id}
          stepIndex={index}
          rowIndex={rowIndex}
          onRemove={() => remove(rowIndex)}
        />
      ))}
      <RowError message={fieldError(`steps.${index}.mappings.root`)} />
      <Button variant="outline" size="sm" onClick={() => append({ target: '', source: '' })}>
        <Plus aria-hidden="true" />
        Add mapping
      </Button>
    </fieldset>
  );
}

function NotificationFields({ index, base }: FieldsProps) {
  const { register } = useFormContext<WorkflowFormValues>();
  const fieldError = useFieldError();
  const prefix = `steps.${index}` as const;

  return (
    <>
      <div className="sm:col-span-2">
        <TextareaField
          id={`${base}-message`}
          label="Message"
          rows={3}
          error={fieldError(`${prefix}.message`)}
          {...register(`${prefix}.message`)}
        />
      </div>
      <div className="sm:col-span-2">
        <TextField
          id={`${base}-webhook`}
          label="Webhook URL (optional)"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          hint="Webhook delivery is not available yet, so for now the message is only written to the execution log."
          error={fieldError(`${prefix}.webhookUrl`)}
          {...register(`${prefix}.webhookUrl`)}
        />
      </div>
    </>
  );
}

export function StepConfigFields({ type, index, base }: FieldsProps & { type: StepType }) {
  switch (type) {
    case 'HTTP_REQUEST':
      return <HttpFields index={index} base={base} />;
    case 'DELAY':
      return <DelayFields index={index} base={base} />;
    case 'TRANSFORM':
      return <TransformFields index={index} base={base} />;
    case 'NOTIFICATION':
      return <NotificationFields index={index} base={base} />;
    default:
      return assertNever(type);
  }
}

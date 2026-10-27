import { STEP_TYPES } from '@cloudflow/shared';
import { LoaderCircle, Plus } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { Controller, FormProvider, useFieldArray, useForm } from 'react-hook-form';
import { Link, useBlocker, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { PageHeader } from '@/components/layout/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Switch } from '@/components/ui/switch';
import { TextField } from '@/components/ui/text-field';
import { TextareaField } from '@/components/ui/textarea-field';
import { cn } from '@/lib/utils';
import { useSaveWorkflow } from '../mutations';
import { STEP_ICONS } from '../step-icons';
import { STEP_TYPE_LABELS } from '../step-summary';
import { emptyStep, toDefinition, type WorkflowFormValues } from './form-values';
import { workflowResolver } from './resolver';
import { applyServerError } from './server-errors';
import { StepCard } from './step-card';
import { getFieldError } from './use-field-error';

interface WorkflowFormProps {
  mode: 'create' | 'edit';
  workflowId?: string;
  title: string;
  description: string;
  initialValues: WorkflowFormValues;
}

export function WorkflowForm({
  mode,
  workflowId,
  title,
  description,
  initialValues,
}: WorkflowFormProps) {
  const navigate = useNavigate();
  const save = useSaveWorkflow(
    mode === 'edit' && workflowId ? { mode: 'edit', id: workflowId } : { mode: 'create' },
  );
  const [formError, setFormError] = useState<string | null>(null);
  const saved = useRef(false);
  const dirty = useRef(false);

  const form = useForm<WorkflowFormValues>({
    resolver: workflowResolver,
    defaultValues: initialValues,
  });
  const { control, register, handleSubmit, formState } = form;
  const { errors, isDirty, isSubmitting } = formState;
  const { fields, append, remove, move } = useFieldArray({ control, name: 'steps' });

  useEffect(() => {
    dirty.current = isDirty;
  }, [isDirty]);

  const blocker = useBlocker(
    ({ currentLocation, nextLocation }) =>
      dirty.current && !saved.current && currentLocation.pathname !== nextLocation.pathname,
  );

  useEffect(() => {
    if (!isDirty) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [isDirty]);

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const workflow = await save.mutateAsync(toDefinition(values));
      saved.current = true;
      toast.success(mode === 'create' ? 'Workflow created' : 'Changes saved');
      void navigate(`/workflows/${workflow.id}`);
    } catch (error) {
      applyServerError(error, values, form, setFormError);
    }
  });

  const banner = formError ?? getFieldError(errors, 'root');
  const stepsError = getFieldError(errors, 'steps.root');
  const cancelTarget = mode === 'edit' && workflowId ? `/workflows/${workflowId}` : '/workflows';

  return (
    <FormProvider {...form}>
      <PageHeader title={title} description={description} />
      <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-6">
        {banner ? (
          <div
            role="alert"
            className="rounded-md border border-danger/40 bg-danger/10 px-3 py-2 text-sm text-danger"
          >
            {banner}
          </div>
        ) : null}

        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-sm font-medium">Details</h2>
            <TextField
              id="workflow-name"
              label="Name"
              autoComplete="off"
              error={getFieldError(errors, 'name')}
              {...register('name')}
            />
            <TextareaField
              id="workflow-description"
              label="Description (optional)"
              rows={2}
              error={getFieldError(errors, 'description')}
              {...register('description')}
            />
            <label className="flex items-center gap-3 text-sm">
              <Controller
                control={control}
                name="enabled"
                render={({ field }) => (
                  <Switch checked={field.value} onCheckedChange={field.onChange} />
                )}
              />
              <span>
                Enabled
                <span className="block text-xs text-muted-foreground">
                  Disabled workflows cannot be run.
                </span>
              </span>
            </label>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="space-y-4 p-5">
            <h2 className="text-sm font-medium">Retries</h2>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField
                id="workflow-attempts"
                label="Max attempts"
                inputMode="numeric"
                hint="Attempts per step, including the first one (1 to 10)."
                error={getFieldError(errors, 'maxAttempts')}
                {...register('maxAttempts')}
              />
              <TextField
                id="workflow-backoff"
                label="Backoff base (ms)"
                inputMode="numeric"
                hint="Delay before the first retry. It doubles after each failure (100 to 60000)."
                error={getFieldError(errors, 'backoffBaseMs')}
                {...register('backoffBaseMs')}
              />
            </div>
          </CardContent>
        </Card>

        <section aria-labelledby="steps-heading" className="space-y-4">
          <h2 id="steps-heading" className="text-sm font-medium">
            Steps
          </h2>
          {stepsError ? (
            <p role="alert" className="text-sm text-danger">
              {stepsError}
            </p>
          ) : null}
          <ol aria-label="Workflow steps" className="space-y-4">
            {fields.map((field, index) => (
              <li key={field.id}>
                <StepCard index={index} total={fields.length} onMove={move} onRemove={remove} />
              </li>
            ))}
          </ol>
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm text-muted-foreground">Add a step:</span>
            {STEP_TYPES.map((type) => {
              const Icon = STEP_ICONS[type];
              return (
                <Button
                  key={type}
                  variant="outline"
                  size="sm"
                  aria-label={`Add ${STEP_TYPE_LABELS[type]} step`}
                  onClick={() => append(emptyStep(type))}
                >
                  <Icon aria-hidden="true" />
                  {STEP_TYPE_LABELS[type]}
                </Button>
              );
            })}
          </div>
        </section>

        <div className="sticky bottom-0 -mx-4 flex justify-end gap-2 border-t bg-background px-4 py-3 lg:-mx-6 lg:px-6">
          <Link to={cancelTarget} className={cn(buttonVariants({ variant: 'outline' }))}>
            Cancel
          </Link>
          <Button type="submit" disabled={isSubmitting || (mode === 'edit' && !isDirty)}>
            {isSubmitting ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
            {mode === 'create' ? 'Create workflow' : 'Save changes'}
          </Button>
        </div>
      </form>

      <ConfirmDialog
        open={blocker.state === 'blocked'}
        onOpenChange={(open) => {
          if (!open) blocker.reset?.();
        }}
        title="Discard unsaved changes?"
        description="You have changes that have not been saved. If you leave now, they will be lost."
        confirmLabel="Discard changes"
        cancelLabel="Keep editing"
        onConfirm={() => blocker.proceed?.()}
      />
    </FormProvider>
  );
}

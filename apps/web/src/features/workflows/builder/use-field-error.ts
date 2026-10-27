import { get, useFormContext, type FieldErrors } from 'react-hook-form';
import type { WorkflowFormValues } from './form-values';

export function getFieldError(
  errors: FieldErrors<WorkflowFormValues>,
  path: string,
): string | undefined {
  const message: unknown = get(errors, `${path}.message`);
  return typeof message === 'string' ? message : undefined;
}

export function useFieldError(): (path: string) => string | undefined {
  const {
    formState: { errors },
  } = useFormContext<WorkflowFormValues>();
  return (path) => getFieldError(errors, path);
}

import type { FieldPath, UseFormReturn } from 'react-hook-form';
import { ApiError, describeError } from '@/api/errors';
import type { WorkflowFormValues } from './form-values';
import { isIssueLike, messageOf, toFormPath } from './resolver';

export function applyServerError(
  error: unknown,
  values: WorkflowFormValues,
  form: UseFormReturn<WorkflowFormValues>,
  showBanner: (message: string) => void,
): void {
  if (error instanceof ApiError) {
    if (error.status === 409 && error.code === 'CONFLICT') {
      form.setError('name', { type: 'server', message: error.message });
      form.setFocus('name');
      return;
    }

    if (error.status === 400 && error.code === 'VALIDATION_ERROR' && Array.isArray(error.details)) {
      let mapped = 0;
      for (const issue of error.details as unknown[]) {
        if (!isIssueLike(issue)) continue;
        const path = toFormPath(issue, values);
        form.setError(path as FieldPath<WorkflowFormValues>, {
          type: 'server',
          message: messageOf(issue),
        });
        mapped += 1;
      }
      if (mapped > 0) return;
    }

    if (error.status === 404) {
      showBanner('This workflow no longer exists. It may have been deleted in another tab.');
      return;
    }
  }

  showBanner(describeError(error));
}

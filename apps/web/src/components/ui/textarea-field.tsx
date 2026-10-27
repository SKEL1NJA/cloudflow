import type * as React from 'react';
import { cn } from '@/lib/utils';
import { Field } from './field';
import { controlClassName } from './input';

interface TextareaFieldProps extends React.ComponentProps<'textarea'> {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

export function TextareaField({ id, label, error, hint, className, ...props }: TextareaFieldProps) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      {(control) => (
        <textarea
          data-slot="textarea"
          className={cn(controlClassName, 'min-h-20 py-2', className)}
          {...control}
          {...props}
        />
      )}
    </Field>
  );
}

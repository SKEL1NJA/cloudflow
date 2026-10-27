import type * as React from 'react';
import { cn } from '@/lib/utils';
import { Field } from './field';
import { controlClassName } from './input';

interface SelectFieldProps extends React.ComponentProps<'select'> {
  id: string;
  label: string;
  options: readonly { value: string; label: string }[];
  error?: string | undefined;
  hint?: string | undefined;
}

export function SelectField({
  id,
  label,
  options,
  error,
  hint,
  className,
  ...props
}: SelectFieldProps) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      {(control) => (
        <select
          data-slot="select"
          className={cn(controlClassName, 'h-9', className)}
          {...control}
          {...props}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      )}
    </Field>
  );
}

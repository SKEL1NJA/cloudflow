import type * as React from 'react';
import { Input } from './input';

interface TextFieldProps extends React.ComponentProps<'input'> {
  id: string;
  label: string;
  error?: string | undefined;
}

export function TextField({ id, label, error, ...props }: TextFieldProps) {
  const errorId = `${id}-error`;

  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-sm font-medium">
        {label}
      </label>
      <Input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        {...props}
      />
      {error ? (
        <p id={errorId} role="alert" className="text-xs text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}

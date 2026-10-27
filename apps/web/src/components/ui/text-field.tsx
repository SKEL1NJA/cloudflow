import type * as React from 'react';
import { Field } from './field';
import { Input } from './input';

interface TextFieldProps extends React.ComponentProps<'input'> {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
}

export function TextField({ id, label, error, hint, ...props }: TextFieldProps) {
  return (
    <Field id={id} label={label} error={error} hint={hint}>
      {(control) => <Input {...control} {...props} />}
    </Field>
  );
}

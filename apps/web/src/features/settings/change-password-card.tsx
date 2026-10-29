import { zodResolver } from '@hookform/resolvers/zod';
import { passwordSchema } from '@cloudflow/shared';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { ApiError, describeError } from '@/api/errors';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { useChangePassword } from './mutations';

const formSchema = z
  .object({
    currentPassword: z.string().min(1, 'Enter your current password'),
    newPassword: passwordSchema,
    confirmPassword: z.string(),
  })
  .refine((values) => values.newPassword === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  })
  .refine((values) => values.currentPassword !== values.newPassword, {
    path: ['newPassword'],
    message: 'Choose a password different from the current one',
  });

type FormValues = z.infer<typeof formSchema>;

const EMPTY: FormValues = { currentPassword: '', newPassword: '', confirmPassword: '' };

export function ChangePasswordCard() {
  const change = useChangePassword();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<FormValues>({ resolver: zodResolver(formSchema), defaultValues: EMPTY });
  const { register, handleSubmit, formState } = form;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await change.mutateAsync({
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      });
      form.reset(EMPTY);
    } catch (error) {
      if (error instanceof ApiError && error.code === 'INVALID_CURRENT_PASSWORD') {
        form.setError('currentPassword', { message: error.message });
        form.setFocus('currentPassword');
      } else {
        setFormError(describeError(error));
      }
    }
  });

  return (
    <Card>
      <CardContent className="p-5">
        <h2 className="text-sm font-medium">Change password</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Changing your password signs out every other device.
        </p>
        <form
          noValidate
          onSubmit={(event) => void onSubmit(event)}
          className="mt-4 max-w-sm space-y-4"
        >
          <TextField
            id="current-password"
            label="Current password"
            type="password"
            autoComplete="current-password"
            error={formState.errors.currentPassword?.message}
            {...register('currentPassword')}
          />
          <TextField
            id="new-password"
            label="New password"
            type="password"
            autoComplete="new-password"
            error={formState.errors.newPassword?.message}
            {...register('newPassword')}
          />
          <TextField
            id="confirm-password"
            label="Confirm new password"
            type="password"
            autoComplete="new-password"
            error={formState.errors.confirmPassword?.message}
            {...register('confirmPassword')}
          />
          {formError ? (
            <p role="alert" className="text-sm text-danger">
              {formError}
            </p>
          ) : null}
          <Button type="submit" disabled={formState.isSubmitting}>
            {formState.isSubmitting ? (
              <LoaderCircle className="animate-spin" aria-hidden="true" />
            ) : null}
            Change password
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

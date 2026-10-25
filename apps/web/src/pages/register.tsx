import { zodResolver } from '@hookform/resolvers/zod';
import { registerSchema } from '@cloudflow/shared';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { z } from 'zod';
import { ApiError, describeError } from '@/api/errors';
import { signUp } from '@/auth/actions';
import { AuthLayout } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';

const registerFormSchema = z
  .object({
    name: z.string().trim().max(100, 'Use at most 100 characters'),
    email: registerSchema.shape.email,
    password: registerSchema.shape.password,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ['confirmPassword'],
    message: 'Passwords do not match',
  });

type RegisterFormValues = z.infer<typeof registerFormSchema>;

export function RegisterPage() {
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<RegisterFormValues>({
    resolver: zodResolver(registerFormSchema),
    defaultValues: { name: '', email: '', password: '', confirmPassword: '' },
  });
  const { register, handleSubmit, formState } = form;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signUp({
        email: values.email,
        password: values.password,
        ...(values.name !== '' && { name: values.name }),
      });
    } catch (err) {
      if (err instanceof ApiError && err.status === 409) {
        form.setError('email', { message: err.message });
        form.setFocus('email');
      } else {
        setFormError(describeError(err));
      }
    }
  });

  return (
    <AuthLayout
      title="Create your account"
      description="Start building workflows in a minute."
      footer={
        <>
          Already have an account?{' '}
          <Link
            to="/login"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Sign in
          </Link>
        </>
      }
    >
      <form onSubmit={onSubmit} noValidate className="space-y-4">
        <TextField
          id="name"
          label="Name (optional)"
          autoComplete="name"
          error={formState.errors.name?.message}
          {...register('name')}
        />
        <TextField
          id="email"
          label="Email"
          type="email"
          autoComplete="email"
          error={formState.errors.email?.message}
          {...register('email')}
        />
        <TextField
          id="password"
          label="Password"
          type="password"
          autoComplete="new-password"
          error={formState.errors.password?.message}
          {...register('password')}
        />
        <TextField
          id="confirmPassword"
          label="Confirm password"
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
        <Button type="submit" className="w-full" disabled={formState.isSubmitting}>
          {formState.isSubmitting ? (
            <LoaderCircle className="animate-spin" aria-hidden="true" />
          ) : null}
          Create account
        </Button>
      </form>
    </AuthLayout>
  );
}

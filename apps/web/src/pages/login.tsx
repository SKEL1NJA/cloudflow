import { zodResolver } from '@hookform/resolvers/zod';
import { loginSchema, type LoginInput } from '@cloudflow/shared';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link } from 'react-router';
import { ApiError, describeError } from '@/api/errors';
import { signIn } from '@/auth/actions';
import { useSession } from '@/auth/use-session';
import { AuthLayout } from '@/components/layout/auth-layout';
import { Button } from '@/components/ui/button';
import { TextField } from '@/components/ui/text-field';

export function LoginPage() {
  const session = useSession();
  const expired = session.status === 'anonymous' && session.expired;
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });
  const { register, handleSubmit, formState } = form;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn(values);
    } catch (err) {
      setFormError(describeError(err));
      if (err instanceof ApiError && err.status === 401) {
        form.resetField('password');
        form.setFocus('password');
      }
    }
  });

  return (
    <AuthLayout
      title="Sign in to CloudFlow"
      description="Run and monitor your workflows."
      footer={
        <>
          No account yet?{' '}
          <Link
            to="/register"
            className="font-medium text-foreground underline-offset-4 hover:underline"
          >
            Create one
          </Link>
        </>
      }
    >
      {expired ? (
        <p role="status" className="mb-4 rounded-md border bg-muted px-3 py-2 text-sm">
          Your session expired. Sign in again to continue.
        </p>
      ) : null}
      <form onSubmit={onSubmit} noValidate className="space-y-4">
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
          autoComplete="current-password"
          error={formState.errors.password?.message}
          {...register('password')}
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
          Sign in
        </Button>
      </form>
    </AuthLayout>
  );
}

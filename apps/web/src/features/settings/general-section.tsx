import { zodResolver } from '@hookform/resolvers/zod';
import { updateProfileSchema, type AuthUser, type UpdateProfileInput } from '@cloudflow/shared';
import { LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { describeError } from '@/api/errors';
import { useSession } from '@/auth/use-session';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { TextField } from '@/components/ui/text-field';
import { formatDateTime } from '@/lib/format';
import { useUpdateProfile } from './mutations';

function ProfileForm({ user }: { user: AuthUser }) {
  const update = useUpdateProfile();
  const [formError, setFormError] = useState<string | null>(null);
  const form = useForm<UpdateProfileInput>({
    resolver: zodResolver(updateProfileSchema),
    defaultValues: { name: user.name ?? '' },
  });
  const { register, handleSubmit, formState } = form;

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { user: updated } = await update.mutateAsync(values);
      form.reset({ name: updated.name ?? '' });
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <form noValidate onSubmit={(event) => void onSubmit(event)} className="space-y-4">
      <TextField
        id="profile-name"
        label="Name"
        autoComplete="name"
        hint="Shown in the sidebar. Leave it empty to show your email instead."
        error={formState.errors.name?.message}
        {...register('name')}
      />
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Email</p>
        <p className="text-sm text-muted-foreground">{user.email}</p>
        <p className="text-xs text-muted-foreground">
          Changing your email address is not available yet.
        </p>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">Member since</p>
        <p className="text-sm text-muted-foreground">{formatDateTime(user.createdAt)}</p>
      </div>
      {formError ? (
        <p role="alert" className="text-sm text-danger">
          {formError}
        </p>
      ) : null}
      <Button type="submit" disabled={!formState.isDirty || formState.isSubmitting}>
        {formState.isSubmitting ? (
          <LoaderCircle className="animate-spin" aria-hidden="true" />
        ) : null}
        Save changes
      </Button>
    </form>
  );
}

export function GeneralSection() {
  const session = useSession();
  if (session.status !== 'authenticated') return null;

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <h2 className="text-sm font-medium">Profile</h2>
        <ProfileForm user={session.user} />
      </CardContent>
    </Card>
  );
}

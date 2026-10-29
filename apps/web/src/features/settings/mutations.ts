import { useMutation, useQueryClient } from '@tanstack/react-query';
import type { ChangePasswordInput, UpdateProfileInput } from '@cloudflow/shared';
import { toast } from 'sonner';
import { changePassword, revokeSession, updateProfile } from '@/api/account';
import { createApiKey, revokeApiKey } from '@/api/api-keys';
import { describeError } from '@/api/errors';
import { signOutEverywhere } from '@/auth/actions';
import { sessionStore } from '@/auth/session';
import { queryKeys } from '@/queries/keys';

export function useUpdateProfile() {
  return useMutation({
    mutationFn: (input: UpdateProfileInput) => updateProfile(input),
    onSuccess: ({ user }) => {
      sessionStore.updateUser(user);
      toast.success('Profile updated');
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (input: ChangePasswordInput) => changePassword(input),
    onSuccess: ({ revokedSessions }) => {
      toast.success('Password changed', {
        description:
          revokedSessions === 0
            ? 'No other devices were signed in.'
            : `${revokedSessions} other ${revokedSessions === 1 ? 'session was' : 'sessions were'} signed out.`,
      });
      void queryClient.invalidateQueries({ queryKey: queryKeys.account.sessions });
    },
  });
}

export function useRevokeSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => revokeSession(id),
    onSuccess: () => {
      toast.success('Device signed out');
      void queryClient.invalidateQueries({ queryKey: queryKeys.account.sessions });
    },
    onError: (error) => {
      toast.error('Could not sign out the device', { description: describeError(error) });
    },
  });
}

export function useSignOutEverywhere() {
  return useMutation({
    mutationFn: () => signOutEverywhere(),
    onError: (error) => {
      toast.error('Could not sign out', { description: describeError(error) });
    },
  });
}

export function useCreateApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (name: string) => createApiKey(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys });
    },
  });
}

export function useRevokeApiKey() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (id: string) => revokeApiKey(id),
    onSuccess: () => {
      toast.success('API key revoked');
      void queryClient.invalidateQueries({ queryKey: queryKeys.apiKeys });
    },
    onError: (error) => {
      toast.error('Could not revoke the key', { description: describeError(error) });
    },
  });
}

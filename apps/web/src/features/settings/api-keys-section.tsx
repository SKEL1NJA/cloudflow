import { zodResolver } from '@hookform/resolvers/zod';
import {
  createApiKeySchema,
  type ApiKeyView,
  type CreateApiKeyInput,
  type CreatedApiKey,
} from '@cloudflow/shared';
import { KeyRound, LoaderCircle } from 'lucide-react';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { describeError } from '@/api/errors';
import { EmptyState } from '@/components/layout/empty-state';
import { ErrorState } from '@/components/layout/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { TextField } from '@/components/ui/text-field';
import { useNow } from '@/hooks/use-now';
import { env } from '@/lib/env';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { cn } from '@/lib/utils';
import { KeyRevealDialog } from './key-reveal-dialog';
import { useCreateApiKey, useRevokeApiKey } from './mutations';
import { useApiKeys } from './queries';

const MAX_ACTIVE_KEYS = 20;
const HEADERS = ['Name', 'Key', 'Created', 'Last used', 'Status'];

function KeyRow({
  apiKey,
  now,
  onRevoke,
}: {
  apiKey: ApiKeyView;
  now: number;
  onRevoke: () => void;
}) {
  const revoked = apiKey.revokedAt !== null;

  return (
    <tr className={cn(revoked && 'text-muted-foreground')}>
      <td className="px-5 py-2.5 font-medium">{apiKey.name}</td>
      <td className="px-5 py-2.5 font-mono text-xs">{apiKey.prefix}…</td>
      <td className="px-5 py-2.5 whitespace-nowrap" title={formatDateTime(apiKey.createdAt)}>
        {formatRelativeTime(apiKey.createdAt, now)}
      </td>
      <td
        className="px-5 py-2.5 whitespace-nowrap"
        title={apiKey.lastUsedAt ? formatDateTime(apiKey.lastUsedAt) : undefined}
      >
        {apiKey.lastUsedAt ? formatRelativeTime(apiKey.lastUsedAt, now) : 'Never'}
      </td>
      <td className="px-5 py-2.5">
        <span
          className={cn(
            'rounded-full px-2 py-0.5 text-xs font-medium',
            revoked ? 'bg-muted text-muted-foreground' : 'bg-success/10 text-success',
          )}
        >
          {revoked ? 'Revoked' : 'Active'}
        </span>
      </td>
      <td className="px-5 py-2.5 text-right">
        {revoked ? null : (
          <Button
            variant="outline"
            size="sm"
            aria-label={`Revoke ${apiKey.name}`}
            onClick={onRevoke}
          >
            Revoke
          </Button>
        )}
      </td>
    </tr>
  );
}

export function ApiKeysSection() {
  const keys = useApiKeys();
  const create = useCreateApiKey();
  const revoke = useRevokeApiKey();
  const now = useNow(30_000);
  const [created, setCreated] = useState<CreatedApiKey | null>(null);
  const [revoking, setRevoking] = useState<ApiKeyView | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const form = useForm<CreateApiKeyInput>({
    resolver: zodResolver(createApiKeySchema),
    defaultValues: { name: '' },
  });

  const { register, handleSubmit, formState } = form;
  const activeCount = keys.data?.filter((key) => key.revokedAt === null).length ?? 0;

  const onSubmit = handleSubmit(async ({ name }) => {
    setFormError(null);

    try {
      setCreated(await create.mutateAsync(name));
      form.reset({ name: '' });
    } catch (error) {
      setFormError(describeError(error));
    }
  });

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-5">
          <h2 className="text-sm font-medium">Create an API key</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Keys let scripts and other tools call the CloudFlow API. A key can do everything you
            can, except manage keys and sessions.
          </p>

          <form
            noValidate
            onSubmit={(event) => void onSubmit(event)}
            className="mt-4 flex max-w-lg flex-wrap items-start gap-3"
          >
            <div className="min-w-56 flex-1">
              <TextField
                id="api-key-name"
                label="Name"
                autoComplete="off"
                placeholder="For example, CI pipeline"
                error={formState.errors.name?.message}
                {...register('name')}
              />
            </div>

            <Button type="submit" className="mt-6" disabled={formState.isSubmitting}>
              {formState.isSubmitting ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : null}
              Create key
            </Button>
          </form>

          {formError ? (
            <p role="alert" className="mt-3 text-sm text-danger">
              {formError}
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-0">
          <div className="flex items-center justify-between px-5 py-4">
            <h2 className="text-sm font-medium">Your keys</h2>
            {keys.data ? (
              <p className="text-xs text-muted-foreground">
                {activeCount} of {MAX_ACTIVE_KEYS} active keys
              </p>
            ) : null}
          </div>

          {keys.isError && !keys.data ? (
            <div className="px-5 pb-5">
              <ErrorState
                what="your API keys"
                error={keys.error}
                onRetry={() => void keys.refetch()}
              />
            </div>
          ) : !keys.data ? (
            <div className="space-y-3 px-5 pb-5">
              <Skeleton className="h-9 w-full" />
              <Skeleton className="h-9 w-full" />
            </div>
          ) : keys.data.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState
                icon={KeyRound}
                title="No API keys yet"
                description="Create a key above to use the API from scripts and other tools."
                className="py-10"
              />
            </div>
          ) : (
            <div className="overflow-x-auto border-t">
              <table className="w-full text-sm">
                <caption className="sr-only">API keys</caption>
                <thead>
                  <tr className="border-b text-left text-xs text-muted-foreground">
                    {HEADERS.map((header) => (
                      <th
                        key={header}
                        scope="col"
                        className="px-5 py-2 font-medium whitespace-nowrap"
                      >
                        {header}
                      </th>
                    ))}
                    <th scope="col" className="px-5 py-2">
                      <span className="sr-only">Actions</span>
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {keys.data.map((apiKey) => (
                    <KeyRow
                      key={apiKey.id}
                      apiKey={apiKey}
                      now={now}
                      onRevoke={() => setRevoking(apiKey)}
                    />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="p-5">
          <h2 className="text-sm font-medium">Using a key</h2>
          <p className="mt-1 text-xs text-muted-foreground">Send it as a bearer token.</p>
          <pre
            tabIndex={0}
            role="group"
            aria-label="Example request"
            className="mt-3 overflow-x-auto rounded-md border bg-muted/30 p-3 font-mono text-xs"
          >
            {`curl -H "Authorization: Bearer YOUR_KEY" ${env.apiUrl}/workflows`}
          </pre>
        </CardContent>
      </Card>

      <KeyRevealDialog created={created} onDone={() => setCreated(null)} />

      <ConfirmDialog
        open={revoking !== null}
        onOpenChange={(open) => {
          if (!open) setRevoking(null);
        }}
        title={`Revoke "${revoking?.name ?? ''}"?`}
        description="Anything using this key stops working immediately. This can't be undone."
        confirmLabel="Revoke key"
        pending={revoke.isPending}
        onConfirm={() => {
          if (revoking) revoke.mutate(revoking.id, { onSettled: () => setRevoking(null) });
        }}
      />
    </div>
  );
}

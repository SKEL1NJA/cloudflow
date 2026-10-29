import type { SessionView } from '@cloudflow/shared';
import { Monitor, Smartphone } from 'lucide-react';
import { useState } from 'react';
import { ErrorState } from '@/components/layout/error-state';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { useNow } from '@/hooks/use-now';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { describeDevice, deviceLabel } from './device';
import { useRevokeSession, useSignOutEverywhere } from './mutations';
import { useSessions } from './queries';

function SessionRow({
  session,
  now,
  onRevoke,
}: {
  session: SessionView;
  now: number;
  onRevoke: () => void;
}) {
  const device = describeDevice(session.userAgent);
  const Icon = device?.mobile ? Smartphone : Monitor;
  const label = deviceLabel(session.userAgent);

  return (
    <li className="flex items-center gap-4 py-3">
      <Icon className="size-5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-center gap-2 text-sm font-medium">
          <span title={session.userAgent ?? undefined}>{label}</span>
          {session.current ? (
            <span className="rounded-full bg-success/10 px-2 py-0.5 text-xs text-success">
              This device
            </span>
          ) : null}
        </p>
        <p className="text-xs text-muted-foreground" title={formatDateTime(session.signedInAt)}>
          {session.ipAddress ? `${session.ipAddress} · ` : ''}Signed in{' '}
          {formatRelativeTime(session.signedInAt, now)} · Active{' '}
          {formatRelativeTime(session.lastActiveAt, now)}
        </p>
      </div>
      {session.current ? null : (
        <Button variant="outline" size="sm" aria-label={`Sign out ${label}`} onClick={onRevoke}>
          Sign out
        </Button>
      )}
    </li>
  );
}

export function SessionsCard() {
  const { data, error, isError, refetch } = useSessions();
  const now = useNow(30_000);
  const revoke = useRevokeSession();
  const signOutAll = useSignOutEverywhere();
  const [target, setTarget] = useState<SessionView | null>(null);
  const [confirmingAll, setConfirmingAll] = useState(false);

  return (
    <Card>
      <CardContent className="p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h2 className="text-sm font-medium">Active sessions</h2>
            <p className="mt-1 text-xs text-muted-foreground">
              Devices signed in to your account. A device you sign out loses access within 15
              minutes.
            </p>
          </div>
          <Button variant="outline" size="sm" onClick={() => setConfirmingAll(true)}>
            Sign out everywhere
          </Button>
        </div>

        <div className="mt-2">
          {isError && !data ? (
            <ErrorState what="your sessions" error={error} onRetry={() => void refetch()} />
          ) : !data ? (
            <div className="space-y-3 pt-2">
              <Skeleton className="h-10 w-full" />
              <Skeleton className="h-10 w-full" />
            </div>
          ) : (
            <ul aria-label="Active sessions" className="divide-y">
              {data.map((session) => (
                <SessionRow
                  key={session.id}
                  session={session}
                  now={now}
                  onRevoke={() => setTarget(session)}
                />
              ))}
            </ul>
          )}
        </div>
      </CardContent>

      <ConfirmDialog
        open={target !== null}
        onOpenChange={(open) => {
          if (!open) setTarget(null);
        }}
        title="Sign out this device?"
        description={`${target ? deviceLabel(target.userAgent) : 'This device'} will be signed out. It can keep working for up to 15 minutes, until its current access token expires.`}
        confirmLabel="Sign out device"
        pending={revoke.isPending}
        onConfirm={() => {
          if (target) revoke.mutate(target.id, { onSettled: () => setTarget(null) });
        }}
      />
      <ConfirmDialog
        open={confirmingAll}
        onOpenChange={setConfirmingAll}
        title="Sign out everywhere?"
        description="Every device, including this one, will be signed out, and you will need to sign in again."
        confirmLabel="Sign out everywhere"
        pending={signOutAll.isPending}
        onConfirm={() => signOutAll.mutate(undefined, { onSettled: () => setConfirmingAll(false) })}
      />
    </Card>
  );
}

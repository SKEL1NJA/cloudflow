import type { ExecutionStatus, RealtimeEvent } from '@cloudflow/shared';
import { toast } from 'sonner';
import { shortExecutionId } from '@/lib/format';
import { getNotificationPreferences, type NotificationPreferences } from './preferences';

type Kind = keyof NotificationPreferences;

export interface Notice {
  kind: Kind;
  title: string;
  description: string;
  path: string;
}

type Open = (path: string) => void;

export interface NotifyOptions {
  open: Open;
  now?: number;
  preferences?: NotificationPreferences;
  show?: (notice: Notice, open: Open) => void;
}

const KIND_BY_STATUS: Partial<Record<ExecutionStatus, Kind>> = {
  FAILED: 'failed',
  SUCCESS: 'succeeded',
  CANCELLED: 'cancelled',
};

const TITLES: Record<Kind, string> = {
  failed: 'Execution failed',
  succeeded: 'Execution succeeded',
  cancelled: 'Execution cancelled',
};

const MAX_AGE_MS = 60_000;
const MAX_REMEMBERED = 200;
const remembered = new Set<string>();

export function resetNotified(): void {
  remembered.clear();
}

export function defaultShow(notice: Notice, open: Open): void {
  const options = {
    description: notice.description,
    action: { label: 'View', onClick: () => open(notice.path) },
  };
  if (notice.kind === 'failed') toast.error(notice.title, options);
  else if (notice.kind === 'succeeded') toast.success(notice.title, options);
  else toast(notice.title, options);
}

export function notifyExecution(event: RealtimeEvent, options: NotifyOptions): void {
  if (event.type !== 'execution.updated') return;

  const kind = KIND_BY_STATUS[event.status];
  if (!kind) return;
  if ((options.now ?? Date.now()) - Date.parse(event.at) > MAX_AGE_MS) return;
  if (!(options.preferences ?? getNotificationPreferences())[kind]) return;

  const key = `${event.executionId}:${event.status}`;
  if (remembered.has(key)) return;
  remembered.add(key);
  if (remembered.size > MAX_REMEMBERED) {
    const oldest = remembered.values().next().value;
    if (oldest !== undefined) remembered.delete(oldest);
  }

  (options.show ?? defaultShow)(
    {
      kind,
      title: TITLES[kind],
      description: shortExecutionId(event.executionId),
      path: `/executions/${event.executionId}`,
    },
    options.open,
  );
}

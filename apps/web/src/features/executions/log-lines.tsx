import type { LogEntry, LogLevel } from '@cloudflow/shared';
import { formatLogTime } from '@/lib/format';
import { cn } from '@/lib/utils';

const LEVEL_CLASS: Record<LogLevel, string> = {
  DEBUG: 'text-muted-foreground',
  INFO: 'text-muted-foreground',
  WARN: 'text-warning',
  ERROR: 'text-danger',
};

export function LogLines({ entries }: { entries: LogEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">No log lines yet.</p>;
  }

  return (
    <ul className="divide-y rounded-md border bg-muted/30 font-mono text-xs">
      {entries.map((entry) => (
        <li key={entry.id} className="flex gap-3 px-3 py-1.5">
          <time dateTime={entry.createdAt} className="shrink-0 text-muted-foreground">
            {formatLogTime(entry.createdAt)}
          </time>
          <span className={cn('w-12 shrink-0 font-medium', LEVEL_CLASS[entry.level])}>
            {entry.level}
          </span>
          <span className="min-w-0 break-words">{entry.message}</span>
        </li>
      ))}
    </ul>
  );
}

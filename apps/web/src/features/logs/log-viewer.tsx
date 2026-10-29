import type { LogEntry } from '@cloudflow/shared';
import { formatDateTime, formatLogTime, shortExecutionId } from '@/lib/format';
import { cn } from '@/lib/utils';
import { formatMeta } from './format-meta';
import { Highlight } from './highlight';
import { LEVEL_CLASS } from './level';

interface LogViewerProps {
  entries: LogEntry[];
  term: string;
  dimmed: boolean;
  onFilterExecution: (executionId: string) => void;
}

export function LogViewer({ entries, term, dimmed, onFilterExecution }: LogViewerProps) {
  const today = new Date().toDateString();

  return (
    <div
      role="region"
      aria-label="Log lines"
      className={cn(
        'overflow-x-auto rounded-lg border bg-card font-mono text-xs transition-opacity',
        dimmed && 'opacity-60',
      )}
    >
      <ul className="min-w-3xl divide-y">
        {entries.map((entry) => {
          const date = new Date(entry.createdAt);
          const meta = formatMeta(entry.meta);
          return (
            <li key={entry.id} className="flex gap-3 px-3 py-1.5">
              <time
                dateTime={entry.createdAt}
                title={formatDateTime(entry.createdAt)}
                className="shrink-0 whitespace-nowrap text-muted-foreground"
              >
                {date.toDateString() === today
                  ? ''
                  : `${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} `}
                {formatLogTime(entry.createdAt)}
              </time>
              <span className={cn('w-12 shrink-0 font-medium', LEVEL_CLASS[entry.level])}>
                {entry.level}
              </span>
              <button
                type="button"
                title="Show only this execution"
                onClick={() => onFilterExecution(entry.executionId)}
                className="shrink-0 rounded-sm text-muted-foreground outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
              >
                {shortExecutionId(entry.executionId)}
              </button>
              <span className="min-w-0 flex-1 break-words">
                <span className="text-muted-foreground">
                  {entry.stepName
                    ? `${entry.workflowName} / ${entry.stepName}`
                    : entry.workflowName}
                </span>{' '}
                <Highlight text={entry.message} term={term} />
                {meta ? <span className="ml-2 text-muted-foreground">{meta}</span> : null}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

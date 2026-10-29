import { LoaderCircle, RefreshCw, ScrollText, Search, SearchX, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/layout/empty-state';
import { ErrorState } from '@/components/layout/error-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';
import { FilterSelect } from '@/components/ui/filter-select';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import { useWorkflowOptions } from '@/features/executions/queries';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNow } from '@/hooks/use-now';
import { formatRelativeTime, shortExecutionId } from '@/lib/format';
import { LogViewer } from './log-viewer';
import { LEVEL_OPTIONS, WHEN_OPTIONS, hasLogFilters, useLogFilters } from './list-params';
import { useLogs } from './queries';

function UpdatedAgo({ at }: { at: number }) {
  const now = useNow(1000);
  if (at === 0) return null;
  return <>Updated {formatRelativeTime(new Date(at).toISOString(), now)}</>;
}

export function LogsPage() {
  const { filters, update } = useLogFilters();
  const [text, setText] = useState(filters.q);
  const debounced = useDebouncedValue(text, 300);
  const logs = useLogs(filters);
  const workflows = useWorkflowOptions();
  const filtered = hasLogFilters(filters);
  const entries = logs.data?.pages.flatMap((page) => page.data) ?? [];

  useEffect(() => {
    setText(filters.q);
  }, [filters.q]);

  useEffect(() => {
    const next = debounced.trim();
    if (next !== filters.q) update({ q: next }, { replace: true });
  }, [debounced]);

  const known = workflows.data ?? [];
  const workflowOptions = [
    { value: '', label: 'All workflows' },
    ...known.map(({ id, name }) => ({ value: id, label: name })),
    ...(filters.workflow && !known.some(({ id }) => id === filters.workflow)
      ? [{ value: filters.workflow, label: 'Unknown workflow' }]
      : []),
  ];

  function clearFilters() {
    setText('');
    update({ q: '', level: undefined, workflow: undefined, execution: undefined, when: undefined });
  }

  let content;
  if (logs.isError && !logs.data) {
    content = <ErrorState what="the logs" error={logs.error} onRetry={() => void logs.refetch()} />;
  } else if (!logs.data) {
    content = (
      <div className="space-y-2">
        {Array.from({ length: 8 }, (_, index) => (
          <Skeleton key={index} className="h-7 w-full" />
        ))}
      </div>
    );
  } else if (entries.length === 0 && !filtered) {
    content = (
      <EmptyState
        icon={ScrollText}
        title="No logs yet"
        description="Log lines appear here as your workflows run."
      />
    );
  } else if (entries.length === 0) {
    content = (
      <EmptyState
        icon={SearchX}
        title="No log lines match your filters"
        description="Try a wider time range, or clear the filters."
        action={
          <Button variant="outline" onClick={clearFilters}>
            Clear filters
          </Button>
        }
      />
    );
  } else {
    content = (
      <>
        <LogViewer
          entries={entries}
          term={filters.q}
          dimmed={logs.isPlaceholderData}
          onFilterExecution={(execution) => update({ execution })}
        />
        {logs.hasNextPage ? (
          <div className="mt-4 flex justify-center">
            <Button
              variant="outline"
              disabled={logs.isFetchingNextPage}
              onClick={() => void logs.fetchNextPage()}
            >
              {logs.isFetchingNextPage ? (
                <LoaderCircle className="animate-spin" aria-hidden="true" />
              ) : null}
              Load older lines
            </Button>
          </div>
        ) : null}
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Logs"
        description="Search what your workflows did, newest first."
        actions={
          <>
            <label className="flex items-center gap-2 text-sm">
              <Switch
                checked={filters.live}
                onCheckedChange={(live) => update({ live }, { replace: true })}
              />
              Auto-refresh
            </label>
            <Button
              variant="outline"
              size="sm"
              disabled={logs.isFetching}
              onClick={() => void logs.refetch()}
              aria-label="Refresh logs"
            >
              <RefreshCw
                className={logs.isFetching ? 'animate-spin' : undefined}
                aria-hidden="true"
              />
              Refresh
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="relative">
          <Search
            className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden="true"
          />
          <Input
            type="search"
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Search messages"
            aria-label="Search logs"
            className="w-64 pl-9"
          />
        </div>
        <FilterSelect
          label="Level"
          value={filters.level}
          onChange={(level) => update({ level })}
          options={LEVEL_OPTIONS}
        />
        <FilterSelect
          label="Workflow"
          value={filters.workflow}
          onChange={(workflow) => update({ workflow })}
          options={workflowOptions}
        />
        <FilterSelect
          label="Time range"
          value={filters.when}
          onChange={(when) => update({ when })}
          options={WHEN_OPTIONS}
        />
        {filters.execution ? (
          <span className="inline-flex h-9 items-center gap-2 rounded-md border px-3 text-xs">
            Execution
            <Link
              to={`/executions/${filters.execution}`}
              className="font-mono outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
            >
              {shortExecutionId(filters.execution)}
            </Link>
            <button
              type="button"
              aria-label="Clear execution filter"
              onClick={() => update({ execution: undefined })}
              className="rounded-sm text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
            >
              <X className="size-3.5" aria-hidden="true" />
            </button>
          </span>
        ) : null}
      </div>

      <p className="mb-2 text-xs text-muted-foreground">
        {entries.length > 0
          ? `${entries.length} ${entries.length === 1 ? 'line' : 'lines'} · `
          : ''}
        <UpdatedAgo at={logs.dataUpdatedAt} />
        {filters.live ? ' · following' : ''}
      </p>
      {content}
    </>
  );
}

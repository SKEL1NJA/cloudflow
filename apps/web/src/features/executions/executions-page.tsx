import { EXECUTION_STATUSES } from '@cloudflow/shared';
import { Inbox, SearchX } from 'lucide-react';
import { useEffect } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/layout/empty-state';
import { ErrorState } from '@/components/layout/error-state';
import { PageHeader } from '@/components/layout/page-header';
import { STATUS_PRESENTATION } from '@/components/status-badge';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FilterSelect } from '@/components/ui/filter-select';
import { Pagination } from '@/components/ui/pagination';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';
import { ExecutionsTable } from './executions-table';
import {
  DURATION_OPTIONS,
  WHEN_OPTIONS,
  hasFilters,
  useExecutionFilters,
  type ExecutionFilters,
} from './list-params';
import { useExecutions, useWorkflowOptions } from './queries';

const STATUS_OPTIONS = [
  { value: '', label: 'All statuses' },
  ...EXECUTION_STATUSES.map((status) => ({
    value: status,
    label: STATUS_PRESENTATION[status].label,
  })),
] as const;

export function ExecutionsPage() {
  const { filters, update } = useExecutionFilters();
  const { data, error, isError, isPlaceholderData, refetch } = useExecutions(filters);
  const workflows = useWorkflowOptions();
  const filtered = hasFilters(filters);

  useEffect(() => {
    if (data && data.data.length === 0 && filters.page > 1) {
      update({ page: Math.max(1, data.pagination.totalPages) }, { replace: true });
    }
  }, [data, filters.page]);

  const known = workflows.data ?? [];
  const workflowOptions = [
    { value: '', label: 'All workflows' },
    ...known.map(({ id, name }) => ({ value: id, label: name })),
    ...(filters.workflow && !known.some(({ id }) => id === filters.workflow)
      ? [{ value: filters.workflow, label: 'Unknown workflow' }]
      : []),
  ];

  function clearFilters() {
    const cleared: Partial<ExecutionFilters> = {
      status: undefined,
      workflow: undefined,
      when: undefined,
      duration: undefined,
    };
    update(cleared);
  }

  let content;
  if (isError && !data) {
    content = <ErrorState what="your executions" error={error} onRetry={() => void refetch()} />;
  } else if (!data) {
    content = (
      <Card className="space-y-3 p-4">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </Card>
    );
  } else if (data.pagination.total === 0 && !filtered) {
    content = (
      <EmptyState
        icon={Inbox}
        title="No executions yet"
        description="Run a workflow to see its executions here."
        action={
          <Link to="/workflows" className={buttonVariants({ variant: 'outline' })}>
            Go to workflows
          </Link>
        }
      />
    );
  } else if (data.data.length === 0 && filtered) {
    content = (
      <EmptyState
        icon={SearchX}
        title="No executions match your filters"
        description="Try a wider time range or fewer filters."
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
        <Card
          className={cn('overflow-hidden', isPlaceholderData && 'opacity-60 transition-opacity')}
        >
          <ExecutionsTable rows={data.data} caption="Executions" showAttempts />
        </Card>
        <Pagination
          page={data.pagination.page}
          totalPages={data.pagination.totalPages}
          total={data.pagination.total}
          noun="execution"
          onPageChange={(page) => update({ page })}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader title="Executions" description="Every run, step by step." />
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <FilterSelect
          label="Status"
          value={filters.status}
          onChange={(status) => update({ status })}
          options={STATUS_OPTIONS}
        />
        <FilterSelect
          label="Workflow"
          value={filters.workflow}
          onChange={(workflow) => update({ workflow })}
          options={workflowOptions}
        />
        <FilterSelect
          label="Date"
          value={filters.when}
          onChange={(when) => update({ when })}
          options={WHEN_OPTIONS}
        />
        <FilterSelect
          label="Duration"
          value={filters.duration}
          onChange={(duration) => update({ duration })}
          options={DURATION_OPTIONS}
        />
        {filtered ? (
          <Button variant="ghost" size="sm" onClick={clearFilters}>
            Clear filters
          </Button>
        ) : null}
      </div>
      {content}
    </>
  );
}

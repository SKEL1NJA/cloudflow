import { ArrowDown, ArrowUp, ChevronsUpDown, Plus, Search, SearchX, Workflow } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/layout/empty-state';
import { ErrorState } from '@/components/layout/error-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button, buttonVariants } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Pagination } from '@/components/ui/pagination';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { Skeleton } from '@/components/ui/skeleton';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useNow } from '@/hooks/use-now';
import { cn } from '@/lib/utils';
import { useWorkflows } from '@/queries/workflows';
import { toApiParams, useWorkflowListParams, type ListParams } from './list-params';
import { WorkflowRow } from './workflow-row';

const STATUS_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'enabled', label: 'Enabled' },
  { value: 'disabled', label: 'Disabled' },
] as const;

type SortColumn = 'name' | 'updatedAt';

interface SortHeaderProps {
  column: SortColumn;
  label: string;
  params: ListParams;
  onSort: (column: SortColumn) => void;
}

function SortHeader({ column, label, params, onSort }: SortHeaderProps) {
  const active = params.sort === column;
  const ariaSort = active ? (params.order === 'asc' ? 'ascending' : 'descending') : 'none';
  const Icon = active ? (params.order === 'asc' ? ArrowUp : ArrowDown) : ChevronsUpDown;

  return (
    <th scope="col" aria-sort={ariaSort} className="px-4 py-2 font-medium whitespace-nowrap">
      <button
        type="button"
        onClick={() => onSort(column)}
        className="inline-flex items-center gap-1 rounded-sm outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        {label}
        <Icon className="size-3.5" aria-hidden="true" />
      </button>
    </th>
  );
}

export function WorkflowsPage() {
  const { params, update } = useWorkflowListParams();
  const now = useNow(30_000);
  const [text, setText] = useState(params.q);
  const debouncedText = useDebouncedValue(text, 300);
  const { data, error, isError, isPlaceholderData, refetch } = useWorkflows(toApiParams(params));
  const hasFilters = params.q !== '' || params.status !== 'all';

  useEffect(() => {
    const next = debouncedText.trim();
    if (next !== params.q) update({ q: next }, { replace: true });
  }, [debouncedText]);

  useEffect(() => {
    if (data && data.data.length === 0 && params.page > 1) {
      update({ page: Math.max(1, data.pagination.totalPages) }, { replace: true });
    }
  }, [data, params.page]);

  function handleSort(column: SortColumn) {
    if (params.sort === column) update({ order: params.order === 'asc' ? 'desc' : 'asc' });
    else update({ sort: column, order: column === 'name' ? 'asc' : 'desc' });
  }

  function clearFilters() {
    setText('');
    update({ q: '', status: 'all' });
  }

  const createLink = (
    <Link to="/workflows/new" className={buttonVariants()}>
      <Plus aria-hidden="true" />
      Create workflow
    </Link>
  );

  let content;
  if (isError && !data) {
    content = <ErrorState what="your workflows" error={error} onRetry={() => void refetch()} />;
  } else if (!data) {
    content = (
      <Card className="space-y-3 p-4">
        {Array.from({ length: 6 }, (_, index) => (
          <Skeleton key={index} className="h-10 w-full" />
        ))}
      </Card>
    );
  } else if (data.pagination.total === 0 && !hasFilters) {
    content = (
      <EmptyState
        icon={Workflow}
        title="No workflows yet"
        description="Create your first workflow."
        action={createLink}
      />
    );
  } else if (data.data.length === 0 && hasFilters) {
    content = (
      <EmptyState
        icon={SearchX}
        title="No workflows match your filters"
        description="Try a different search, or clear the filters."
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
        <Card className={cn('overflow-hidden', isPlaceholderData && 'opacity-60 transition-opacity')}>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <caption className="sr-only">Workflows</caption>
              <thead>
                <tr className="border-b text-left text-xs text-muted-foreground">
                  <SortHeader column="name" label="Name" params={params} onSort={handleSort} />
                  <th scope="col" className="hidden px-4 py-2 font-medium lg:table-cell">
                    Description
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Status
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium">
                    Steps
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium whitespace-nowrap">
                    Last run
                  </th>
                  <th scope="col" className="px-4 py-2 font-medium whitespace-nowrap" title="Over the last 30 days">
                    Success rate
                  </th>
                  <SortHeader column="updatedAt" label="Updated" params={params} onSort={handleSort} />
                  <th scope="col" className="px-2 py-2">
                    <span className="sr-only">Actions</span>
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {data.data.map((workflow) => (
                  <WorkflowRow key={workflow.id} workflow={workflow} now={now} />
                ))}
              </tbody>
            </table>
          </div>
        </Card>
        <Pagination
          page={data.pagination.page}
          totalPages={data.pagination.totalPages}
          total={data.pagination.total}
          noun="workflow"
          onPageChange={(page) => update({ page })}
        />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Workflows"
        description="Create and manage your workflows."
        actions={createLink}
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
            placeholder="Search workflows"
            aria-label="Search workflows"
            className="w-64 pl-9"
          />
        </div>
        <SegmentedControl
          label="Status"
          value={params.status}
          onChange={(status) => update({ status })}
          options={STATUS_OPTIONS}
        />
      </div>
      {content}
    </>
  );
}
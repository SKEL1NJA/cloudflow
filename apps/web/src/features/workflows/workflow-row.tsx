import type { WorkflowSummary } from '@cloudflow/shared';
import { Ellipsis, LoaderCircle, Play } from 'lucide-react';
import { useState } from 'react';
import { Link, useNavigate } from 'react-router';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Switch } from '@/components/ui/switch';
import { formatDateTime, formatRelativeTime } from '@/lib/format';
import { DeleteWorkflowDialog } from './delete-workflow-dialog';
import { newRunVariables, useRunWorkflow, useToggleWorkflow } from './mutations';

interface WorkflowRowProps {
  workflow: WorkflowSummary;
  now: number;
}

export function WorkflowRow({ workflow, now }: WorkflowRowProps) {
  const navigate = useNavigate();
  const toggle = useToggleWorkflow();
  const run = useRunWorkflow();
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const detailPath = `/workflows/${workflow.id}`;

  return (
    <>
      <tr className="transition-colors hover:bg-accent/50">
        <td className="px-4 py-2.5">
          <Link
            to={detailPath}
            className="rounded-sm font-medium outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {workflow.name}
          </Link>
        </td>
        <td className="hidden max-w-72 truncate px-4 py-2.5 text-muted-foreground lg:table-cell">
          {workflow.description ?? '-'}
        </td>
        <td className="px-4 py-2.5">
          <div className="flex items-center gap-2">
            <Switch
              checked={workflow.enabled}
              disabled={toggle.isPending}
              aria-label={`${workflow.name} enabled`}
              onCheckedChange={(enabled) => toggle.mutate({ id: workflow.id, enabled })}
            />
            <span className="text-xs text-muted-foreground">{workflow.enabled ? 'Enabled' : 'Disabled'}</span>
          </div>
        </td>
        <td className="px-4 py-2.5 tabular-nums text-muted-foreground">{workflow.stepCount}</td>
        <td className="px-4 py-2.5">
          {workflow.lastRun ? (
            <div className="flex items-center gap-2">
              <StatusBadge status={workflow.lastRun.status} />
              <span
                className="text-xs whitespace-nowrap text-muted-foreground"
                title={formatDateTime(workflow.lastRun.at)}
              >
                {formatRelativeTime(workflow.lastRun.at, now)}
              </span>
            </div>
          ) : (
            <span className="text-muted-foreground">Never run</span>
          )}
        </td>
        <td
          className="px-4 py-2.5 tabular-nums text-muted-foreground"
          title={`${workflow.finishedRuns} finished runs in the last 30 days`}
        >
          {workflow.successRate === null ? '-' : `${Math.round(workflow.successRate * 100)}%`}
        </td>
        <td
          className="px-4 py-2.5 whitespace-nowrap text-muted-foreground"
          title={formatDateTime(workflow.updatedAt)}
        >
          {formatRelativeTime(workflow.updatedAt, now)}
        </td>
        <td className="px-2 py-2.5">
          <div className="flex justify-end gap-1">
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label={`Run ${workflow.name}`}
              title={workflow.enabled ? 'Run now' : 'Enable the workflow to run it'}
              disabled={!workflow.enabled || run.isPending}
              onClick={() => run.mutate(newRunVariables(workflow.id))}
            >
              {run.isPending ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : <Play aria-hidden="true" />}
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-8" aria-label={`Actions for ${workflow.name}`}>
                  <Ellipsis aria-hidden="true" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent>
                <DropdownMenuItem onSelect={() => void navigate(detailPath)}>View details</DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem variant="destructive" onSelect={() => setConfirmingDelete(true)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </td>
      </tr>
      <DeleteWorkflowDialog workflow={workflow} open={confirmingDelete} onOpenChange={setConfirmingDelete} />
    </>
  );
}
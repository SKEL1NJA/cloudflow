import type { ExecutionSummary } from '@cloudflow/shared';
import { Link, useNavigate } from 'react-router';
import { RelativeTime } from '@/components/relative-time';
import { StatusBadge } from '@/components/status-badge';
import { formatDuration, shortExecutionId } from '@/lib/format';

interface ExecutionsTableProps {
  rows: ExecutionSummary[];
  caption: string;
  showWorkflow?: boolean;
  showAttempts?: boolean;
}

export function ExecutionsTable({
  rows,
  caption,
  showWorkflow = true,
  showAttempts = false,
}: ExecutionsTableProps) {
  const navigate = useNavigate();
  const headers = [
    'Execution',
    ...(showWorkflow ? ['Workflow'] : []),
    'Status',
    'Duration',
    'Started',
    ...(showAttempts ? ['Attempts'] : []),
  ];

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            {headers.map((header) => (
              <th key={header} scope="col" className="px-5 py-2 font-medium whitespace-nowrap">
                {header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((execution) => (
            <tr
              key={execution.id}
              onClick={() => void navigate(`/executions/${execution.id}`)}
              className="cursor-pointer transition-colors hover:bg-accent/50"
            >
              <td className="px-5 py-2.5 whitespace-nowrap">
                <Link
                  to={`/executions/${execution.id}`}
                  onClick={(event) => event.stopPropagation()}
                  className="font-mono text-xs outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                >
                  {shortExecutionId(execution.id)}
                </Link>
              </td>
              {showWorkflow ? (
                <td className="max-w-64 truncate px-5 py-2.5">{execution.workflowName}</td>
              ) : null}
              <td className="px-5 py-2.5">
                <StatusBadge status={execution.status} />
              </td>
              <td className="px-5 py-2.5 tabular-nums text-muted-foreground">
                {formatDuration(execution.durationMs)}
              </td>
              <td className="px-5 py-2.5 whitespace-nowrap text-muted-foreground">
                <RelativeTime iso={execution.startedAt ?? execution.createdAt} />
              </td>
              {showAttempts ? (
                <td
                  className="px-5 py-2.5 tabular-nums text-muted-foreground"
                  title={`${execution.attempts} attempts across ${execution.stepCount} steps`}
                >
                  {execution.attempts}
                </td>
              ) : null}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

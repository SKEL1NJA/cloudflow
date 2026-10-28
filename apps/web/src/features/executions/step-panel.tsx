import type { ExecutionDetail, LogEntry, StepExecutionView } from '@cloudflow/shared';
import { LoaderCircle } from 'lucide-react';
import { useRef } from 'react';
import type { ReactNode } from 'react';
import { StatusBadge } from '@/components/status-badge';
import { Button } from '@/components/ui/button';
import { formatDateTime, formatDuration } from '@/lib/format';
import { cn } from '@/lib/utils';
import { JsonBlock } from './json-block';
import { LogLines } from './log-lines';
import { RetryCountdown } from './retry-countdown';

interface StepPanelProps {
  id: string;
  execution: ExecutionDetail;
  step: StepExecutionView;
  logs: LogEntry[];
  canRetry: boolean;
  retrying: boolean;
  onRetry: () => void;
}

function Detail({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 text-sm">{children}</dd>
    </div>
  );
}

export function StepPanel({
  id,
  execution,
  step,
  logs,
  canRetry,
  retrying,
  onRetry,
}: StepPanelProps) {
  const logsRef = useRef<HTMLDivElement>(null);
  const failed = step.status === 'FAILED';
  const willRetry = step.status === 'RETRYING';

  function showLogs() {
    logsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    logsRef.current?.focus();
  }

  return (
    <div
      id={id}
      role="region"
      aria-label={`${step.name} details`}
      className="space-y-5 border-t px-4 py-4"
    >
      {failed || willRetry ? (
        <div
          role="group"
          aria-label={`${step.name} failure`}
          className={cn(
            'rounded-md border p-3',
            failed ? 'border-danger/40 bg-danger/10' : 'border-warning/40 bg-warning/10',
          )}
        >
          <p
            className={cn(
              'text-xs font-semibold tracking-wide uppercase',
              failed ? 'text-danger' : 'text-warning',
            )}
          >
            {failed ? 'Error' : 'Failed, will retry'}
          </p>
          <p className="mt-1 font-mono text-xs break-words">
            {step.error ?? 'No error message was recorded.'}
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Attempt {step.attempts} / {execution.maxAttempts}
            {willRetry && step.nextRetryAt ? (
              <>
                {' · Next retry '}
                <RetryCountdown at={step.nextRetryAt} />
              </>
            ) : null}
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            {failed && canRetry ? (
              <Button size="sm" disabled={retrying} onClick={onRetry}>
                {retrying ? <LoaderCircle className="animate-spin" aria-hidden="true" /> : null}
                Retry from this step
              </Button>
            ) : null}
            <Button variant="outline" size="sm" onClick={showLogs}>
              View logs
            </Button>
          </div>
        </div>
      ) : null}

      <dl className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <Detail label="Status">
          <StatusBadge status={step.status} />
        </Detail>
        <Detail label="Duration">{formatDuration(step.durationMs)}</Detail>
        <Detail label="Attempts">
          {step.attempts} of {execution.maxAttempts}
        </Detail>
        <Detail label="Worker">
          {step.workerId ? (
            <span className="font-mono text-xs break-all">{step.workerId}</span>
          ) : (
            '-'
          )}
        </Detail>
        <Detail label="Started">{step.startedAt ? formatDateTime(step.startedAt) : '-'}</Detail>
        <Detail label="Finished">{step.finishedAt ? formatDateTime(step.finishedAt) : '-'}</Detail>
      </dl>

      <div className="grid gap-4 lg:grid-cols-2">
        <JsonBlock label="Input" value={step.input} />
        <JsonBlock label="Output" value={step.output} />
      </div>

      <div
        ref={logsRef}
        role="region"
        aria-label={`${step.name} logs`}
        tabIndex={-1}
        className="outline-none"
      >
        <h4 className="mb-1.5 text-xs font-medium text-muted-foreground">Logs</h4>
        <LogLines entries={logs} />
      </div>
    </div>
  );
}

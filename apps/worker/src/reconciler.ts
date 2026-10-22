import type { PrismaClient } from '@cloudflow/db';
import {
  deadLetterStep,
  enqueueRecovery,
  listLiveStepIds,
  type DeadLetterQueue,
  type EventPublisher,
  type StepQueue,
} from '@cloudflow/queue';
import { assertNever } from '@cloudflow/shared';
import type { Logger } from 'pino';
import { markStepFailed } from './step-state.js';

export type RecoveryReason =
  | 'pending_not_queued'
  | 'retry_lost'
  | 'worker_lost'
  | 'worker_lost_exhausted';

export interface ReconcilerOptions {
  graceMs: number;
  stuckRunningMs: number;
  batchSize: number;
  maxLiveJobsScanned: number;
}

export interface ReconcilerDeps {
  prisma: PrismaClient;
  queue: StepQueue;
  deadLetterQueue: DeadLetterQueue;
  logger: Logger;
  events?: EventPublisher;
  onRecovery?: (reason: RecoveryReason) => void;
}

export interface ReconcileResult {
  checked: number;
  recovered: number;
  failed: number;
  skipped: number;
}

interface Candidate {
  id: string;
  executionId: string;
  name: string;
  position: number;
  status: 'PENDING' | 'RETRYING' | 'RUNNING';
  attempts: number;
  maxAttempts: number;
  userId: string;
  workflowId: string;
  updatedAt: Date;
}

function reasonFor(candidate: Candidate): RecoveryReason {
  switch (candidate.status) {
    case 'PENDING':
      return 'pending_not_queued';
    case 'RETRYING':
      return 'retry_lost';
    case 'RUNNING':
      return candidate.attempts >= candidate.maxAttempts
        ? 'worker_lost_exhausted'
        : 'worker_lost';
    default:
      return assertNever(candidate.status);
  }
}

function describe(reason: RecoveryReason, stepName: string): string {
  switch (reason) {
    case 'pending_not_queued':
      return `Reconciler: step "${stepName}" was never queued, so it was queued now`;
    case 'retry_lost':
      return `Reconciler: the scheduled retry of step "${stepName}" was lost, so it was queued again`;
    case 'worker_lost':
      return `Reconciler: the worker running step "${stepName}" stopped responding, so the step was queued again`;
    case 'worker_lost_exhausted':
      return `Reconciler: step "${stepName}" kept losing its worker and has no attempts left`;
    default:
      return assertNever(reason);
  }
}

export async function reconcileOnce(
  deps: ReconcilerDeps,
  options: ReconcilerOptions,
  now: Date = new Date(),
): Promise<ReconcileResult> {
  const { prisma, queue, deadLetterQueue, logger, onRecovery, events } = deps;
  const graceCutoff = new Date(now.getTime() - options.graceMs);
  const stuckCutoff = new Date(now.getTime() - options.stuckRunningMs);

  const candidates = await prisma.$queryRaw<Candidate[]>`
    SELECT s.id,
           s.execution_id AS "executionId",
           s.name,
           s.position,
           s.status::text AS status,
           s.attempts,
           e.max_attempts AS "maxAttempts",
           e.user_id AS "userId",
           e.workflow_id AS "workflowId",
           s.updated_at AS "updatedAt"
    FROM step_executions s
    JOIN workflow_executions e ON e.id = s.execution_id
    LEFT JOIN step_executions p
           ON p.execution_id = s.execution_id AND p.position = s.position - 1
    WHERE e.status IN ('QUEUED', 'RUNNING')
      AND (
        (s.status = 'PENDING'
          AND s.updated_at < ${graceCutoff}::timestamptz
          AND (
            (s.position = 0 AND e.created_at < ${graceCutoff}::timestamptz)
            OR (p.status = 'SUCCESS' AND p.finished_at < ${graceCutoff}::timestamptz)
          ))
        OR (s.status = 'RETRYING'
          AND s.next_retry_at < ${graceCutoff}::timestamptz
          AND s.updated_at < ${graceCutoff}::timestamptz)
        OR (s.status = 'RUNNING'
          AND s.started_at < ${stuckCutoff}::timestamptz
          AND s.updated_at < ${stuckCutoff}::timestamptz)
      )
    ORDER BY s.id
    LIMIT ${options.batchSize}`;

  const result: ReconcileResult = {
    checked: candidates.length,
    recovered: 0,
    failed: 0,
    skipped: 0,
  };

  if (candidates.length === 0) return result;

  const live = await listLiveStepIds(queue, options.maxLiveJobsScanned);
  if (live === null) {
    logger.warn(
      { candidates: candidates.length },
      'queue too deep to scan, skipping reconciliation',
    );
    result.skipped = candidates.length;
    return result;
  }

  for (const candidate of candidates) {
    if (live.has(candidate.id)) {
      result.skipped += 1;
      continue;
    }

    const seenAt = new Date(candidate.updatedAt);
    const touchedAt = new Date(
      Math.max(now.getTime(), seenAt.getTime() + 1),
    );

    const won = await prisma.stepExecution.updateMany({
      where: {
        id: candidate.id,
        status: candidate.status,
        updatedAt: seenAt,
      },
      data: { updatedAt: touchedAt },
    });

    if (won.count === 0) {
      result.skipped += 1;
      continue;
    }

    const reason = reasonFor(candidate);
    const message = describe(reason, candidate.name);
    const target = {
      executionId: candidate.executionId,
      stepExecutionId: candidate.id,
    };

    try {
      await prisma.executionLog.create({
        data: {
          ...target,
          level: 'WARN',
          message,
          meta: { reason },
        },
      });
    } catch (err) {
      logger.warn({ err, ...target }, 'failed to persist reconciler log');
    }

    logger.warn({ ...target, reason }, message);

    if (reason === 'worker_lost_exhausted') {
      const executionFailed = await markStepFailed(prisma, {
        stepId: candidate.id,
        executionId: candidate.executionId,
        position: candidate.position,
        error: 'The worker stopped responding during every attempt',
        summary: `Step "${candidate.name}" failed: the worker stopped responding during all ${candidate.attempts} attempts`,
        durationMs: null,
      });

      const scope = {
        userId: candidate.userId,
        workflowId: candidate.workflowId,
        executionId: candidate.executionId,
        at: new Date().toISOString(),
      };

      await events?.publish({
        type: 'step.updated',
        ...scope,
        stepId: candidate.id,
        position: candidate.position,
        status: 'FAILED',
        attempts: candidate.attempts,
        nextRetryAt: null,
      });

      if (executionFailed) {
        await events?.publish({
          type: 'execution.updated',
          ...scope,
          status: 'FAILED',
        });
      }

      try {
        await deadLetterStep(deadLetterQueue, {
          ...target,
          stepName: candidate.name,
          reason: 'WORKER_LOST',
          error: 'The worker stopped responding during every attempt',
          attempts: candidate.attempts,
          failedAt: new Date().toISOString(),
        });
      } catch (err) {
        logger.warn(
          { err, ...target },
          'failed to publish to the dead-letter queue',
        );
      }

      result.failed += 1;
    } else {
      await enqueueRecovery(queue, target, touchedAt.getTime());
      result.recovered += 1;
    }

    onRecovery?.(reason);
  }

  return result;
}

export interface Reconciler {
  stop: () => Promise<void>;
}

export function startReconciler(
  deps: ReconcilerDeps,
  options: ReconcilerOptions,
  intervalMs: number,
): Reconciler {
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let inFlight: Promise<void> = Promise.resolve();

  async function pass(): Promise<void> {
    try {
      const result = await reconcileOnce(deps, options);
      if (result.recovered + result.failed > 0) {
        deps.logger.info(result, 'reconciler pass finished');
      }
    } catch (err) {
      deps.logger.warn({ err }, 'reconciler pass failed');
    }
  }

  function schedule(): void {
    if (stopped) return;

    timer = setTimeout(() => {
      inFlight = pass().finally(schedule);
    }, intervalMs * (0.8 + Math.random() * 0.4));
  }

  schedule();

  return {
    async stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      await inFlight;
    },
  };
}

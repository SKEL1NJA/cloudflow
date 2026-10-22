import type { LogLevel, Prisma, PrismaClient } from '@cloudflow/db';
import {
  deadLetterStep,
  enqueueRetry,
  enqueueStep,
  type DeadLetterQueue,
  type DeadLetterReason,
  type EventPublisher,
  type StepProcessor,
  type StepQueue,
} from '@cloudflow/queue';
import {
  workflowStepSchema,
  type ExecutionStatus,
  type JsonValue,
  type StepExecutionStatus,
} from '@cloudflow/shared';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { executeStep } from './executors/index.js';
import { StepError, type StepContext } from './executors/types.js';
import type { StepObserver } from './observer.js';
import { backoffDelayMs, decideFailure } from './retry.js';
import { markStepFailed } from './step-state.js';

export interface ProcessorDeps {
  prisma: PrismaClient;
  queue: StepQueue;
  deadLetterQueue: DeadLetterQueue;
  workerId: string;
  logger: Logger;
  allowPrivateNetwork: boolean;
  observer?: StepObserver;
  events?: EventPublisher;
}

interface StepRow {
  id: string;
  executionId: string;
  position: number;
  name: string;
}

interface Scope {
  userId: string;
  workflowId: string;
}

interface Failure {
  error: string;
  retryable: boolean;
}

interface RetryPolicy {
  maxAttempts: number;
  backoffBaseMs: number;
}

type StepOutcome = { ok: true; output: JsonValue } | ({ ok: false } & Failure);

const PINO_LEVELS = {
  DEBUG: 'debug',
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
} as const satisfies Record<LogLevel, string>;
const MAX_ERROR_LENGTH = 2000;

function hasErrorCode(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === code;
}

function classifyError(err: unknown): Failure {
  if (err instanceof ZodError) return { error: 'Invalid step configuration', retryable: false };
  if (err instanceof StepError) {
    return { error: err.message.slice(0, MAX_ERROR_LENGTH), retryable: err.retryable };
  }
  const message = err instanceof Error ? err.message : String(err);
  return { error: message.slice(0, MAX_ERROR_LENGTH), retryable: true };
}

export function createStepProcessor(deps: ProcessorDeps): StepProcessor {
  const { prisma, queue, deadLetterQueue, workerId, logger, allowPrivateNetwork, observer, events } =
    deps;

  async function record(
    executionId: string,
    stepExecutionId: string | null,
    level: LogLevel,
    message: string,
    meta?: Record<string, JsonValue>,
  ): Promise<void> {
    logger[PINO_LEVELS[level]]({ executionId, stepExecutionId, ...meta }, message);
    try {
      await prisma.executionLog.create({
        data: {
          executionId,
          stepExecutionId,
          level,
          message,
          meta: meta as Prisma.InputJsonObject | undefined,
        },
      });
    } catch (err) {
      logger.warn({ err, executionId }, 'failed to persist execution log');
    }
  }

  function emitExecution(scope: Scope, executionId: string, status: ExecutionStatus): Promise<void> {
    return (
      events?.publish({
        type: 'execution.updated',
        userId: scope.userId,
        workflowId: scope.workflowId,
        executionId,
        status,
        at: new Date().toISOString(),
      }) ?? Promise.resolve()
    );
  }

  function emitStep(
    scope: Scope,
    step: StepRow,
    status: StepExecutionStatus,
    attempts: number,
    nextRetryAt: Date | null,
  ): Promise<void> {
    return (
      events?.publish({
        type: 'step.updated',
        userId: scope.userId,
        workflowId: scope.workflowId,
        executionId: step.executionId,
        stepId: step.id,
        position: step.position,
        status,
        attempts,
        nextRetryAt: nextRetryAt?.toISOString() ?? null,
        at: new Date().toISOString(),
      }) ?? Promise.resolve()
    );
  }

  async function queueNextStep(executionId: string, position: number): Promise<boolean> {
    const next = await prisma.stepExecution.findUnique({
      where: { executionId_position: { executionId, position: position + 1 } },
      select: { id: true },
    });
    if (!next) return false;
    await enqueueStep(queue, { executionId, stepExecutionId: next.id });
    return true;
  }

  async function resolveInput(
    executionId: string,
    position: number,
    executionInput: Prisma.JsonValue,
  ): Promise<JsonValue> {
    if (position === 0) {
      return (executionInput as JsonValue | null) ?? {};
    }
    const previous = await prisma.stepExecution.findUnique({
      where: { executionId_position: { executionId, position: position - 1 } },
      select: { output: true },
    });
    return (previous?.output as JsonValue | null) ?? {};
  }

  async function claimStep(stepExecutionId: string, input: JsonValue): Promise<number | null> {
    try {
      const claimed = await prisma.stepExecution.update({
        where: { id: stepExecutionId, status: { in: ['PENDING', 'RETRYING', 'RUNNING'] } },
        data: {
          status: 'RUNNING',
          attempts: { increment: 1 },
          workerId,
          input: input as Prisma.InputJsonValue,
          startedAt: new Date(),
          finishedAt: null,
          error: null,
          nextRetryAt: null,
        },
        select: { attempts: true },
      });
      return claimed.attempts;
    } catch (err) {
      if (hasErrorCode(err, 'P2025')) return null;
      throw err;
    }
  }

  async function runStep(
    step: StepRow & { type: string; config: Prisma.JsonValue },
    input: JsonValue,
    ctx: StepContext,
  ): Promise<StepOutcome> {
    try {
      const definition = workflowStepSchema.parse({
        type: step.type,
        name: step.name,
        config: step.config,
      });
      return { ok: true, output: await executeStep(definition, input, ctx) };
    } catch (err) {
      return { ok: false, ...classifyError(err) };
    }
  }

  async function completeStep(
    step: StepRow,
    scope: Scope,
    attempt: number,
    output: JsonValue,
    durationMs: number,
  ): Promise<void> {
    const { next, finished } = await prisma.$transaction(async (tx) => {
      await tx.stepExecution.update({
        where: { id: step.id },
        data: {
          status: 'SUCCESS',
          output: output as Prisma.InputJsonValue,
          finishedAt: new Date(),
          durationMs,
        },
      });
      const following = await tx.stepExecution.findUnique({
        where: {
          executionId_position: { executionId: step.executionId, position: step.position + 1 },
        },
        select: { id: true },
      });
      let completed = false;
      if (!following) {
        const done = await tx.workflowExecution.updateMany({
          where: { id: step.executionId, status: 'RUNNING' },
          data: { status: 'SUCCESS', finishedAt: new Date() },
        });
        completed = done.count > 0;
      }
      return { next: following, finished: completed };
    });

    await record(step.executionId, step.id, 'INFO', `Step "${step.name}" succeeded`, {
      durationMs,
      attempt,
    });
    await emitStep(scope, step, 'SUCCESS', attempt, null);

    if (next) {
      await enqueueStep(queue, { executionId: step.executionId, stepExecutionId: next.id });
      await record(step.executionId, step.id, 'INFO', 'Next step queued');
    } else if (finished) {
      await record(step.executionId, null, 'INFO', 'Execution succeeded');
      await emitExecution(scope, step.executionId, 'SUCCESS');
    }
  }

  async function scheduleRetry(
    step: StepRow,
    scope: Scope,
    attempt: number,
    policy: RetryPolicy,
    failure: Failure,
    durationMs: number,
  ): Promise<void> {
    const delayMs = backoffDelayMs(attempt, policy.backoffBaseMs);
    const nextRetryAt = new Date(Date.now() + delayMs);

    await prisma.stepExecution.update({
      where: { id: step.id },
      data: { status: 'RETRYING', error: failure.error, nextRetryAt, durationMs },
    });
    await record(
      step.executionId,
      step.id,
      'WARN',
      `Step "${step.name}" failed on attempt ${attempt} of ${policy.maxAttempts}: ${failure.error}. Retrying in ${(delayMs / 1000).toFixed(1)}s`,
      { attempt, delayMs },
    );
    await emitStep(scope, step, 'RETRYING', attempt, nextRetryAt);

    await enqueueRetry(
      queue,
      { executionId: step.executionId, stepExecutionId: step.id },
      attempt,
      delayMs,
    );
  }

  async function failStep(
    step: StepRow,
    scope: Scope,
    attempt: number,
    failure: Failure,
    reason: DeadLetterReason,
    durationMs: number,
  ): Promise<void> {
    const summary =
      reason === 'RETRIES_EXHAUSTED'
        ? `Step "${step.name}" failed after ${attempt} attempts: ${failure.error}`
        : `Step "${step.name}" failed: ${failure.error}`;

    const executionFailed = await markStepFailed(prisma, {
      stepId: step.id,
      executionId: step.executionId,
      position: step.position,
      error: failure.error,
      summary,
      durationMs,
    });
    await record(step.executionId, step.id, 'ERROR', summary, { attempt, reason });
    await emitStep(scope, step, 'FAILED', attempt, null);
    if (executionFailed) {
      await record(step.executionId, null, 'ERROR', 'Execution failed');
      await emitExecution(scope, step.executionId, 'FAILED');
    }

    try {
      await deadLetterStep(deadLetterQueue, {
        executionId: step.executionId,
        stepExecutionId: step.id,
        stepName: step.name,
        reason,
        error: failure.error,
        attempts: attempt,
        failedAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.warn({ err, stepExecutionId: step.id }, 'failed to publish to the dead-letter queue');
    }
  }

  return async function processStepJob(job) {
    const { executionId, stepExecutionId } = job.data;

    const step = await prisma.stepExecution.findUnique({
      where: { id: stepExecutionId },
      include: {
        execution: {
          select: {
            status: true,
            input: true,
            maxAttempts: true,
            backoffBaseMs: true,
            userId: true,
            workflowId: true,
          },
        },
      },
    });
    if (!step || step.executionId !== executionId) {
      logger.warn({ executionId, stepExecutionId }, 'step no longer exists, dropping job');
      return;
    }

    if (step.status === 'SUCCESS') {
      const queued = await queueNextStep(executionId, step.position);
      logger.info({ executionId, stepExecutionId, queued }, 'step already completed, skipped re-execution');
      return;
    }
    if (step.status === 'FAILED' || step.status === 'SKIPPED') return;
    if (step.execution.status === 'CANCELLED') {
      await prisma.stepExecution.updateMany({
        where: { id: stepExecutionId, status: { in: ['PENDING', 'RETRYING'] } },
        data: { status: 'SKIPPED', nextRetryAt: null },
      });
      return;
    }
    if (step.execution.status !== 'QUEUED' && step.execution.status !== 'RUNNING') return;

    const scope: Scope = { userId: step.execution.userId, workflowId: step.execution.workflowId };
    const input = await resolveInput(executionId, step.position, step.execution.input);
    const attempt = await claimStep(stepExecutionId, input);
    if (attempt === null) return;

    const started = await prisma.workflowExecution.updateMany({
      where: { id: executionId, status: 'QUEUED' },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    if (started.count > 0) {
      await record(executionId, null, 'INFO', 'Execution started', { workerId });
      await emitExecution(scope, executionId, 'RUNNING');
    }
    await emitStep(scope, step, 'RUNNING', attempt, null);

    const policy: RetryPolicy = {
      maxAttempts: step.execution.maxAttempts,
      backoffBaseMs: step.execution.backoffBaseMs,
    };
    const ctx: StepContext = {
      stepExecutionId,
      attempt,
      allowPrivateNetwork,
      log: (level, message, meta) => record(executionId, stepExecutionId, level, message, meta),
    };
    await ctx.log('INFO', `Step "${step.name}" started`, {
      attempt,
      maxAttempts: policy.maxAttempts,
      type: step.type,
    });

    const startedAtMs = Date.now();
    const outcome = await runStep(step, input, ctx);
    const durationMs = Date.now() - startedAtMs;

    if (outcome.ok) {
      await completeStep(step, scope, attempt, outcome.output, durationMs);
      observer?.stepFinished({ type: step.type, outcome: 'success', durationMs });
      return;
    }
    const decision = decideFailure({
      retryable: outcome.retryable,
      attempt,
      maxAttempts: policy.maxAttempts,
    });
    if (decision.action === 'retry') {
      await scheduleRetry(step, scope, attempt, policy, outcome, durationMs);
      observer?.stepFinished({ type: step.type, outcome: 'retry', durationMs });
    } else {
      await failStep(step, scope, attempt, outcome, decision.reason, durationMs);
      observer?.stepFinished({ type: step.type, outcome: 'failed', durationMs });
    }
  };
}
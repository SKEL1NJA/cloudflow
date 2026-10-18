import type { LogLevel, Prisma, PrismaClient } from '@cloudflow/db';
import { enqueueStep, type StepProcessor, type StepQueue } from '@cloudflow/queue';
import { workflowStepSchema, type JsonValue } from '@cloudflow/shared';
import type { Logger } from 'pino';
import { ZodError } from 'zod';
import { executeStep } from './executors/index.js';
import type { StepContext } from './executors/types.js';

export interface ProcessorDeps {
  prisma: PrismaClient;
  queue: StepQueue;
  workerId: string;
  logger: Logger;
}

interface StepRow {
  id: string;
  executionId: string;
  position: number;
  name: string;
}

type StepOutcome = { ok: true; output: JsonValue } | { ok: false; error: string };

const PINO_LEVELS = { DEBUG: 'debug', INFO: 'info', WARN: 'warn', ERROR: 'error' } as const satisfies Record<
  LogLevel,
  string
>;
const MAX_ERROR_LENGTH = 2000;

function hasErrorCode(err: unknown, code: string): boolean {
  return typeof err === 'object' && err !== null && 'code' in err && err.code === code;
}

function describeError(err: unknown): string {
  if (err instanceof ZodError) return 'Invalid step configuration';
  const message = err instanceof Error ? err.message : String(err);
  return message.slice(0, MAX_ERROR_LENGTH);
}

export function createStepProcessor(deps: ProcessorDeps): StepProcessor {
  const { prisma, queue, workerId, logger } = deps;

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

  async function runStep(step: StepRow & { type: string; config: Prisma.JsonValue }, input: JsonValue, ctx: StepContext): Promise<StepOutcome> {
    try {
      const definition = workflowStepSchema.parse({
        type: step.type,
        name: step.name,
        config: step.config,
      });
      return { ok: true, output: await executeStep(definition, input, ctx) };
    } catch (err) {
      return { ok: false, error: describeError(err) };
    }
  }

  async function completeStep(step: StepRow, output: JsonValue, durationMs: number): Promise<void> {
    const next = await prisma.$transaction(async (tx) => {
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
        where: { executionId_position: { executionId: step.executionId, position: step.position + 1 } },
        select: { id: true },
      });
      if (!following) {
        await tx.workflowExecution.updateMany({
          where: { id: step.executionId, status: 'RUNNING' },
          data: { status: 'SUCCESS', finishedAt: new Date() },
        });
      }
      return following;
    });

    await record(step.executionId, step.id, 'INFO', `Step "${step.name}" succeeded`, { durationMs });

    if (next) {
      await enqueueStep(queue, { executionId: step.executionId, stepExecutionId: next.id });
      await record(step.executionId, step.id, 'INFO', 'Next step queued');
    } else {
      await record(step.executionId, null, 'INFO', 'Execution succeeded');
    }
  }

  async function failStep(step: StepRow, error: string, durationMs: number): Promise<void> {
    await prisma.$transaction(async (tx) => {
      await tx.stepExecution.update({
        where: { id: step.id },
        data: { status: 'FAILED', error, finishedAt: new Date(), durationMs },
      });
      await tx.stepExecution.updateMany({
        where: { executionId: step.executionId, position: { gt: step.position }, status: 'PENDING' },
        data: { status: 'SKIPPED' },
      });
      await tx.workflowExecution.updateMany({
        where: { id: step.executionId, status: { in: ['QUEUED', 'RUNNING'] } },
        data: {
          status: 'FAILED',
          error: `Step "${step.name}" failed: ${error}`,
          finishedAt: new Date(),
        },
      });
    });
    await record(step.executionId, step.id, 'ERROR', `Step "${step.name}" failed: ${error}`, { durationMs });
    await record(step.executionId, null, 'ERROR', 'Execution failed');
  }

  return async function processStepJob(job) {
    const { executionId, stepExecutionId } = job.data;

    const step = await prisma.stepExecution.findUnique({
      where: { id: stepExecutionId },
      include: { execution: { select: { status: true, input: true } } },
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
    if (step.execution.status !== 'QUEUED' && step.execution.status !== 'RUNNING') return;

    const input = await resolveInput(executionId, step.position, step.execution.input);
    const attempt = await claimStep(stepExecutionId, input);
    if (attempt === null) return;

    const started = await prisma.workflowExecution.updateMany({
      where: { id: executionId, status: 'QUEUED' },
      data: { status: 'RUNNING', startedAt: new Date() },
    });
    if (started.count > 0) {
      await record(executionId, null, 'INFO', 'Execution started', { workerId });
    }

    const ctx: StepContext = {
      log: (level, message, meta) => record(executionId, stepExecutionId, level, message, meta),
    };
    await ctx.log('INFO', `Step "${step.name}" started`, { attempt, type: step.type });

    const startedAtMs = Date.now();
    const outcome = await runStep(step, input, ctx);
    const durationMs = Date.now() - startedAtMs;

    if (outcome.ok) {
      await completeStep(step, outcome.output, durationMs);
    } else {
      await failStep(step, outcome.error, durationMs);
    }
  };
}
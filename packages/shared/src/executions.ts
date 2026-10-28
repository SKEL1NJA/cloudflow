import { z } from 'zod';
import type { JsonValue } from './json.js';
import type { StepType } from './steps.js';

export const EXECUTION_STATUSES = ['QUEUED', 'RUNNING', 'SUCCESS', 'FAILED', 'CANCELLED'] as const;
export type ExecutionStatus = (typeof EXECUTION_STATUSES)[number];

export const STEP_EXECUTION_STATUSES = [
  'PENDING',
  'RUNNING',
  'RETRYING',
  'SUCCESS',
  'FAILED',
  'SKIPPED',
] as const;
export type StepExecutionStatus = (typeof STEP_EXECUTION_STATUSES)[number];

export const runWorkflowBodySchema = z
  .object({ input: z.record(z.string(), z.json()).optional() })
  .default({});

export const executionListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(EXECUTION_STATUSES).optional(),
  workflowId: z.uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
  minDurationMs: z.coerce.number().int().min(0).optional(),
  maxDurationMs: z.coerce.number().int().min(0).optional(),
});

export type RunWorkflowBody = z.infer<typeof runWorkflowBodySchema>;
export type ExecutionListQuery = z.infer<typeof executionListQuerySchema>;

export interface StepExecutionView {
  id: string;
  position: number;
  type: StepType;
  name: string;
  status: StepExecutionStatus;
  attempts: number;
  input: JsonValue | null;
  output: JsonValue | null;
  error: string | null;
  workerId: string | null;
  nextRetryAt: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface ExecutionSummary {
  id: string;
  workflowId: string;
  workflowName: string;
  status: ExecutionStatus;
  error: string | null;
  stepCount: number;
  attempts: number;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  durationMs: number | null;
}

export interface ExecutionDetail extends ExecutionSummary {
  input: JsonValue | null;
  steps: StepExecutionView[];
  maxAttempts: number;
  backoffBaseMs: number;
}

import { z } from 'zod';
import type { ExecutionStatus } from './executions.js';
import { workflowStepSchema, type WorkflowStepInput } from './steps.js';

const nameSchema = z.string().trim().min(1).max(100);
const descriptionSchema = z.string().trim().max(500);
const maxAttemptsSchema = z.number().int().min(1).max(10);
const backoffBaseMsSchema = z.number().int().min(100).max(60_000);

export const workflowDefinitionSchema = z.object({
  name: nameSchema,
  description: descriptionSchema.optional(),
  enabled: z.boolean().default(true),
  maxAttempts: maxAttemptsSchema.default(3),
  backoffBaseMs: backoffBaseMsSchema.default(2000),
  steps: z.array(workflowStepSchema).min(1).max(20),
});

export const workflowPatchSchema = z
  .object({
    name: nameSchema,
    description: descriptionSchema.nullable(),
    enabled: z.boolean(),
    maxAttempts: maxAttemptsSchema,
    backoffBaseMs: backoffBaseMsSchema,
  })
  .partial()
  .refine((value) => Object.keys(value).length > 0, {
    message: 'At least one field is required',
  });

export const workflowListQuerySchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  enabled: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  sortBy: z.enum(['name', 'createdAt', 'updatedAt']).default('updatedAt'),
  sortOrder: z.enum(['asc', 'desc']).default('desc'),
});

export type WorkflowDefinition = z.infer<typeof workflowDefinitionSchema>;
export type WorkflowPatch = z.infer<typeof workflowPatchSchema>;
export type WorkflowListQuery = z.infer<typeof workflowListQuerySchema>;

export interface PaginationMeta {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface Paginated<T> {
  data: T[];
  pagination: PaginationMeta;
}

export interface WorkflowRunSummary {
  status: ExecutionStatus;
  at: string;
}

export interface WorkflowSummary {
  id: string;
  name: string;
  description: string | null;
  enabled: boolean;
  maxAttempts: number;
  backoffBaseMs: number;
  stepCount: number;
  lastRun: WorkflowRunSummary | null;
  successRate: number | null;
  finishedRuns: number;
  createdAt: string;
  updatedAt: string;
}

export type WorkflowStepView = { id: string; position: number } & WorkflowStepInput;

export interface WorkflowDetail extends WorkflowSummary {
  steps: WorkflowStepView[];
}

import { z } from 'zod';
import type { JsonValue } from './json.js';

export const LOG_LEVELS = ['DEBUG', 'INFO', 'WARN', 'ERROR'] as const;
export type LogLevel = (typeof LOG_LEVELS)[number];

export const logListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(100),
  cursor: z
    .string()
    .regex(/^\d{1,18}$/)
    .optional(),
  search: z.string().trim().min(1).max(200).optional(),
  level: z.enum(LOG_LEVELS).optional(),
  workflowId: z.uuid().optional(),
  executionId: z.uuid().optional(),
  from: z.coerce.date().optional(),
  to: z.coerce.date().optional(),
});

export type LogListQuery = z.infer<typeof logListQuerySchema>;

export interface LogEntry {
  id: string;
  level: LogLevel;
  message: string;
  meta: JsonValue | null;
  createdAt: string;
  executionId: string;
  workflowId: string;
  workflowName: string;
  stepExecutionId: string | null;
  stepName: string | null;
}

export interface LogListResponse {
  data: LogEntry[];
  nextCursor: string | null;
}

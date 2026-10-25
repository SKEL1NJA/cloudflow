import { z } from 'zod';
import { EXECUTION_STATUSES, STEP_EXECUTION_STATUSES } from './executions.js';

const baseShape = {
  workflowId: z.uuid(),
  executionId: z.uuid(),
  at: z.iso.datetime(),
};

const executionUpdated = z.object({
  ...baseShape,
  type: z.literal('execution.updated'),
  status: z.enum(EXECUTION_STATUSES),
});

const stepUpdated = z.object({
  ...baseShape,
  type: z.literal('step.updated'),
  stepId: z.uuid(),
  position: z.number().int().min(0),
  status: z.enum(STEP_EXECUTION_STATUSES),
  attempts: z.number().int().min(0),
  nextRetryAt: z.iso.datetime().nullable(),
});

const owner = { userId: z.uuid() };

export const realtimeEventSchema = z.discriminatedUnion('type', [executionUpdated, stepUpdated]);

export const streamEventSchema = z.discriminatedUnion('type', [
  executionUpdated.extend(owner),
  stepUpdated.extend(owner),
]);

export type RealtimeEvent = z.infer<typeof realtimeEventSchema>;
export type StreamEvent = z.infer<typeof streamEventSchema>;

export function toClientEvent(event: StreamEvent): RealtimeEvent {
  const { userId: _userId, ...rest } = event;
  return rest as RealtimeEvent;
}

export const eventStreamQuerySchema = z.object({
  ticket: z.string().min(20).max(100).optional(),
  lastEventId: z.string().max(40).optional(),
});

export interface EventTicketResponse {
  ticket: string;
  expiresInSeconds: number;
}

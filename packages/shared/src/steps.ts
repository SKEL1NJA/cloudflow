import { z } from 'zod';

export const STEP_TYPES = ['HTTP_REQUEST', 'DELAY', 'TRANSFORM', 'NOTIFICATION'] as const;
export type StepType = (typeof STEP_TYPES)[number];

const httpUrlSchema = z.url({ protocol: /^https?$/ }).max(2048);
const stepNameSchema = z.string().trim().min(1).max(100);

export const httpRequestConfigSchema = z.object({
  method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
  url: httpUrlSchema,
  headers: z.record(z.string().min(1).max(100), z.string().max(2000)).default({}),
  body: z.json().optional(),
  timeoutMs: z.number().int().min(100).max(30_000).default(10_000),
});

export const delayConfigSchema = z.object({
  durationMs: z.number().int().min(100).max(300_000),
});

export const transformConfigSchema = z.object({
  mappings: z
    .array(
      z.object({
        target: z.string().trim().min(1).max(100),
        source: z.string().trim().min(1).max(200),
      }),
    )
    .min(1)
    .max(50),
});

export const notificationConfigSchema = z.object({
  message: z.string().trim().min(1).max(1000),
  webhookUrl: httpUrlSchema.optional(),
});

export const workflowStepSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('HTTP_REQUEST'),
    name: stepNameSchema,
    config: httpRequestConfigSchema,
  }),
  z.object({ type: z.literal('DELAY'), name: stepNameSchema, config: delayConfigSchema }),
  z.object({
    type: z.literal('TRANSFORM'),
    name: stepNameSchema,
    config: transformConfigSchema,
  }),
  z.object({
    type: z.literal('NOTIFICATION'),
    name: stepNameSchema,
    config: notificationConfigSchema,
  }),
]);

export type WorkflowStepInput = z.infer<typeof workflowStepSchema>;
export type WorkflowStepFormValues = z.input<typeof workflowStepSchema>;
export type HttpRequestConfig = z.infer<typeof httpRequestConfigSchema>;
export type DelayConfig = z.infer<typeof delayConfigSchema>;
export type TransformConfig = z.infer<typeof transformConfigSchema>;
export type NotificationConfig = z.infer<typeof notificationConfigSchema>;

import { z } from 'zod';
import { wholeNumber } from './numbers.js';

export const STEP_TYPES = ['HTTP_REQUEST', 'DELAY', 'TRANSFORM', 'NOTIFICATION'] as const;
export type StepType = (typeof STEP_TYPES)[number];

export const HTTP_METHODS = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export const RESERVED_HEADERS: ReadonlySet<string> = new Set([
  'host',
  'content-length',
  'transfer-encoding',
  'connection',
  'upgrade',
]);

const HEADER_NAME = /^[A-Za-z0-9!#$%&'*+.^_`|~-]+$/;

export function headerNameProblem(name: string): string | null {
  if (name === '') return 'Enter a header name';
  if (name.length > 100) return 'Use at most 100 characters';
  if (!HEADER_NAME.test(name)) return 'Use letters, numbers and dashes only';
  if (RESERVED_HEADERS.has(name.toLowerCase())) {
    return 'This header is set automatically and cannot be changed';
  }
  return null;
}

const httpUrlSchema = z
  .url({ protocol: /^https?$/, error: 'Enter a valid http or https URL' })
  .max(2048, 'Use at most 2048 characters');

const stepNameSchema = z
  .string()
  .trim()
  .min(1, 'Enter a name for the step')
  .max(100, 'Use at most 100 characters');

const headerNameSchema = z.string().superRefine((name, ctx) => {
  const problem = headerNameProblem(name);
  if (problem) ctx.addIssue({ code: 'custom', message: problem });
});

const headersSchema = z
  .record(headerNameSchema, z.string().max(2000, 'Use at most 2000 characters'))
  .refine(
    (headers) =>
      new Set(Object.keys(headers).map((name) => name.toLowerCase())).size ===
      Object.keys(headers).length,
    'Header names must be unique',
  );

export const httpRequestConfigSchema = z.object({
  method: z.enum(HTTP_METHODS).default('GET'),
  url: httpUrlSchema,
  headers: headersSchema.default({}),
  body: z.json().optional(),
  timeoutMs: wholeNumber(100, 30_000).default(10_000),
});

export const delayConfigSchema = z.object({
  durationMs: wholeNumber(100, 300_000),
});

export const transformConfigSchema = z.object({
  mappings: z
    .array(
      z.object({
        target: z
          .string()
          .trim()
          .min(1, 'Enter a field name')
          .max(100, 'Use at most 100 characters'),
        source: z
          .string()
          .trim()
          .min(1, 'Enter a source path')
          .max(200, 'Use at most 200 characters'),
      }),
    )
    .min(1, 'Add at least one mapping')
    .max(50, 'Use at most 50 mappings'),
});

export const notificationConfigSchema = z.object({
  message: z.string().trim().min(1, 'Enter a message').max(1000, 'Use at most 1000 characters'),
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

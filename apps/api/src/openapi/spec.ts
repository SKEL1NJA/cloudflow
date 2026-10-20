import {
  createApiKeySchema,
  executionListQuerySchema,
  logListQuerySchema,
  runWorkflowBodySchema,
  statsRangeQuerySchema,
  workflowDefinitionSchema,
  workflowListQuerySchema,
  workflowPatchSchema,
} from '@cloudflow/shared';
import { z } from 'zod';
import { loginSchema, registerSchema } from '../modules/auth/auth.schemas.js';

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Access = 'public' | 'any' | 'session';

interface Operation {
  method: Method;
  path: string;
  tag: string;
  summary: string;
  access: Access;
  success: number;
  errors?: number[];
  query?: z.ZodType;
  body?: z.ZodType;
  bodyRequired?: boolean;
  idempotencyKey?: boolean;
}

const operations: Operation[] = [
  { method: 'post', path: '/auth/register', tag: 'Auth', summary: 'Create an account', access: 'public', body: registerSchema, success: 201, errors: [400, 409] },
  { method: 'post', path: '/auth/login', tag: 'Auth', summary: 'Sign in and receive an access token', access: 'public', body: loginSchema, success: 200, errors: [400, 401] },
  { method: 'get', path: '/auth/me', tag: 'Auth', summary: 'Get the signed-in user', access: 'any', success: 200, errors: [401] },

  { method: 'post', path: '/workflows', tag: 'Workflows', summary: 'Create a workflow', access: 'any', body: workflowDefinitionSchema, success: 201, errors: [400, 401, 409] },
  { method: 'get', path: '/workflows', tag: 'Workflows', summary: 'List workflows', access: 'any', query: workflowListQuerySchema, success: 200, errors: [400, 401] },
  { method: 'get', path: '/workflows/{id}', tag: 'Workflows', summary: 'Get a workflow with its steps', access: 'any', success: 200, errors: [400, 401, 404] },
  { method: 'put', path: '/workflows/{id}', tag: 'Workflows', summary: 'Replace a workflow and all of its steps', access: 'any', body: workflowDefinitionSchema, success: 200, errors: [400, 401, 404, 409] },
  { method: 'patch', path: '/workflows/{id}', tag: 'Workflows', summary: 'Update workflow details', access: 'any', body: workflowPatchSchema, success: 200, errors: [400, 401, 404, 409] },
  { method: 'delete', path: '/workflows/{id}', tag: 'Workflows', summary: 'Delete a workflow and its history', access: 'any', success: 204, errors: [400, 401, 404] },
  { method: 'post', path: '/workflows/{id}/run', tag: 'Executions', summary: 'Start an execution', access: 'any', body: runWorkflowBodySchema, bodyRequired: false, idempotencyKey: true, success: 202, errors: [400, 401, 404, 409, 503] },

  { method: 'get', path: '/executions', tag: 'Executions', summary: 'List executions', access: 'any', query: executionListQuerySchema, success: 200, errors: [400, 401] },
  { method: 'get', path: '/executions/{id}', tag: 'Executions', summary: 'Get an execution with its steps', access: 'any', success: 200, errors: [400, 401, 404] },
  { method: 'post', path: '/executions/{id}/cancel', tag: 'Executions', summary: 'Cancel a queued or running execution', access: 'any', success: 200, errors: [400, 401, 404, 409] },
  { method: 'post', path: '/executions/{id}/retry', tag: 'Executions', summary: 'Retry a failed execution from the failed step', access: 'any', success: 202, errors: [400, 401, 404, 409] },

  { method: 'get', path: '/overview', tag: 'Monitoring', summary: 'Dashboard summary and system health', access: 'any', query: statsRangeQuerySchema, success: 200, errors: [400, 401] },
  { method: 'get', path: '/stats/executions', tag: 'Monitoring', summary: 'Executions over time', access: 'any', query: statsRangeQuerySchema, success: 200, errors: [400, 401] },
  { method: 'get', path: '/workers', tag: 'Monitoring', summary: 'List workers and their health', access: 'any', success: 200, errors: [401] },
  { method: 'get', path: '/queue', tag: 'Monitoring', summary: 'Current queue depth by state', access: 'any', success: 200, errors: [401] },
  { method: 'get', path: '/queue/activity', tag: 'Monitoring', summary: 'Finished steps over time', access: 'any', query: statsRangeQuerySchema, success: 200, errors: [400, 401] },
  { method: 'get', path: '/logs', tag: 'Monitoring', summary: 'Search execution logs, newest first', access: 'any', query: logListQuerySchema, success: 200, errors: [400, 401] },

  { method: 'post', path: '/api-keys', tag: 'API keys', summary: 'Create an API key (shown once)', access: 'session', body: createApiKeySchema, success: 201, errors: [400, 401, 403, 409] },
  { method: 'get', path: '/api-keys', tag: 'API keys', summary: 'List API keys', access: 'session', success: 200, errors: [401, 403] },
  { method: 'delete', path: '/api-keys/{id}', tag: 'API keys', summary: 'Revoke an API key', access: 'session', success: 204, errors: [400, 401, 403, 404] },

  { method: 'get', path: '/health', tag: 'Health', summary: 'Liveness probe', access: 'public', success: 200 },
  { method: 'get', path: '/health/ready', tag: 'Health', summary: 'Readiness probe for Postgres and Redis', access: 'public', success: 200, errors: [503] },
];

const SUCCESS_TEXT: Record<number, string> = {
  200: 'Success',
  201: 'Created',
  202: 'Accepted, processing continues in the background',
  204: 'No content',
};

const ERROR_TEXT: Record<number, string> = {
  400: 'Validation error',
  401: 'Missing or invalid credentials',
  403: 'Not allowed with these credentials',
  404: 'Not found',
  409: 'Conflict with the current state',
  503: 'A dependency is unavailable',
};

const apiErrorSchema = {
  type: 'object',
  required: ['error'],
  properties: {
    error: {
      type: 'object',
      required: ['code', 'message'],
      properties: { code: { type: 'string' }, message: { type: 'string' }, details: {} },
    },
  },
};

type JsonObject = Record<string, unknown>;

function toJsonSchema(schema: z.ZodType, name: string, components: JsonObject): JsonObject {
  const { $schema: _schema, $defs, ...rest } = z.toJSONSchema(schema, {
    io: 'input',
    unrepresentable: 'any',
  }) as JsonObject & { $defs?: JsonObject };

  const rewrite = (value: unknown): JsonObject =>
    JSON.parse(
      JSON.stringify(value).replaceAll('#/$defs/', `#/components/schemas/${name}_`),
    ) as JsonObject;

  for (const [key, definition] of Object.entries($defs ?? {})) {
    components[`${name}_${key}`] = rewrite(definition);
  }
  return rewrite(rest);
}

function queryParameters(schema: z.ZodType, name: string, components: JsonObject): JsonObject[] {
  const json = toJsonSchema(schema, name, components) as {
    properties?: Record<string, unknown>;
    required?: string[];
  };
  return Object.entries(json.properties ?? {}).map(([key, value]) => ({
    name: key,
    in: 'query',
    required: json.required?.includes(key) ?? false,
    schema: value,
  }));
}

function describeOperation(operation: Operation, components: JsonObject): JsonObject {
  const id = `${operation.method}_${operation.path}`.replace(/\W+/g, '_');
  const parameters: JsonObject[] = [];

  if (operation.path.includes('{id}')) {
    parameters.push({ name: 'id', in: 'path', required: true, schema: { type: 'string', format: 'uuid' } });
  }
  if (operation.query) {
    parameters.push(...queryParameters(operation.query, `${id}_query`, components));
  }
  if (operation.idempotencyKey) {
    parameters.push({
      name: 'Idempotency-Key',
      in: 'header',
      required: false,
      description: 'Repeating a request with the same key returns the original execution',
      schema: { type: 'string', maxLength: 200 },
    });
  }

  const errorContent = {
    'application/json': { schema: { $ref: '#/components/schemas/ApiError' } },
  };
  const responses: JsonObject = { [operation.success]: { description: SUCCESS_TEXT[operation.success] } };
  for (const status of operation.errors ?? []) {
    responses[status] = { description: ERROR_TEXT[status], content: errorContent };
  }

  return {
    operationId: id,
    tags: [operation.tag],
    summary: operation.summary,
    ...(operation.access !== 'public' && { security: [{ bearerAuth: [] }] }),
    ...(operation.access === 'session' && {
      description: 'Requires a signed-in session. API keys cannot call this endpoint.',
    }),
    ...(parameters.length > 0 && { parameters }),
    ...(operation.body && {
      requestBody: {
        required: operation.bodyRequired ?? true,
        content: { 'application/json': { schema: toJsonSchema(operation.body, `${id}_body`, components) } },
      },
    }),
    responses,
  };
}

export function buildOpenApiDocument(): JsonObject {
  const schemas: JsonObject = { ApiError: apiErrorSchema };
  const paths: Record<string, JsonObject> = {};

  for (const operation of operations) {
    const entry = (paths[operation.path] ??= {});
    entry[operation.method] = describeOperation(operation, schemas);
  }

  return {
    openapi: '3.1.0',
    info: {
      title: 'CloudFlow API',
      version: '0.1.0',
      description:
        'Authenticate with Authorization: Bearer <token>, using the access token from /auth/login or an API key that starts with cf_. Request bodies and query parameters are generated from the same schemas the API validates with. Responses are described by status code only.',
    },
    servers: [{ url: '/' }],
    tags: [...new Set(operations.map((operation) => operation.tag))].map((name) => ({ name })),
    components: {
      securitySchemes: { bearerAuth: { type: 'http', scheme: 'bearer' } },
      schemas,
    },
    paths,
  };
}
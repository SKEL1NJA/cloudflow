import { json, mockFetch } from './fetch';

export const WORKFLOW_ID = '01a14cec-f85d-7079-b268-9c29038eb32d';
export const OTHER_WORKFLOW_ID = '01a14cec-f85d-7079-b268-9c29038eb33d';
export const EXECUTION_ID = '01a14cec-f85d-7079-b268-9c29038eb40d';

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const page = (data: unknown[]) => ({
  data,
  pagination: { page: 1, pageSize: 20, total: data.length, totalPages: 1 },
});

const summary = (overrides: Record<string, unknown> = {}) => ({
  id: WORKFLOW_ID,
  name: 'Video Processing',
  description: 'Fetch, transform and notify',
  enabled: true,
  maxAttempts: 3,
  backoffBaseMs: 2000,
  stepCount: 4,
  lastRun: { status: 'FAILED', at: ago(5) },
  successRate: 0.5,
  finishedRuns: 10,
  createdAt: ago(1000),
  updatedAt: ago(60),
  ...overrides,
});

const workflowDetail = {
  ...summary(),
  steps: [
    {
      id: 's1',
      position: 0,
      type: 'HTTP_REQUEST',
      name: 'Fetch data',
      config: {
        method: 'POST',
        url: 'https://example.com/api/data',
        headers: { authorization: 'Bearer secret-token' },
        body: { a: 1 },
        timeoutMs: 10000,
      },
    },
    { id: 's2', position: 1, type: 'DELAY', name: 'Cool down', config: { durationMs: 1500 } },
    {
      id: 's3',
      position: 2,
      type: 'TRANSFORM',
      name: 'Pick fields',
      config: { mappings: [{ target: 'id', source: 'body.id' }] },
    },
    {
      id: 's4',
      position: 3,
      type: 'NOTIFICATION',
      name: 'Tell someone',
      config: { message: 'Done' },
    },
  ],
};

const executionRow = (overrides: Record<string, unknown> = {}) => ({
  id: EXECUTION_ID,
  workflowId: WORKFLOW_ID,
  workflowName: 'Video Processing',
  status: 'FAILED',
  error: 'Step failed',
  stepCount: 3,
  attempts: 5,
  createdAt: ago(5),
  startedAt: ago(5),
  finishedAt: ago(4),
  durationMs: 4200,
  ...overrides,
});

const step = (position: number, overrides: Record<string, unknown>) => ({
  id: `step-${position}`,
  position,
  type: 'NOTIFICATION',
  name: `Step ${position}`,
  status: 'PENDING',
  attempts: 0,
  input: null,
  output: null,
  error: null,
  workerId: null,
  nextRetryAt: null,
  startedAt: null,
  finishedAt: null,
  durationMs: null,
  ...overrides,
});

const executionDetail = {
  ...executionRow(),
  error: 'Step "Transform" failed after 3 attempts: Source path "body.missing" was not found',
  input: null,
  maxAttempts: 3,
  backoffBaseMs: 2000,
  steps: [
    step(0, {
      type: 'HTTP_REQUEST',
      name: 'Fetch data',
      status: 'SUCCESS',
      attempts: 1,
      input: { start: true },
      output: { status: 200, body: { id: 42 } },
      workerId: 'worker-host-1',
      startedAt: ago(5),
      finishedAt: ago(5),
      durationMs: 421,
    }),
    step(1, {
      type: 'TRANSFORM',
      name: 'Transform',
      status: 'FAILED',
      attempts: 3,
      input: { status: 200 },
      error: 'Source path "body.missing" was not found in the step input',
      workerId: 'worker-host-1',
      startedAt: ago(5),
      finishedAt: ago(5),
      durationMs: 132,
    }),
    step(2, { name: 'Notify', status: 'SKIPPED' }),
  ],
};

const logLine = (id: number, overrides: Record<string, unknown>) => ({
  id: String(id),
  level: 'INFO',
  message: 'Execution started',
  meta: null,
  createdAt: ago(5),
  executionId: EXECUTION_ID,
  workflowId: WORKFLOW_ID,
  workflowName: 'Video Processing',
  stepExecutionId: null,
  stepName: null,
  ...overrides,
});

const logs = {
  data: [
    logLine(3, {
      level: 'ERROR',
      message: 'Step "Transform" failed on attempt 1 of 3: HTTP 503. Retrying in 1.5s',
      meta: { attempt: 1, delayMs: 1537 },
      stepExecutionId: 'step-1',
      stepName: 'Transform',
    }),
    logLine(2, {
      level: 'WARN',
      message: 'Step "Fetch data" started',
      meta: { attempt: 1 },
      stepExecutionId: 'step-0',
      stepName: 'Fetch data',
    }),
    logLine(1, {}),
  ],
  nextCursor: null,
};

const worker = (overrides: Record<string, unknown>) => ({
  workerId: 'worker-host-1',
  hostname: 'host',
  pid: 11,
  status: 'busy',
  concurrency: 5,
  processing: 2,
  completed: 40,
  failed: 3,
  startedAt: ago(120),
  lastHeartbeat: new Date().toISOString(),
  uptimeSeconds: 7200,
  ...overrides,
});

const series = (key: 'executions' | 'steps') => ({
  range: '24h',
  bucketSeconds: 3600,
  points: [
    {
      start: ago(60),
      counts:
        key === 'executions'
          ? { success: 3, failed: 1, cancelled: 0, active: 1 }
          : { succeeded: 9, failed: 1 },
    },
  ],
});

export function appApi() {
  return mockFetch((url, init) => {
    if ((init.method ?? 'GET') !== 'GET') {
      return json(503, { error: { code: 'UNAVAILABLE', message: 'Unavailable in tests' } });
    }

    switch (url.pathname) {
      case '/health/ready':
        return json(200, { status: 'ready' });
      case '/overview':
        return json(200, {
          range: '24h',
          workflows: { total: 4, enabled: 3 },
          executions: { queued: 2, running: 1, success: 40, failed: 5, cancelled: 0 },
          health: {
            database: { status: 'up', latencyMs: 4 },
            redis: { status: 'up', latencyMs: 2 },
            workers: { online: 2, busy: 1, offline: 0 },
          },
        });
      case '/stats/executions':
        return json(200, series('executions'));
      case '/queue/activity':
        return json(200, series('steps'));
      case '/queue':
        return json(200, {
          counts: { waiting: 4, active: 2, delayed: 1, completed: 120, failed: 0, deadLetter: 3 },
        });
      case '/workers':
        return json(200, {
          summary: { online: 1, busy: 1, offline: 0 },
          workers: [
            worker({}),
            worker({ workerId: 'worker-host-2', pid: 12, status: 'online', processing: 0 }),
          ],
        });
      case '/executions':
        return json(
          200,
          page([
            executionRow(),
            executionRow({
              id: '01a14cec-f85d-7079-b268-9c29038eb41d',
              workflowId: OTHER_WORKFLOW_ID,
              workflowName: 'Data Sync',
              status: 'SUCCESS',
              attempts: 3,
              durationMs: 130,
            }),
          ]),
        );
      case `/executions/${EXECUTION_ID}`:
        return json(200, executionDetail);
      case '/logs':
        return json(200, logs);
      case '/workflows':
        return json(
          200,
          page([
            summary(),
            summary({
              id: OTHER_WORKFLOW_ID,
              name: 'Data Sync',
              description: null,
              enabled: false,
              stepCount: 1,
              lastRun: null,
              successRate: null,
              finishedRuns: 0,
            }),
          ]),
        );
      case `/workflows/${WORKFLOW_ID}`:
        return json(200, workflowDetail);
      case '/auth/sessions':
        return json(200, {
          data: [
            {
              id: '01a14cec-f85d-7079-b268-9c29038eb50d',
              userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36',
              ipAddress: '10.0.0.1',
              signedInAt: ago(180),
              lastActiveAt: ago(1),
              expiresAt: ago(-10_000),
              current: true,
            },
          ],
        });
      case '/api-keys':
        return json(200, {
          data: [
            {
              id: '01a14cec-f85d-7079-b268-9c29038eb60d',
              name: 'CI pipeline',
              prefix: 'cf_AbCdEfG',
              createdAt: ago(120),
              lastUsedAt: ago(5),
              revokedAt: null,
            },
          ],
        });
      default:
        return json(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
    }
  });
}

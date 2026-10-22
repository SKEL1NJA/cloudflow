import { listWorkers } from '@cloudflow/queue';
import type { FastifyInstance } from 'fastify';
import { Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { env } from '../config/env.js';
import { safeEqual } from '../lib/crypto.js';
import { UnauthorizedError } from '../lib/errors.js';

const QUEUE_STATES = [
  'waiting',
  'active',
  'delayed',
  'prioritized',
  'completed',
  'failed',
] as const;

export function registerMetrics(app: FastifyInstance): void {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const httpDuration = new Histogram({
    name: 'cloudflow_http_request_duration_seconds',
    help: 'HTTP request duration by method, route template and status code',
    labelNames: ['method', 'route', 'status'] as const,
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  app.addHook('onResponse', async (request, reply) => {
    const route = request.routeOptions.url ?? 'unmatched';

    httpDuration.observe(
      {
        method: request.method,
        route,
        status: String(reply.statusCode),
      },
      reply.elapsedTime / 1000,
    );
  });

  new Gauge({
    name: 'cloudflow_queue_jobs',
    help: 'Jobs in the step queue by state',
    labelNames: ['state'] as const,
    registers: [registry],
    async collect() {
      try {
        const counts = await app.queue.getJobCounts(...QUEUE_STATES);

        for (const state of QUEUE_STATES) {
          this.set({ state }, counts[state] ?? 0);
        }
      } catch (err) {
        app.log.warn({ err }, 'could not read queue depth for metrics');
      }
    },
  });

  new Gauge({
    name: 'cloudflow_dead_letter_jobs',
    help: 'Jobs waiting in the dead-letter queue',
    registers: [registry],
    async collect() {
      try {
        const counts = await app.deadLetterQueue.getJobCounts('waiting');
        this.set(counts.waiting ?? 0);
      } catch (err) {
        app.log.warn(
          { err },
          'could not read the dead-letter queue for metrics',
        );
      }
    },
  });

  new Gauge({
    name: 'cloudflow_workers',
    help: 'Workers by status, including ones seen offline in the last hour',
    labelNames: ['status'] as const,
    registers: [registry],
    async collect() {
      try {
        const counts = { online: 0, busy: 0, offline: 0 };

        for (const worker of await listWorkers(app.redis)) {
          counts[worker.status] += 1;
        }

        for (const [status, value] of Object.entries(counts)) {
          this.set({ status }, value);
        }
      } catch (err) {
        app.log.warn({ err }, 'could not read workers for metrics');
      }
    },
  });

  new Gauge({
    name: 'cloudflow_sse_clients',
    help: 'Open real-time event streams',
    registers: [registry],
    collect() {
      this.set(app.eventHub.size);
    },
  });

  app.get(
    '/metrics',
    {
      onRequest: async (request) => {
        if (!env.METRICS_TOKEN) return;

        const token = /^Bearer (.+)$/i.exec(
          request.headers.authorization ?? '',
        )?.[1];

        if (!token || !safeEqual(token, env.METRICS_TOKEN)) {
          throw new UnauthorizedError();
        }
      },
    },
    async (_request, reply) => {
      return reply
        .header('content-type', registry.contentType)
        .send(await registry.metrics());
    },
  );

  app.addHook('onClose', async () => {
    registry.clear();
  });
}

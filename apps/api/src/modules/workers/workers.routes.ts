import { listWorkers } from '@cloudflow/queue';
import type { WorkerCounts, WorkersResponse, WorkerStatus, WorkerView } from '@cloudflow/shared';
import type { FastifyPluginAsync } from 'fastify';

const STATUS_RANK: Record<WorkerStatus, number> = { busy: 0, online: 1, offline: 2 };

export const workerRoutes: FastifyPluginAsync = async (app) => {
  app.addHook('onRequest', app.authenticate);

  app.get('/workers', async (): Promise<WorkersResponse> => {
    const summary: WorkerCounts = { online: 0, busy: 0, offline: 0 };
    const workers: WorkerView[] = [];

    for (const worker of await listWorkers(app.redis)) {
      summary[worker.status] += 1;
      workers.push({
        workerId: worker.workerId,
        hostname: worker.hostname,
        pid: worker.pid,
        status: worker.status,
        concurrency: worker.concurrency,
        processing: worker.processing,
        completed: worker.completed,
        failed: worker.failed,
        startedAt: worker.startedAt,
        lastHeartbeat: worker.lastHeartbeat,
        uptimeSeconds: worker.uptimeSeconds,
      });
    }

    workers.sort(
      (a, b) =>
        STATUS_RANK[a.status] - STATUS_RANK[b.status] || a.startedAt.localeCompare(b.startedAt),
    );
    return { summary, workers };
  });
};

import http from 'node:http';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { StepObserver } from './observer.js';
import type { RecoveryReason } from './reconciler.js';

export interface WorkerMetrics {
  registry: Registry;
  observer: StepObserver;
  countRecovery: (reason: RecoveryReason) => void;
}

export function createWorkerMetrics(getProcessing: () => number): WorkerMetrics {
  const registry = new Registry();
  collectDefaultMetrics({ register: registry });

  const attempts = new Counter({
    name: 'cloudflow_step_attempts_total',
    help: 'Finished step attempts by step type and outcome',
    labelNames: ['type', 'outcome'] as const,
    registers: [registry],
  });
  const duration = new Histogram({
    name: 'cloudflow_step_duration_seconds',
    help: 'How long step attempts take, by step type',
    labelNames: ['type'] as const,
    buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10, 30, 60, 300],
    registers: [registry],
  });
  const recoveries = new Counter({
    name: 'cloudflow_reconciler_recoveries_total',
    help: 'Stranded steps found by the reconciler, by reason',
    labelNames: ['reason'] as const,
    registers: [registry],
  });
  new Gauge({
    name: 'cloudflow_worker_jobs_processing',
    help: 'Jobs this worker is processing right now',
    registers: [registry],
    collect() {
      this.set(getProcessing());
    },
  });

  return {
    registry,
    observer: {
      stepFinished({ type, outcome, durationMs }) {
        attempts.inc({ type, outcome });
        duration.observe({ type }, durationMs / 1000);
      },
    },
    countRecovery: (reason) => recoveries.inc({ reason }),
  };
}

export interface MetricsServer {
  close: () => Promise<void>;
}

export function startMetricsServer(registry: Registry, port: number, host: string): Promise<MetricsServer> {
  return new Promise((resolve, reject) => {
    const server = http.createServer((req, res) => {
      if (req.url === '/metrics') {
        registry
          .metrics()
          .then((body) => {
            res.writeHead(200, { 'content-type': registry.contentType });
            res.end(body);
          })
          .catch(() => {
            res.writeHead(500);
            res.end();
          });
      } else if (req.url === '/health') {
        res.writeHead(200, { 'content-type': 'text/plain' });
        res.end('ok');
      } else {
        res.writeHead(404);
        res.end();
      }
    });
    server.once('error', reject);
    server.listen(port, host, () => {
      resolve({
        close: () =>
          new Promise<void>((done) => {
            server.closeAllConnections();
            server.close(() => done());
          }),
      });
    });
  });
}
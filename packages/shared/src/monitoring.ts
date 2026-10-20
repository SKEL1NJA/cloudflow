import { z } from 'zod';

export const STATS_RANGES = ['1h', '6h', '24h', '7d'] as const;
export type StatsRange = (typeof STATS_RANGES)[number];

export const statsRangeQuerySchema = z.object({
  range: z.enum(STATS_RANGES).default('24h'),
});

export type CheckResult = { status: 'up'; latencyMs: number } | { status: 'down' };

export type ExecutionSeriesKey = 'success' | 'failed' | 'cancelled' | 'active';
export type StepActivityKey = 'succeeded' | 'failed';

export interface TimeSeriesPoint<K extends string> {
  start: string;
  counts: Record<K, number>;
}

export interface TimeSeries<K extends string> {
  range: StatsRange;
  bucketSeconds: number;
  points: TimeSeriesPoint<K>[];
}

export interface WorkerCounts {
  online: number;
  busy: number;
  offline: number;
}

export interface OverviewResponse {
  range: StatsRange;
  workflows: { total: number; enabled: number };
  executions: {
    queued: number;
    running: number;
    success: number;
    failed: number;
    cancelled: number;
  };
  health: { database: CheckResult; redis: CheckResult; workers: WorkerCounts };
}

export type WorkerStatus = 'online' | 'busy' | 'offline';

export interface WorkerView {
  workerId: string;
  hostname: string;
  pid: number;
  status: WorkerStatus;
  concurrency: number;
  processing: number;
  completed: number;
  failed: number;
  startedAt: string;
  lastHeartbeat: string;
  uptimeSeconds: number;
}

export interface WorkersResponse {
  summary: WorkerCounts;
  workers: WorkerView[];
}

export interface QueueCounts {
  waiting: number;
  active: number;
  delayed: number;
  completed: number;
  failed: number;
  deadLetter: number;
}

export interface QueueResponse {
  counts: QueueCounts;
}
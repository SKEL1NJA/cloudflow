import type { WorkerView } from '@cloudflow/shared';

export interface Capacity {
  online: number;
  slots: number;
  slotsInUse: number;
}

export function summarizeCapacity(workers: readonly WorkerView[]): Capacity {
  let online = 0;
  let slots = 0;
  let slotsInUse = 0;

  for (const worker of workers) {
    if (worker.status === 'offline') continue;
    online += 1;
    slots += worker.concurrency;
    slotsInUse += Math.min(worker.processing, worker.concurrency);
  }
  return { online, slots, slotsInUse };
}

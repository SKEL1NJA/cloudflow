import type { WorkerView } from '@cloudflow/shared';
import { describe, expect, it } from 'vitest';
import { summarizeCapacity } from './capacity';

const worker = (overrides: Partial<WorkerView>): WorkerView => ({
  workerId: 'w',
  hostname: 'h',
  pid: 1,
  status: 'online',
  concurrency: 5,
  processing: 0,
  completed: 0,
  failed: 0,
  startedAt: '2026-10-20T10:00:00.000Z',
  lastHeartbeat: '2026-10-20T10:00:05.000Z',
  uptimeSeconds: 5,
  ...overrides,
});

describe('summarizeCapacity', () => {
  it('counts slots and slots in use for online and busy workers only', () => {
    expect(
      summarizeCapacity([
        worker({ status: 'busy', processing: 2 }),
        worker({ status: 'online', concurrency: 3 }),
        worker({ status: 'offline', concurrency: 10, processing: 9 }),
      ]),
    ).toEqual({ online: 2, slots: 8, slotsInUse: 2 });
  });

  it('never reports more slots in use than a worker has', () => {
    expect(
      summarizeCapacity([worker({ status: 'busy', concurrency: 2, processing: 7 })]).slotsInUse,
    ).toBe(2);
  });

  it('handles no workers', () => {
    expect(summarizeCapacity([])).toEqual({ online: 0, slots: 0, slotsInUse: 0 });
  });
});

import type { RealtimeEvent } from '@cloudflow/shared';
import { QueryClient } from '@tanstack/react-query';
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from 'vitest';
import { createInvalidator } from './invalidation';

const WORKFLOW = '01a14cec-f85d-7079-b268-9c29038eb32d';
const EXECUTION = '01a14cec-f85d-7079-b268-9c29038eb32e';

const executionEvent: RealtimeEvent = {
  type: 'execution.updated',
  workflowId: WORKFLOW,
  executionId: EXECUTION,
  status: 'RUNNING',
  at: '2026-10-20T10:00:00.000Z',
};

const stepEvent: RealtimeEvent = {
  type: 'step.updated',
  workflowId: WORKFLOW,
  executionId: EXECUTION,
  stepId: '01a14cec-f85d-7079-b268-9c29038eb32f',
  position: 0,
  status: 'SUCCESS',
  attempts: 1,
  nextRetryAt: null,
  at: '2026-10-20T10:00:01.000Z',
};

let queryClient: QueryClient;
let invalidate: MockInstance<QueryClient['invalidateQueries']>;

beforeEach(() => {
  vi.useFakeTimers();
  queryClient = new QueryClient();
  invalidate = vi.spyOn(queryClient, 'invalidateQueries').mockResolvedValue(undefined);
});

afterEach(() => {
  vi.useRealTimers();
});

function invalidatedKeys(): unknown[] {
  return invalidate.mock.calls.map(([filters]) => filters?.queryKey);
}

describe('createInvalidator', () => {
  it('refreshes the dashboard queries once, after the batching delay', () => {
    const invalidator = createInvalidator(queryClient, 300);
    invalidator.handleEvent(executionEvent);

    vi.advanceTimersByTime(299);
    expect(invalidate).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(invalidatedKeys()).toEqual([
      ['overview'],
      ['stats'],
      ['executions', 'list'],
      ['executions', 'detail', EXECUTION],
    ]);
  });

  it('coalesces a burst of events into one refresh per query', () => {
    const invalidator = createInvalidator(queryClient, 300);
    for (let index = 0; index < 8; index += 1) invalidator.handleEvent(executionEvent);
    invalidator.handleEvent(stepEvent);

    vi.advanceTimersByTime(300);
    expect(invalidate).toHaveBeenCalledTimes(4);
  });

  it('only refreshes the execution itself for step updates', () => {
    const invalidator = createInvalidator(queryClient, 300);
    invalidator.handleEvent(stepEvent);

    vi.advanceTimersByTime(300);
    expect(invalidatedKeys()).toEqual([['executions', 'detail', EXECUTION]]);
  });

  it('refreshes everything immediately on resync and drops pending work', () => {
    const invalidator = createInvalidator(queryClient, 300);
    invalidator.handleEvent(executionEvent);
    invalidator.handleResync();

    expect(invalidate).toHaveBeenCalledTimes(1);
    expect(invalidate).toHaveBeenCalledWith();

    vi.advanceTimersByTime(1000);
    expect(invalidate).toHaveBeenCalledTimes(1);
  });

  it('cancels pending refreshes when disposed', () => {
    const invalidator = createInvalidator(queryClient, 300);
    invalidator.handleEvent(executionEvent);
    invalidator.dispose();

    vi.advanceTimersByTime(1000);
    expect(invalidate).not.toHaveBeenCalled();
  });
});

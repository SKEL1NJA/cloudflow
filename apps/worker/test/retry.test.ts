import { describe, expect, it } from 'vitest';
import { MAX_BACKOFF_MS, backoffDelayMs, decideFailure } from '../src/retry.js';

describe('backoffDelayMs', () => {
  it('doubles the delay with every attempt', () => {
    const top = () => 1;
    expect([1, 2, 3, 4].map((attempt) => backoffDelayMs(attempt, 2000, top))).toEqual([
      2000, 4000, 8000, 16000,
    ]);
  });

  it('randomizes between half and the full delay', () => {
    expect(backoffDelayMs(2, 2000, () => 0)).toBe(2000);
    expect(backoffDelayMs(2, 2000, () => 1)).toBe(4000);
  });

  it('never exceeds the cap, even for very high attempt numbers', () => {
    expect(backoffDelayMs(60, 2000, () => 1)).toBe(MAX_BACKOFF_MS);
  });

  it('spreads real random delays instead of returning one fixed value', () => {
    const delays = new Set(Array.from({ length: 50 }, () => backoffDelayMs(3, 2000)));
    expect(delays.size).toBeGreaterThan(1);
    for (const delay of delays) {
      expect(delay).toBeGreaterThanOrEqual(4000);
      expect(delay).toBeLessThanOrEqual(8000);
    }
  });
});

describe('decideFailure', () => {
  it('retries a retryable failure while attempts remain', () => {
    expect(decideFailure({ retryable: true, attempt: 1, maxAttempts: 3 })).toEqual({ action: 'retry' });
    expect(decideFailure({ retryable: true, attempt: 2, maxAttempts: 3 })).toEqual({ action: 'retry' });
  });

  it('gives up when attempts are exhausted', () => {
    expect(decideFailure({ retryable: true, attempt: 3, maxAttempts: 3 })).toEqual({
      action: 'fail',
      reason: 'RETRIES_EXHAUSTED',
    });
  });

  it('never retries a permanent failure', () => {
    expect(decideFailure({ retryable: false, attempt: 1, maxAttempts: 10 })).toEqual({
      action: 'fail',
      reason: 'NON_RETRYABLE',
    });
  });

  it('treats maxAttempts of 1 as no retries', () => {
    expect(decideFailure({ retryable: true, attempt: 1, maxAttempts: 1 }).action).toBe('fail');
  });
});
import type { DeadLetterReason } from '@cloudflow/queue';

export const MAX_BACKOFF_MS = 5 * 60 * 1000;

export function backoffDelayMs(
  attempt: number,
  baseMs: number,
  random: () => number = Math.random,
): number {
  const exponential = Math.min(MAX_BACKOFF_MS, baseMs * 2 ** (attempt - 1));
  return Math.round(exponential * (0.5 + random() * 0.5));
}

export type FailureDecision = { action: 'retry' } | { action: 'fail'; reason: DeadLetterReason };

export function decideFailure(input: {
  retryable: boolean;
  attempt: number;
  maxAttempts: number;
}): FailureDecision {
  if (!input.retryable) return { action: 'fail', reason: 'NON_RETRYABLE' };
  if (input.attempt >= input.maxAttempts) return { action: 'fail', reason: 'RETRIES_EXHAUSTED' };
  return { action: 'retry' };
}

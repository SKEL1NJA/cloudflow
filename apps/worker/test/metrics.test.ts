import { describe, expect, it } from 'vitest';
import { createWorkerMetrics } from '../src/metrics.js';

function line(text: string, name: string, ...fragments: string[]): string | undefined {
  return text
    .split('\n')
    .find((entry) => entry.startsWith(name) && fragments.every((fragment) => entry.includes(fragment)));
}

describe('worker metrics', () => {
  it('counts step outcomes and records durations by step type', async () => {
    const metrics = createWorkerMetrics(() => 2);
    metrics.observer.stepFinished({ type: 'DELAY', outcome: 'success', durationMs: 1500 });
    metrics.observer.stepFinished({ type: 'DELAY', outcome: 'success', durationMs: 20 });
    metrics.observer.stepFinished({ type: 'HTTP_REQUEST', outcome: 'retry', durationMs: 80 });
    metrics.countRecovery('pending_not_queued');

    const text = await metrics.registry.metrics();
    expect(line(text, 'cloudflow_step_attempts_total', 'type="DELAY"', 'outcome="success"')).toMatch(/ 2$/);
    expect(line(text, 'cloudflow_step_attempts_total', 'type="HTTP_REQUEST"', 'outcome="retry"')).toMatch(/ 1$/);
    expect(line(text, 'cloudflow_step_duration_seconds_count', 'type="DELAY"')).toMatch(/ 2$/);
    expect(line(text, 'cloudflow_reconciler_recoveries_total', 'reason="pending_not_queued"')).toMatch(/ 1$/);
    expect(line(text, 'cloudflow_worker_jobs_processing')).toMatch(/ 2$/);
  });
});
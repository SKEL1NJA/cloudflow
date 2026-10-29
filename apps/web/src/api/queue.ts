import type { QueueResponse, StatsRange, StepActivityKey, TimeSeries } from '@cloudflow/shared';
import { request } from './client';

export function fetchQueue(signal?: AbortSignal): Promise<QueueResponse> {
  return request<QueueResponse>('/queue', { signal });
}

export function fetchStepActivity(
  range: StatsRange,
  signal?: AbortSignal,
): Promise<TimeSeries<StepActivityKey>> {
  return request<TimeSeries<StepActivityKey>>('/queue/activity', { query: { range }, signal });
}

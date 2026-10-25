import type {
  ExecutionSeriesKey,
  OverviewResponse,
  StatsRange,
  TimeSeries,
} from '@cloudflow/shared';
import { request } from './client';

export function fetchOverview(range: StatsRange, signal?: AbortSignal): Promise<OverviewResponse> {
  return request<OverviewResponse>('/overview', { query: { range }, signal });
}

export function fetchExecutionSeries(
  range: StatsRange,
  signal?: AbortSignal,
): Promise<TimeSeries<ExecutionSeriesKey>> {
  return request<TimeSeries<ExecutionSeriesKey>>('/stats/executions', { query: { range }, signal });
}

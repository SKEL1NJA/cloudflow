import { StackedBarChart } from '@/components/charts/stacked-bar-chart';
import { ACTIVITY_SERIES, type ActivityPoint } from './chart-data';

export function ActivityChart({ data }: { data: ActivityPoint[] }) {
  return <StackedBarChart data={data} series={ACTIVITY_SERIES} />;
}

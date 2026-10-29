import { StackedBarChart } from '@/components/charts/stacked-bar-chart';
import { SERIES, type ChartPoint } from './chart-data';

export function ExecutionChart({ data }: { data: ChartPoint[] }) {
  return <StackedBarChart data={data} series={SERIES} />;
}

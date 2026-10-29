import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDateTime } from '@/lib/format';

export interface ChartSeries {
  key: string;
  label: string;
  color: string;
}

interface ChartTooltipProps {
  active?: boolean | undefined;
  payload?: ReadonlyArray<{ payload?: Record<string, unknown> }> | undefined;
  series: readonly ChartSeries[];
}

function ChartTooltip({ active, payload, series }: ChartTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;
  const start = typeof point.start === 'string' ? point.start : '';

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-popover-foreground">
        {start ? formatDateTime(start) : ''}
      </p>
      <ul className="space-y-1">
        {series.map(({ key, label, color }) => (
          <li key={key} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
              {label}
            </span>
            <span className="tabular-nums text-popover-foreground">{String(point[key] ?? 0)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TICK = { fill: 'var(--muted-foreground)', fontSize: 12 };

interface StackedBarChartProps {
  data: object[];
  series: readonly ChartSeries[];
}

export function StackedBarChart({ data, series }: StackedBarChartProps) {
  return (
    <BarChart
      responsive
      style={{ width: '100%', height: 260 }}
      data={data}
      margin={{ top: 8, right: 8, bottom: 0, left: 0 }}
    >
      <CartesianGrid vertical={false} stroke="var(--border)" />
      <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={24} tick={TICK} />
      <YAxis allowDecimals={false} width={32} tickLine={false} axisLine={false} tick={TICK} />
      <Tooltip content={<ChartTooltip series={series} />} cursor={{ fill: 'var(--accent)' }} />
      {series.map(({ key, color }) => (
        <Bar
          key={key}
          dataKey={key}
          stackId="stack"
          fill={color}
          maxBarSize={32}
          isAnimationActive={false}
        />
      ))}
    </BarChart>
  );
}

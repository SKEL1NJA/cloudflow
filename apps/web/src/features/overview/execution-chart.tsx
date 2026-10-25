import { Bar, BarChart, CartesianGrid, Tooltip, XAxis, YAxis } from 'recharts';
import { formatDateTime } from '@/lib/format';
import { SERIES, type ChartPoint } from './chart-data';

interface ChartTooltipProps {
  active?: boolean | undefined;
  payload?: ReadonlyArray<{ payload?: ChartPoint }> | undefined;
}

function ChartTooltip({ active, payload }: ChartTooltipProps) {
  const point = payload?.[0]?.payload;
  if (!active || !point) return null;

  return (
    <div className="rounded-md border bg-popover px-3 py-2 text-xs shadow-md">
      <p className="mb-1.5 font-medium text-popover-foreground">{formatDateTime(point.start)}</p>
      <ul className="space-y-1">
        {SERIES.map(({ key, label, color }) => (
          <li key={key} className="flex items-center justify-between gap-6">
            <span className="flex items-center gap-1.5 text-muted-foreground">
              <span className="size-2 rounded-full" style={{ backgroundColor: color }} />
              {label}
            </span>
            <span className="tabular-nums text-popover-foreground">{point[key]}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const TICK = { fill: 'var(--muted-foreground)', fontSize: 12 };

export function ExecutionChart({ data }: { data: ChartPoint[] }) {
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
      <Tooltip content={<ChartTooltip />} cursor={{ fill: 'var(--accent)' }} />
      {SERIES.map(({ key, color }) => (
        <Bar
          key={key}
          dataKey={key}
          stackId="executions"
          fill={color}
          maxBarSize={32}
          isAnimationActive={false}
        />
      ))}
    </BarChart>
  );
}

import { STATS_RANGES, type StatsRange } from '@cloudflow/shared';
import { cn } from '@/lib/utils';
import { RANGE_LABELS } from './range';

interface RangeSwitchProps {
  value: StatsRange;
  onChange: (range: StatsRange) => void;
}

export function RangeSwitch({ value, onChange }: RangeSwitchProps) {
  return (
    <div role="group" aria-label="Time range" className="inline-flex rounded-md border p-0.5">
      {STATS_RANGES.map((range) => (
        <button
          key={range}
          type="button"
          aria-pressed={value === range}
          aria-label={RANGE_LABELS[range]}
          onClick={() => onChange(range)}
          className={cn(
            'h-7 rounded-sm px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            value === range && 'bg-accent text-foreground',
          )}
        >
          {range}
        </button>
      ))}
    </div>
  );
}

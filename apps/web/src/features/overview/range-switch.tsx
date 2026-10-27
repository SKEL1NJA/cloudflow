import { STATS_RANGES, type StatsRange } from '@cloudflow/shared';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { RANGE_LABELS } from './range';

const OPTIONS = STATS_RANGES.map((range) => ({
  value: range,
  label: range,
  ariaLabel: RANGE_LABELS[range],
}));

interface RangeSwitchProps {
  value: StatsRange;
  onChange: (range: StatsRange) => void;
}

export function RangeSwitch({ value, onChange }: RangeSwitchProps) {
  return (
    <SegmentedControl label="Time range" value={value} onChange={onChange} options={OPTIONS} />
  );
}

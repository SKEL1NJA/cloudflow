import { cn } from '@/lib/utils';

interface Option<T extends string> {
  value: T;
  label: string;
  ariaLabel?: string;
}

interface SegmentedControlProps<T extends string> {
  label: string;
  value: T;
  onChange: (value: T) => void;
  options: readonly Option<T>[];
}

export function SegmentedControl<T extends string>({
  label,
  value,
  onChange,
  options,
}: SegmentedControlProps<T>) {
  return (
    <div role="group" aria-label={label} className="inline-flex rounded-md border p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={value === option.value}
          aria-label={option.ariaLabel}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-7 rounded-sm px-2.5 text-xs font-medium text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            value === option.value && 'bg-accent text-foreground',
          )}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

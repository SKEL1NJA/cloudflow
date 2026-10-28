import { cn } from '@/lib/utils';
import { controlClassName } from './input';

interface FilterSelectProps<T extends string> {
  label: string;
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  options: readonly { value: T | ''; label: string }[];
}

export function FilterSelect<T extends string>({
  label,
  value,
  onChange,
  options,
}: FilterSelectProps<T>) {
  return (
    <select
      aria-label={label}
      value={value ?? ''}
      onChange={(event) =>
        onChange(event.target.value === '' ? undefined : (event.target.value as T))
      }
      className={cn(controlClassName, 'h-9 w-auto pr-8')}
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

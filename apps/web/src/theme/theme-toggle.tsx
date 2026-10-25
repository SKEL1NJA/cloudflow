import { Monitor, Moon, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';
import { setThemePreference, useThemePreference, type ThemePreference } from './theme';

const OPTIONS: { value: ThemePreference; label: string; icon: typeof Sun }[] = [
  { value: 'light', label: 'Light', icon: Sun },
  { value: 'dark', label: 'Dark', icon: Moon },
  { value: 'system', label: 'System', icon: Monitor },
];

export function ThemeToggle() {
  const preference = useThemePreference();

  return (
    <div role="group" aria-label="Theme" className="inline-flex rounded-md border p-0.5">
      {OPTIONS.map(({ value, label, icon: Icon }) => (
        <button
          key={value}
          type="button"
          aria-pressed={preference === value}
          aria-label={label}
          title={label}
          onClick={() => setThemePreference(value)}
          className={cn(
            'inline-flex size-7 items-center justify-center rounded-sm text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring',
            preference === value && 'bg-accent text-foreground',
          )}
        >
          <Icon className="size-4" aria-hidden="true" />
        </button>
      ))}
    </div>
  );
}

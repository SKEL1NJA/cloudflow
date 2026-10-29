import { Card, CardContent } from '@/components/ui/card';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { setThemePreference, useResolvedTheme, useThemePreference } from '@/theme/theme';

const OPTIONS = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
] as const;

export function AppearanceSection() {
  const preference = useThemePreference();
  const resolved = useResolvedTheme();

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="text-sm font-medium">Theme</h2>
          <p className="mt-1 text-xs text-muted-foreground">System follows your device setting.</p>
        </div>
        <SegmentedControl
          label="Theme"
          value={preference}
          onChange={setThemePreference}
          options={OPTIONS}
        />
        <p className="text-xs text-muted-foreground">Currently using the {resolved} theme.</p>
      </CardContent>
    </Card>
  );
}

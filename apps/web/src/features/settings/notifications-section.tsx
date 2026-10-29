import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  setNotificationPreference,
  useNotificationPreferences,
  type NotificationPreferences,
} from '@/features/notifications/preferences';

const OPTIONS: { key: keyof NotificationPreferences; label: string; description: string }[] = [
  {
    key: 'failed',
    label: 'Execution failed',
    description: 'When a run fails, for example after its retries are used up.',
  },
  {
    key: 'succeeded',
    label: 'Execution succeeded',
    description: 'When a run completes successfully.',
  },
  { key: 'cancelled', label: 'Execution cancelled', description: 'When a run is cancelled.' },
];

export function NotificationsSection() {
  const preferences = useNotificationPreferences();

  return (
    <Card>
      <CardContent className="space-y-4 p-5">
        <div>
          <h2 className="text-sm font-medium">In-app notifications</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            Shown in this browser while CloudFlow is open. These settings are saved on this device
            only. Email and webhook delivery are not available yet.
          </p>
        </div>
        <ul className="divide-y">
          {OPTIONS.map(({ key, label, description }) => (
            <li key={key} className="flex items-center justify-between gap-4 py-3">
              <div>
                <p id={`notify-${key}`} className="text-sm font-medium">
                  {label}
                </p>
                <p className="text-xs text-muted-foreground">{description}</p>
              </div>
              <Switch
                aria-labelledby={`notify-${key}`}
                checked={preferences[key]}
                onCheckedChange={(value) => setNotificationPreference(key, value)}
              />
            </li>
          ))}
        </ul>
        <Button
          variant="outline"
          size="sm"
          onClick={() =>
            toast('Test notification', { description: 'This is how notifications look.' })
          }
        >
          Send a test notification
        </Button>
      </CardContent>
    </Card>
  );
}

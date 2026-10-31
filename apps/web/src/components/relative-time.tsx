import { useClock } from '@/hooks/use-clock';
import { formatDateTime, formatRelativeTime } from '@/lib/format';

interface RelativeTimeProps {
  iso: string;
  intervalMs?: number;
}

export function RelativeTime({ iso, intervalMs = 30_000 }: RelativeTimeProps) {
  useClock(intervalMs);

  return (
    <time dateTime={iso} title={formatDateTime(iso)}>
      {formatRelativeTime(iso, Date.now())}
    </time>
  );
}

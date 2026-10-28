import { useNow } from '@/hooks/use-now';
import { formatCountdown } from '@/lib/format';

export function RetryCountdown({ at }: { at: string }) {
  const now = useNow(1000);
  const remaining = Math.ceil((Date.parse(at) - now) / 1000);

  if (remaining <= 0) return <span>retrying now</span>;
  return <span>in {formatCountdown(remaining)}</span>;
}

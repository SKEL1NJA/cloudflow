import type { JsonValue } from '@cloudflow/shared';

const MAX_LENGTH = 300;

function formatValue(value: JsonValue): string {
  if (typeof value === 'string') return /^[\w.:/@-]+$/.test(value) ? value : JSON.stringify(value);
  return JSON.stringify(value);
}

export function formatMeta(meta: JsonValue | null): string {
  if (meta === null) return '';
  const text =
    typeof meta === 'object' && !Array.isArray(meta)
      ? Object.entries(meta)
          .map(([key, value]) => `${key}=${formatValue(value)}`)
          .join(' ')
      : JSON.stringify(meta);
  return text.length > MAX_LENGTH ? `${text.slice(0, MAX_LENGTH - 1)}…` : text;
}

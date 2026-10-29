import type { LogLevel } from '@cloudflow/shared';

export const LEVEL_CLASS: Record<LogLevel, string> = {
  DEBUG: 'text-muted-foreground',
  INFO: 'text-muted-foreground',
  WARN: 'text-warning',
  ERROR: 'text-danger',
};

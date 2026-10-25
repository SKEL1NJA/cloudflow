import type { LogLevel } from '@cloudflow/db';
import type { JsonValue } from '@cloudflow/shared';

export interface StepContext {
  stepExecutionId: string;
  attempt: number;
  allowPrivateNetwork: boolean;
  log: (level: LogLevel, message: string, meta?: Record<string, JsonValue>) => Promise<void>;
}

export class StepError extends Error {
  constructor(
    message: string,
    public readonly retryable = true,
  ) {
    super(message);
    this.name = 'StepError';
  }
}

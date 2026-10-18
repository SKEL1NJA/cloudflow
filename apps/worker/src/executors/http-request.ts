import type { JsonValue } from '@cloudflow/shared';
import { StepError } from './types.js';

export function runHttpRequest(): Promise<JsonValue> {
  throw new StepError('HTTP_REQUEST steps are not implemented yet', false);
}
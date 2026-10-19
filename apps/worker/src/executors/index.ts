import { assertNever, type JsonValue, type WorkflowStepInput } from '@cloudflow/shared';
import { runDelay } from './delay.js';
import { runHttpRequest } from './http-request.js';
import { runNotification } from './notification.js';
import { runTransform } from './transform.js';
import type { StepContext } from './types.js';

export async function executeStep(
  step: WorkflowStepInput,
  input: JsonValue,
  ctx: StepContext,
): Promise<JsonValue> {
  switch (step.type) {
    case 'DELAY':
      return runDelay(step.config, ctx);
    case 'TRANSFORM':
      return runTransform(step.config, input);
    case 'NOTIFICATION':
      return runNotification(step.config, ctx);
    case 'HTTP_REQUEST':
      return runHttpRequest(step.config, ctx);
    default:
      return assertNever(step);
  }
}
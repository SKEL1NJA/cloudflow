import {
  assertNever,
  type StepType,
  type WorkflowDetail,
  type WorkflowStepView,
} from '@cloudflow/shared';
import { formatDuration } from '@/lib/format';

export const STEP_TYPE_LABELS: Record<StepType, string> = {
  HTTP_REQUEST: 'HTTP request',
  DELAY: 'Delay',
  TRANSFORM: 'Transform',
  NOTIFICATION: 'Notification',
};

const MASK = '••••••';

function displayUrl(value: string): string {
  try {
    const url = new URL(value);
    return `${url.origin}${url.pathname}`;
  } catch {
    return value;
  }
}

function truncate(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

export function summarizeStep(step: WorkflowStepView): string {
  switch (step.type) {
    case 'HTTP_REQUEST':
      return `${step.config.method} ${displayUrl(step.config.url)}`;
    case 'DELAY':
      return `Wait ${formatDuration(step.config.durationMs)}`;
    case 'TRANSFORM': {
      const count = step.config.mappings.length;
      return `${count} field ${count === 1 ? 'mapping' : 'mappings'}`;
    }
    case 'NOTIFICATION':
      return truncate(step.config.message, 80);
    default:
      return assertNever(step);
  }
}

export function maskedDefinition(workflow: WorkflowDetail) {
  return {
    name: workflow.name,
    description: workflow.description,
    enabled: workflow.enabled,
    maxAttempts: workflow.maxAttempts,
    backoffBaseMs: workflow.backoffBaseMs,
    steps: workflow.steps.map((step) => ({
      type: step.type,
      name: step.name,
      config:
        step.type === 'HTTP_REQUEST'
          ? {
              ...step.config,
              headers: Object.fromEntries(
                Object.keys(step.config.headers).map((name) => [name, MASK]),
              ),
            }
          : step.config,
    })),
  };
}

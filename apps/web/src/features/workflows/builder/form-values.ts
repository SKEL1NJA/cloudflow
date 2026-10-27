import {
  assertNever,
  headerNameProblem,
  workflowDefinitionSchema,
  type HttpMethod,
  type StepType,
  type WorkflowDefinition,
  type WorkflowDetail,
  type WorkflowStepView,
} from '@cloudflow/shared';

export interface HeaderRow {
  name: string;
  value: string;
}

export interface MappingRow {
  target: string;
  source: string;
}

export interface StepFormValues {
  type: StepType;
  name: string;
  method: HttpMethod;
  url: string;
  headers: HeaderRow[];
  body: string;
  timeoutMs: string;
  durationMs: string;
  mappings: MappingRow[];
  message: string;
  webhookUrl: string;
}

export interface WorkflowFormValues {
  name: string;
  description: string;
  enabled: boolean;
  maxAttempts: string;
  backoffBaseMs: string;
  steps: StepFormValues[];
}

export interface Problem {
  path: string;
  message: string;
}

export interface Conversion {
  payload: unknown;
  problems: Problem[];
}

export const STEP_DEFAULT_NAMES: Record<StepType, string> = {
  HTTP_REQUEST: 'Call API',
  DELAY: 'Wait',
  TRANSFORM: 'Transform data',
  NOTIFICATION: 'Send notification',
};

export function emptyStep(type: StepType): StepFormValues {
  return {
    type,
    name: STEP_DEFAULT_NAMES[type],
    method: 'GET',
    url: '',
    headers: [],
    body: '',
    timeoutMs: '10000',
    durationMs: '1000',
    mappings: [{ target: '', source: '' }],
    message: '',
    webhookUrl: '',
  };
}

export function emptyWorkflow(): WorkflowFormValues {
  return {
    name: '',
    description: '',
    enabled: true,
    maxAttempts: '3',
    backoffBaseMs: '2000',
    steps: [emptyStep('HTTP_REQUEST')],
  };
}

function stepToForm(step: WorkflowStepView): StepFormValues {
  const base = { ...emptyStep(step.type), name: step.name };

  switch (step.type) {
    case 'HTTP_REQUEST':
      return {
        ...base,
        method: step.config.method,
        url: step.config.url,
        headers: Object.entries(step.config.headers).map(([name, value]) => ({ name, value })),
        body: step.config.body === undefined ? '' : JSON.stringify(step.config.body, null, 2),
        timeoutMs: String(step.config.timeoutMs),
      };
    case 'DELAY':
      return { ...base, durationMs: String(step.config.durationMs) };
    case 'TRANSFORM':
      return {
        ...base,
        mappings: step.config.mappings.map(({ target, source }) => ({ target, source })),
      };
    case 'NOTIFICATION':
      return { ...base, message: step.config.message, webhookUrl: step.config.webhookUrl ?? '' };
    default:
      return assertNever(step);
  }
}

export function toFormValues(workflow: WorkflowDetail): WorkflowFormValues {
  return {
    name: workflow.name,
    description: workflow.description ?? '',
    enabled: workflow.enabled,
    maxAttempts: String(workflow.maxAttempts),
    backoffBaseMs: String(workflow.backoffBaseMs),
    steps: workflow.steps.map(stepToForm),
  };
}

function toNumber(text: string): number {
  const trimmed = text.trim();
  return /^\d+$/.test(trimmed) ? Number(trimmed) : Number.NaN;
}

function httpConfig(step: StepFormValues, index: number, problems: Problem[]) {
  const headers: Record<string, string> = {};
  const seen = new Set<string>();

  step.headers.forEach((row, rowIndex) => {
    const name = row.name.trim();
    if (name === '' && row.value === '') return;

    const path = `steps.${index}.headers.${rowIndex}.name`;
    const problem = headerNameProblem(name);
    if (problem) {
      problems.push({ path, message: problem });
      return;
    }
    if (seen.has(name.toLowerCase())) {
      problems.push({ path, message: 'Header names must be unique' });
      return;
    }
    seen.add(name.toLowerCase());
    headers[name] = row.value;
  });

  let body: unknown;
  if (step.method !== 'GET' && step.body.trim() !== '') {
    try {
      body = JSON.parse(step.body);
    } catch {
      problems.push({ path: `steps.${index}.body`, message: 'Enter valid JSON' });
    }
  }

  return {
    method: step.method,
    url: step.url.trim(),
    headers,
    ...(body !== undefined && { body }),
    timeoutMs: toNumber(step.timeoutMs),
  };
}

function convertStep(step: StepFormValues, index: number, problems: Problem[]): unknown {
  switch (step.type) {
    case 'HTTP_REQUEST':
      return { type: step.type, name: step.name, config: httpConfig(step, index, problems) };
    case 'DELAY':
      return {
        type: step.type,
        name: step.name,
        config: { durationMs: toNumber(step.durationMs) },
      };
    case 'TRANSFORM':
      return {
        type: step.type,
        name: step.name,
        config: {
          mappings: step.mappings.map(({ target, source }) => ({ target, source })),
        },
      };
    case 'NOTIFICATION': {
      const webhookUrl = step.webhookUrl.trim();
      return {
        type: step.type,
        name: step.name,
        config: { message: step.message, ...(webhookUrl !== '' && { webhookUrl }) },
      };
    }
    default:
      return assertNever(step.type);
  }
}

export function convertForm(values: WorkflowFormValues): Conversion {
  const problems: Problem[] = [];
  const description = values.description.trim();

  const payload = {
    name: values.name,
    ...(description !== '' && { description }),
    enabled: values.enabled,
    maxAttempts: toNumber(values.maxAttempts),
    backoffBaseMs: toNumber(values.backoffBaseMs),
    steps: values.steps.map((step, index) => convertStep(step, index, problems)),
  };

  return { payload, problems };
}

export function toDefinition(values: WorkflowFormValues): WorkflowDefinition {
  return workflowDefinitionSchema.parse(convertForm(values).payload);
}

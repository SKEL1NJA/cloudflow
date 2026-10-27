import type { WorkflowDetail } from '@cloudflow/shared';
import { get } from 'react-hook-form';
import { describe, expect, it } from 'vitest';
import {
  convertForm,
  emptyStep,
  emptyWorkflow,
  toDefinition,
  toFormValues,
  type StepFormValues,
  type WorkflowFormValues,
} from './form-values';
import { toFormPath, workflowResolver } from './resolver';

function withStep(
  patch: Partial<StepFormValues>,
  workflow: Partial<WorkflowFormValues> = {},
): WorkflowFormValues {
  return {
    ...emptyWorkflow(),
    name: 'Sync',
    steps: [{ ...emptyStep('HTTP_REQUEST'), url: 'https://example.com', ...patch }],
    ...workflow,
  };
}

async function validate(values: WorkflowFormValues) {
  const result = await workflowResolver(values, undefined, {} as never);
  return result.errors;
}

const message = (errors: unknown, path: string) =>
  get(errors, `${path}.message`) as string | undefined;

describe('convertForm', () => {
  it('builds the API definition from what was typed', () => {
    const { payload, problems } = convertForm(
      withStep({
        headers: [
          { name: ' X-Key ', value: 'abc' },
          { name: '', value: '' },
        ],
      }),
    );

    expect(problems).toEqual([]);
    expect(payload).toEqual({
      name: 'Sync',
      enabled: true,
      maxAttempts: 3,
      backoffBaseMs: 2000,
      steps: [
        {
          type: 'HTTP_REQUEST',
          name: 'Call API',
          config: {
            method: 'GET',
            url: 'https://example.com',
            headers: { 'X-Key': 'abc' },
            timeoutMs: 10_000,
          },
        },
      ],
    });
  });

  it('ignores the body for GET and parses it for other methods', () => {
    const body = '{"a": 1}';
    const get = convertForm(withStep({ method: 'GET', body })).payload as {
      steps: { config: object }[];
    };
    const post = convertForm(withStep({ method: 'POST', body })).payload as {
      steps: { config: object }[];
    };

    expect(get.steps[0]?.config).not.toHaveProperty('body');
    expect(post.steps[0]?.config).toMatchObject({ body: { a: 1 } });
  });

  it('reports invalid JSON, bad header names and duplicates as problems on the right fields', () => {
    const { problems } = convertForm(
      withStep({
        method: 'POST',
        body: '{bad',
        headers: [
          { name: 'X-Key', value: '1' },
          { name: 'x-key', value: '2' },
          { name: '', value: 'orphan value' },
          { name: 'Host', value: 'evil' },
          { name: 'Bad Name', value: 'x' },
        ],
      }),
    );

    expect(problems).toEqual([
      { path: 'steps.0.headers.1.name', message: 'Header names must be unique' },
      { path: 'steps.0.headers.2.name', message: 'Enter a header name' },
      {
        path: 'steps.0.headers.3.name',
        message: 'This header is set automatically and cannot be changed',
      },
      { path: 'steps.0.headers.4.name', message: 'Use letters, numbers and dashes only' },
      { path: 'steps.0.body', message: 'Enter valid JSON' },
    ]);
  });

  it('turns anything that is not a plain whole number into NaN so the schema rejects it', () => {
    const { payload } = convertForm(withStep({ timeoutMs: '12abc' }, { maxAttempts: '' }));
    const typed = payload as { maxAttempts: number; steps: { config: { timeoutMs: number } }[] };
    expect(Number.isNaN(typed.maxAttempts)).toBe(true);
    expect(Number.isNaN(typed.steps[0]?.config.timeoutMs)).toBe(true);
  });
});

describe('round trip', () => {
  it('converts a stored workflow to form values and back without changing it', () => {
    const workflow = {
      id: '01a14cec-f85d-7079-b268-9c29038eb32d',
      name: 'Everything',
      description: 'All four step types',
      enabled: false,
      maxAttempts: 5,
      backoffBaseMs: 4000,
      stepCount: 4,
      lastRun: null,
      successRate: null,
      finishedRuns: 0,
      createdAt: '2026-10-01T00:00:00.000Z',
      updatedAt: '2026-10-01T00:00:00.000Z',
      steps: [
        {
          id: 's1',
          position: 0,
          type: 'HTTP_REQUEST',
          name: 'Fetch',
          config: {
            method: 'POST',
            url: 'https://example.com/api',
            headers: { authorization: 'Bearer secret' },
            body: { nested: { list: [1, 2] } },
            timeoutMs: 5000,
          },
        },
        { id: 's2', position: 1, type: 'DELAY', name: 'Wait', config: { durationMs: 1500 } },
        {
          id: 's3',
          position: 2,
          type: 'TRANSFORM',
          name: 'Map',
          config: { mappings: [{ target: 'id', source: 'body.id' }] },
        },
        {
          id: 's4',
          position: 3,
          type: 'NOTIFICATION',
          name: 'Tell',
          config: { message: 'Done', webhookUrl: 'https://hooks.example.com/x' },
        },
      ],
    } as unknown as WorkflowDetail;

    expect(toDefinition(toFormValues(workflow))).toEqual({
      name: 'Everything',
      description: 'All four step types',
      enabled: false,
      maxAttempts: 5,
      backoffBaseMs: 4000,
      steps: workflow.steps.map(({ type, name, config }) => ({ type, name, config })),
    });
  });
});

describe('workflowResolver', () => {
  it('accepts a valid workflow', async () => {
    expect(await validate(withStep({}))).toEqual({});
  });

  it('explains problems in plain language on the field that caused them', async () => {
    const errors = await validate(
      withStep(
        { url: 'not a url', timeoutMs: '50' },
        { name: '', maxAttempts: '0', backoffBaseMs: 'abc' },
      ),
    );

    expect(message(errors, 'name')).toBe('Enter a name');
    expect(message(errors, 'maxAttempts')).toBe('Use a whole number from 1 to 10');
    expect(message(errors, 'backoffBaseMs')).toBe('Use a whole number from 100 to 60000');
    expect(message(errors, 'steps.0.url')).toBe('Enter a valid http or https URL');
    expect(message(errors, 'steps.0.timeoutMs')).toBe('Use a whole number from 100 to 30000');
  });

  it('requires at least one step', async () => {
    const errors = await validate({ ...emptyWorkflow(), name: 'Sync', steps: [] });
    expect(message(errors, 'steps.root')).toBe('Add at least one step');
  });

  it('flags empty mapping rows individually', async () => {
    const errors = await validate({
      ...emptyWorkflow(),
      name: 'Sync',
      steps: [
        {
          ...emptyStep('TRANSFORM'),
          mappings: [
            { target: 'ok', source: 'a.b' },
            { target: '', source: '' },
          ],
        },
      ],
    });

    expect(message(errors, 'steps.0.mappings.0.target')).toBeUndefined();
    expect(message(errors, 'steps.0.mappings.1.target')).toBe('Enter a field name');
    expect(message(errors, 'steps.0.mappings.1.source')).toBe('Enter a source path');
  });

  it('only checks the fields that belong to the current step type', async () => {
    const stale = { ...emptyStep('DELAY'), url: 'garbage', timeoutMs: 'nope', message: '' };
    expect(await validate({ ...emptyWorkflow(), name: 'Sync', steps: [stale] })).toEqual({});
  });
});

describe('toFormPath', () => {
  const values = withStep({
    headers: [
      { name: 'X-Key', value: '1' },
      { name: 'Auth', value: '2' },
    ],
  });

  it.each([
    [{ path: [], message: '' }, 'root'],
    [{ path: ['name'], message: '' }, 'name'],
    [{ path: ['maxAttempts'], message: '' }, 'maxAttempts'],
    [{ path: ['steps'], message: '' }, 'steps.root'],
    [{ path: ['steps', 2], message: '' }, 'steps.2.type'],
    [{ path: ['steps', 1, 'name'], message: '' }, 'steps.1.name'],
    [{ path: ['steps', 0, 'config', 'url'], message: '' }, 'steps.0.url'],
    [{ path: ['steps', 0, 'config', 'durationMs'], message: '' }, 'steps.0.durationMs'],
    [{ path: ['steps', 0, 'config', 'mappings'], message: '' }, 'steps.0.mappings.root'],
    [
      { path: ['steps', 0, 'config', 'mappings', 3, 'source'], message: '' },
      'steps.0.mappings.3.source',
    ],
    [{ path: ['steps', 0, 'config', 'headers'], message: '' }, 'steps.0.headers.root'],
    [{ path: ['steps', 0, 'config', 'headers', 'Auth'], message: '' }, 'steps.0.headers.1.value'],
    [
      { path: ['steps', 0, 'config', 'headers', 'Auth'], code: 'invalid_key', message: '' },
      'steps.0.headers.1.name',
    ],
    [{ path: ['steps', 0, 'config', 'headers', 'Gone'], message: '' }, 'steps.0.headers.root'],
  ])('maps %j to %s', (issue, expected) => {
    expect(toFormPath(issue, values)).toBe(expected);
  });
});

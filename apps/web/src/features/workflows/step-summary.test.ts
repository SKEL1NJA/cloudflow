import type { WorkflowDetail, WorkflowStepView } from '@cloudflow/shared';
import { describe, expect, it } from 'vitest';
import { maskedDefinition, summarizeStep } from './step-summary';

const step = (fields: Omit<WorkflowStepView, 'id' | 'position'>): WorkflowStepView =>
  ({ id: '01a14cec-f85d-7079-b268-9c29038eb32d', position: 0, ...fields }) as WorkflowStepView;

describe('summarizeStep', () => {
  it('shows the method and URL without the query string', () => {
    const http = step({
      type: 'HTTP_REQUEST',
      name: 'Fetch',
      config: {
        method: 'POST',
        url: 'https://example.com/api/data?token=abc',
        headers: {},
        timeoutMs: 1000,
      },
    });
    expect(summarizeStep(http)).toBe('POST https://example.com/api/data');
  });

  it('describes delays, transforms and notifications', () => {
    expect(summarizeStep(step({ type: 'DELAY', name: 'Wait', config: { durationMs: 1500 } }))).toBe('Wait 1.5s');
    expect(
      summarizeStep(
        step({
          type: 'TRANSFORM',
          name: 'Map',
          config: { mappings: [{ target: 'a', source: 'b' }] },
        }),
      ),
    ).toBe('1 field mapping');
    expect(
      summarizeStep(step({ type: 'NOTIFICATION', name: 'Tell', config: { message: 'x'.repeat(100) } })),
    ).toHaveLength(80);
  });
});

describe('maskedDefinition', () => {
  it('hides header values but keeps the header names', () => {
    const workflow = {
      id: '01a14cec-f85d-7079-b268-9c29038eb32e',
      name: 'Secret holder',
      description: null,
      enabled: true,
      maxAttempts: 3,
      backoffBaseMs: 2000,
      steps: [
        step({
          type: 'HTTP_REQUEST',
          name: 'Call',
          config: {
            method: 'GET',
            url: 'https://example.com',
            headers: { authorization: 'Bearer secret-token' },
            timeoutMs: 1000,
          },
        }),
      ],
    } as unknown as WorkflowDetail;

    const text = JSON.stringify(maskedDefinition(workflow));
    expect(text).toContain('authorization');
    expect(text).not.toContain('secret-token');
  });
});
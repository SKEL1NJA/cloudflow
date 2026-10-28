import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { sessionStore } from '@/auth/session';
import { Toaster } from '@/components/ui/sonner';
import { json, mockFetch, testUser } from '@/test/fetch';

import { ExecutionDetailsPage } from './execution-details-page';

const EXECUTION_ID = '01a14cec-f85d-7079-b268-9c29038eb40d';
const WORKFLOW_ID = '01a14cec-f85d-7079-b268-9c29038eb32d';

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

const ahead = (seconds: number) => new Date(Date.now() + seconds * 1000).toISOString();

function step(position: number, overrides: Record<string, unknown>) {
  return {
    id: `step-${position}`,
    position,
    type: 'NOTIFICATION',
    name: `Step ${position}`,
    status: 'PENDING',
    attempts: 0,
    input: null,
    output: null,
    error: null,
    workerId: null,
    nextRetryAt: null,
    startedAt: null,
    finishedAt: null,
    durationMs: null,
    ...overrides,
  };
}

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: EXECUTION_ID,
    workflowId: WORKFLOW_ID,
    workflowName: 'Video Processing',
    status: 'FAILED',
    error: 'Step "Transform" failed after 3 attempts: Source path "body.missing" was not found',
    stepCount: 3,
    attempts: 5,
    createdAt: ago(60),
    startedAt: ago(60),
    finishedAt: ago(55),
    durationMs: 4200,
    input: null,
    maxAttempts: 3,
    backoffBaseMs: 2000,
    steps: [
      step(0, {
        type: 'HTTP_REQUEST',
        name: 'Fetch data',
        status: 'SUCCESS',
        attempts: 1,
        input: { start: true },
        output: { status: 200, body: { id: 42 } },
        workerId: 'worker-1',
        startedAt: ago(60),
        finishedAt: ago(59),
        durationMs: 421,
      }),
      step(1, {
        type: 'TRANSFORM',
        name: 'Transform',
        status: 'FAILED',
        attempts: 3,
        input: { status: 200, body: { id: 42 } },
        error: 'Source path "body.missing" was not found in the step input',
        workerId: 'worker-1',
        startedAt: ago(58),
        finishedAt: ago(57),
        durationMs: 132,
      }),
      step(2, {
        type: 'NOTIFICATION',
        name: 'Notify',
        status: 'SKIPPED',
      }),
    ],
    ...overrides,
  };
}

const logs = {
  data: [
    {
      id: '5',
      level: 'ERROR',
      message: 'Execution failed',
      meta: null,
      createdAt: ago(55),
      executionId: EXECUTION_ID,
      workflowId: WORKFLOW_ID,
      workflowName: 'Video Processing',
      stepExecutionId: null,
      stepName: null,
    },
    {
      id: '4',
      level: 'ERROR',
      message: 'Step "Transform" failed after 3 attempts',
      meta: null,
      createdAt: ago(57),
      executionId: EXECUTION_ID,
      workflowId: WORKFLOW_ID,
      workflowName: 'Video Processing',
      stepExecutionId: 'step-1',
      stepName: 'Transform',
    },
    {
      id: '1',
      level: 'INFO',
      message: 'Execution started',
      meta: null,
      createdAt: ago(60),
      executionId: EXECUTION_ID,
      workflowId: WORKFLOW_ID,
      workflowName: 'Video Processing',
      stepExecutionId: null,
      stepName: null,
    },
  ],
  nextCursor: null,
};

interface Handlers {
  load?: () => Response;
  retry?: () => Response;
  cancel?: () => Response;
}

function api(handlers: Handlers = {}) {
  return mockFetch((url, init) => {
    const method = init.method ?? 'GET';
    const path = url.pathname;

    if (path === `/executions/${EXECUTION_ID}` && method === 'GET') {
      return handlers.load ? handlers.load() : json(200, detail());
    }

    if (path === `/executions/${EXECUTION_ID}/retry`) {
      return handlers.retry
        ? handlers.retry()
        : json(202, detail({ status: 'QUEUED', error: null }));
    }

    if (path === `/executions/${EXECUTION_ID}/cancel`) {
      return handlers.cancel ? handlers.cancel() : json(200, detail({ status: 'CANCELLED' }));
    }

    if (path === '/logs') {
      return json(200, logs);
    }

    return json(404, {
      error: { code: 'NOT_FOUND', message: 'Not found' },
    });
  });
}

function renderPage() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  const router = createMemoryRouter(
    [
      { path: '/executions', element: <p>Executions list page</p> },
      { path: '/executions/:id', element: <ExecutionDetailsPage /> },
    ],
    { initialEntries: [`/executions/${EXECUTION_ID}`] },
  );

  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionStore.setSession(testUser, 'token');
});

afterEach(() => {
  toast.dismiss();
  vi.unstubAllGlobals();
  sessionStore.reset();
});

describe('ExecutionDetailsPage summary', () => {
  it('shows the status, workflow, duration, attempts and the failure reason', async () => {
    api();
    renderPage();

    expect(
      await screen.findByRole('heading', {
        name: 'Execution exec_038eb40d',
      }),
    ).toBeInTheDocument();

    expect(screen.getByRole('link', { name: 'Video Processing' })).toHaveAttribute(
      'href',
      `/workflows/${WORKFLOW_ID}`,
    );

    expect(screen.getByText('4.2s')).toBeInTheDocument();
    expect(screen.getByText('across 3 steps')).toBeInTheDocument();

    expect(await screen.findByRole('alert')).toHaveTextContent('failed after 3 attempts');
  });

  it('lists the steps with their status and duration', async () => {
    api();
    renderPage();

    const timeline = await screen.findByRole('list', {
      name: 'Execution steps',
    });

    const steps = Array.from(timeline.children) as HTMLElement[];

    expect(steps).toHaveLength(3);

    expect(within(steps[0] as HTMLElement).getByText('Success')).toBeInTheDocument();
    expect(within(steps[0] as HTMLElement).getByText('421ms')).toBeInTheDocument();

    expect(
      within(steps[1] as HTMLElement).getAllByText('Failed', {
        selector: 'span',
      }).length,
    ).toBeGreaterThan(0);

    expect(within(steps[2] as HTMLElement).getByText('Skipped')).toBeInTheDocument();
  });
});

describe('ExecutionDetailsPage steps', () => {
  it('opens the failed step by itself and shows the error, attempts and logs', async () => {
    api();
    renderPage();

    const panel = await screen.findByRole('region', {
      name: 'Transform details',
    });

    const failure = within(panel).getByRole('group', {
      name: 'Transform failure',
    });

    expect(failure).toHaveTextContent('Source path "body.missing" was not found');
    expect(failure).toHaveTextContent('Attempt 3 / 3');

    expect(within(panel).getByRole('button', { name: 'Retry from this step' })).toBeInTheDocument();

    expect(
      await within(panel).findByText('Step "Transform" failed after 3 attempts'),
    ).toBeInTheDocument();

    expect(screen.queryByRole('region', { name: 'Fetch data details' })).not.toBeInTheDocument();
  });

  it('expands and collapses other steps on demand, showing their input and output', async () => {
    api();
    renderPage();

    const toggle = await screen.findByRole('button', {
      name: /Fetch data/,
    });

    expect(toggle).toHaveAttribute('aria-expanded', 'false');

    await userEvent.click(toggle);

    const panel = screen.getByRole('region', {
      name: 'Fetch data details',
    });

    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    expect(within(panel).getByLabelText('Input')).toHaveTextContent('"start": true');
    expect(within(panel).getByLabelText('Output')).toHaveTextContent('"id": 42');
    expect(within(panel).getByText('worker-1')).toBeInTheDocument();

    await userEvent.click(toggle);

    expect(screen.queryByRole('region', { name: 'Fetch data details' })).not.toBeInTheDocument();
  });

  it('shows a live countdown to the next retry for a retrying step', async () => {
    api({
      load: () =>
        json(
          200,
          detail({
            status: 'RUNNING',
            error: null,
            finishedAt: null,
            durationMs: null,
            steps: [
              step(0, {
                type: 'HTTP_REQUEST',
                name: 'Call API',
                status: 'RETRYING',
                attempts: 2,
                error: 'HTTP 503',
                nextRetryAt: ahead(4),
              }),
            ],
          }),
        ),
    });

    renderPage();

    const failure = await screen.findByRole('group', {
      name: 'Call API failure',
    });

    expect(failure).toHaveTextContent('Failed, will retry');
    expect(failure).toHaveTextContent('HTTP 503');
    expect(failure).toHaveTextContent(/Attempt 2 \/ 3/);
    expect(within(failure).getByText(/in [34] seconds?/)).toBeInTheDocument();
  });

  it('jumps to the step logs from the failure box', async () => {
    api();
    renderPage();

    const panel = await screen.findByRole('region', {
      name: 'Transform details',
    });

    await userEvent.click(within(panel).getByRole('button', { name: 'View logs' }));

    expect(within(panel).getByRole('region', { name: 'Transform logs' })).toHaveFocus();
  });

  it('shows execution-level log lines separately', async () => {
    api();
    renderPage();

    const section = await screen.findByRole('region', {
      name: 'Execution log',
    });

    expect(await within(section).findByText('Execution started')).toBeInTheDocument();
    expect(within(section).getByText('Execution failed')).toBeInTheDocument();
    expect(within(section).queryByText(/Transform/)).not.toBeInTheDocument();
  });
});

describe('ExecutionDetailsPage actions', () => {
  it('retries a failed execution and swaps the retry button for cancel', async () => {
    const fetchMock = api();
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Retry execution' }));

    expect(await screen.findByText('Retrying from the failed step')).toBeInTheDocument();

    expect(
      fetchMock.mock.calls.some(
        ([url, init]) => String(url).endsWith('/retry') && init?.method === 'POST',
      ),
    ).toBe(true);

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Retry execution' })).not.toBeInTheDocument(),
    );

    expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
  });

  it('retries from the failed step box too', async () => {
    const fetchMock = api();
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Retry from this step' }));

    await waitFor(() =>
      expect(fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/retry'))).toHaveLength(
        1,
      ),
    );
  });

  it('only cancels after confirmation, and explains what will happen', async () => {
    const running = detail({
      status: 'RUNNING',
      error: null,
      finishedAt: null,
      durationMs: null,
      steps: [
        step(0, {
          name: 'Wait',
          status: 'RUNNING',
          attempts: 1,
          startedAt: ago(5),
        }),
      ],
    });

    const fetchMock = api({
      load: () => json(200, running),
    });

    renderPage();

    const cancels = () => fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/cancel'));

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    const dialog = await screen.findByRole('alertdialog');

    expect(within(dialog).getByText(/already running will finish first/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep running' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    expect(cancels()).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));

    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Cancel execution',
      }),
    );

    expect(await screen.findByText('Execution cancelled')).toBeInTheDocument();
    expect(cancels()).toHaveLength(1);
  });

  it('explains it when the execution finished before the cancel arrived', async () => {
    api({
      load: () =>
        json(
          200,
          detail({
            status: 'RUNNING',
            error: null,
            finishedAt: null,
            durationMs: null,
          }),
        ),
      cancel: () =>
        json(409, {
          error: {
            code: 'EXECUTION_FINISHED',
            message: 'This execution has already finished',
          },
        }),
    });

    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Cancel' }));

    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Cancel execution',
      }),
    );

    expect(await screen.findByText('Could not cancel the execution')).toBeInTheDocument();
    expect(screen.getByText('This execution has already finished')).toBeInTheDocument();
  });

  it('offers no actions for a finished successful execution', async () => {
    api({
      load: () => json(200, detail({ status: 'SUCCESS', error: null })),
    });

    renderPage();

    await screen.findByRole('heading', { name: /Execution exec_/ });

    expect(screen.queryByRole('button', { name: 'Retry execution' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cancel' })).not.toBeInTheDocument();
  });

  it('shows a not-found page for an execution that does not exist', async () => {
    api({
      load: () =>
        json(404, {
          error: {
            code: 'NOT_FOUND',
            message: 'Execution not found',
          },
        }),
    });

    renderPage();

    expect(await screen.findByText("This execution doesn't exist")).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to executions' })).toBeInTheDocument();
  });
});

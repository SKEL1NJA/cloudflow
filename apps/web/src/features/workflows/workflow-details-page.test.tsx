import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { Toaster } from '@/components/ui/sonner';
import { json, mockFetch, testUser } from '@/test/fetch';
import { WorkflowDetailsPage } from './workflow-details-page';

const WORKFLOW_ID = '01a14cec-f85d-7079-b268-9c29038eb32d';
const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function detail(overrides: Record<string, unknown> = {}) {
  return {
    id: WORKFLOW_ID,
    name: 'Video Processing',
    description: 'Fetch, transform and notify',
    enabled: true,
    maxAttempts: 3,
    backoffBaseMs: 2000,
    stepCount: 4,
    lastRun: { status: 'FAILED', at: minutesAgo(5) },
    successRate: 0.5,
    finishedRuns: 10,
    createdAt: minutesAgo(1000),
    updatedAt: minutesAgo(60),
    steps: [
      {
        id: 's1',
        position: 0,
        type: 'HTTP_REQUEST',
        name: 'Fetch data',
        config: {
          method: 'GET',
          url: 'https://example.com/api/data?token=abc',
          headers: { authorization: 'Bearer secret-token' },
          timeoutMs: 10000,
        },
      },
      { id: 's2', position: 1, type: 'DELAY', name: 'Cool down', config: { durationMs: 1500 } },
      {
        id: 's3',
        position: 2,
        type: 'TRANSFORM',
        name: 'Pick fields',
        config: { mappings: [{ target: 'id', source: 'body.id' }] },
      },
      {
        id: 's4',
        position: 3,
        type: 'NOTIFICATION',
        name: 'Tell someone',
        config: { message: 'Done' },
      },
    ],
    ...overrides,
  };
}

const executionRow = {
  id: '01a14cec-f85d-7079-b268-9c29038eb40d',
  workflowId: WORKFLOW_ID,
  workflowName: 'Video Processing',
  status: 'SUCCESS',
  error: null,
  stepCount: 4,
  createdAt: minutesAgo(8),
  startedAt: minutesAgo(8),
  finishedAt: minutesAgo(7),
  durationMs: 4200,
};

function api(workflowResponse: () => Response = () => json(200, detail())) {
  return mockFetch((url, init) => {
    const method = init.method ?? 'GET';
    if (url.pathname === `/workflows/${WORKFLOW_ID}` && method === 'GET') return workflowResponse();
    if (url.pathname === `/workflows/${WORKFLOW_ID}` && method === 'DELETE') return json(204);
    if (url.pathname === '/executions') {
      return json(200, {
        data: [executionRow],
        pagination: { page: 1, pageSize: 10, total: 1, totalPages: 1 },
      });
    }
    return json(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
}

function renderPage(path = `/workflows/${WORKFLOW_ID}`) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: '/workflows', element: <p>Workflows list page</p> },
      { path: '/workflows/:id', element: <WorkflowDetailsPage /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  sessionStore.setSession(testUser, 'token');
});

afterEach(() => {
  toast.dismiss();
  vi.unstubAllGlobals();
  sessionStore.reset();
});

describe('WorkflowDetailsPage', () => {
  it('shows the summary and the step flow without leaking query strings', async () => {
    api();
    renderPage();

    expect(await screen.findByRole('heading', { name: 'Video Processing' })).toBeInTheDocument();
    expect(screen.getByText('Fetch, transform and notify')).toBeInTheDocument();
    expect(screen.getByText('50%')).toBeInTheDocument();
    expect(screen.getByText('3 attempts, 2.0s backoff')).toBeInTheDocument();

    const steps = within(screen.getByRole('list', { name: 'Workflow steps' })).getAllByRole(
      'listitem',
    );
    expect(steps).toHaveLength(4);
    expect(
      within(steps[0] as HTMLElement).getByText(/GET https:\/\/example\.com\/api\/data$/),
    ).toBeInTheDocument();
    expect(within(steps[1] as HTMLElement).getByText(/Wait 1\.5s/)).toBeInTheDocument();
    expect(within(steps[2] as HTMLElement).getByText(/1 field mapping/)).toBeInTheDocument();
    expect(screen.queryByText(/token=abc/)).not.toBeInTheDocument();
  });

  it('loads executions only when their tab is opened, and keeps the tab in the URL', async () => {
    const fetchMock = api();
    const router = renderPage();
    await screen.findByRole('heading', { name: 'Video Processing' });
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/executions'))).toBe(false);

    await userEvent.click(screen.getByRole('tab', { name: 'Executions' }));

    expect(router.state.location.search).toBe('?tab=executions');
    expect(await screen.findByText('4.2s')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => String(url).includes('/executions'));
    expect(String(call?.[0])).toContain(`workflowId=${WORKFLOW_ID}`);
  });

  it('hides header values in the configuration tab', async () => {
    api();
    renderPage(`/workflows/${WORKFLOW_ID}?tab=configuration`);

    const definition = await screen.findByLabelText('Workflow definition');
    expect(definition).toHaveTextContent('authorization');
    expect(definition).not.toHaveTextContent('secret-token');
  });

  it('does not allow running a disabled workflow', async () => {
    api(() => json(200, detail({ enabled: false })));
    renderPage();

    expect(await screen.findByRole('button', { name: 'Run workflow' })).toBeDisabled();
    expect(screen.getByRole('switch', { name: 'Enabled' })).not.toBeChecked();
  });

  it('deletes after confirmation and returns to the list', async () => {
    api();
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'More actions' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Delete workflow',
      }),
    );

    expect(await screen.findByText('Workflows list page')).toBeInTheDocument();
  });

  it('shows a not-found page for a workflow that does not exist', async () => {
    api(() => json(404, { error: { code: 'NOT_FOUND', message: 'Workflow not found' } }));
    renderPage();

    expect(await screen.findByText("This workflow doesn't exist")).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Back to workflows' })).toBeInTheDocument(),
    );
  });
});

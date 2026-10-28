import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { json, mockFetch, testUser } from '@/test/fetch';
import { ExecutionsPage } from './executions-page';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

const WORKFLOW_A = '01a14cec-f85d-7079-b268-9c29038eb32d';
const WORKFLOW_B = '01a14cec-f85d-7079-b268-9c29038eb33d';

function execution(overrides: Record<string, unknown> = {}) {
  return {
    id: '01a14cec-f85d-7079-b268-9c29038eb40d',
    workflowId: WORKFLOW_A,
    workflowName: 'Video Processing',
    status: 'FAILED',
    error: 'Step failed',
    stepCount: 3,
    attempts: 5,
    createdAt: minutesAgo(5),
    startedAt: minutesAgo(5),
    finishedAt: minutesAgo(4),
    durationMs: 4200,
    ...overrides,
  };
}

const failed = execution();
const succeeded = execution({
  id: '01a14cec-f85d-7079-b268-9c29038eb41d',
  workflowId: WORKFLOW_B,
  workflowName: 'Data Sync',
  status: 'SUCCESS',
  attempts: 3,
  durationMs: 130,
});

function pageOf(items: unknown[], total = items.length) {
  return {
    data: items,
    pagination: { page: 1, pageSize: 20, total, totalPages: Math.max(1, Math.ceil(total / 20)) },
  };
}

const workflowOptions = pageOf([
  { id: WORKFLOW_A, name: 'Video Processing' },
  { id: WORKFLOW_B, name: 'Data Sync' },
]);

function api(listResponse: () => Response = () => json(200, pageOf([failed, succeeded]))) {
  return mockFetch((url) => {
    if (url.pathname === '/executions') return listResponse();
    if (url.pathname === '/workflows') return json(200, workflowOptions);
    return json(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
}

function renderPage(initialEntry = '/executions') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/executions', element: <ExecutionsPage /> },
      { path: '/executions/:id', element: <p>Execution details page</p> },
      { path: '/workflows', element: <p>Workflows page</p> },
    ],
    { initialEntries: [initialEntry] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

function findTable(): Promise<HTMLElement> {
  return screen.findByRole('table', { name: 'Executions' });
}

async function findRow(workflowName: string): Promise<HTMLElement> {
  const table = await findTable();
  return within(table).getByText(workflowName).closest('tr') as HTMLElement;
}

function listRequests(fetchMock: ReturnType<typeof api>): URL[] {
  return fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname === '/executions');
}

beforeEach(() => {
  sessionStore.setSession(testUser, 'token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStore.reset();
});

describe('ExecutionsPage', () => {
  it('lists executions with status, duration and attempts', async () => {
    api();
    renderPage();

    const failedRow = within(await findRow('Video Processing'));
    expect(failedRow.getByText('Failed')).toBeInTheDocument();
    expect(failedRow.getByText('4.2s')).toBeInTheDocument();
    expect(failedRow.getByText('5')).toBeInTheDocument();

    const syncRow = within(await findRow('Data Sync'));
    expect(syncRow.getByText('Success')).toBeInTheDocument();
    expect(syncRow.getByText('130ms')).toBeInTheDocument();
  });

  it('sends a status filter and keeps it in the URL', async () => {
    const fetchMock = api();
    const router = renderPage();
    await findTable();

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'FAILED');

    expect(router.state.location.search).toBe('?status=FAILED');
    await waitFor(() =>
      expect(
        listRequests(fetchMock).some((url) => url.searchParams.get('status') === 'FAILED'),
      ).toBe(true),
    );
  });

  it('offers the user workflows and filters by the chosen one', async () => {
    const fetchMock = api();
    const router = renderPage();
    await findTable();
    await screen.findByRole('option', { name: 'Data Sync' });

    await userEvent.selectOptions(screen.getByLabelText('Workflow'), WORKFLOW_B);

    expect(router.state.location.search).toBe(`?workflow=${WORKFLOW_B}`);
    await waitFor(() =>
      expect(
        listRequests(fetchMock).some((url) => url.searchParams.get('workflowId') === WORKFLOW_B),
      ).toBe(true),
    );
  });

  it('turns the date preset into a from timestamp and the duration preset into bounds', async () => {
    const fetchMock = api();
    renderPage();
    await findTable();

    await userEvent.selectOptions(screen.getByLabelText('Date'), '24h');
    await userEvent.selectOptions(screen.getByLabelText('Duration'), '1to10s');

    await waitFor(() => {
      const last = listRequests(fetchMock).at(-1);
      expect(last?.searchParams.get('minDurationMs')).toBe('1000');
      expect(last?.searchParams.get('maxDurationMs')).toBe('9999');
      const from = Date.parse(last?.searchParams.get('from') ?? '');
      expect(Date.now() - from).toBeGreaterThan(86_400_000 - 5000);
      expect(Date.now() - from).toBeLessThan(86_400_000 + 5000);
    });
  });

  it('restores filters from the URL', async () => {
    const fetchMock = api();
    renderPage('/executions?status=FAILED&duration=gt1m');

    expect(screen.getByLabelText('Status')).toHaveValue('FAILED');
    expect(screen.getByLabelText('Duration')).toHaveValue('gt1m');
    await waitFor(() => {
      const first = listRequests(fetchMock)[0];
      expect(first?.searchParams.get('status')).toBe('FAILED');
      expect(first?.searchParams.get('minDurationMs')).toBe('60000');
    });
  });

  it('clears all filters at once', async () => {
    api();
    const router = renderPage('/executions?status=FAILED&when=7d');
    await findTable();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));

    await waitFor(() => expect(router.state.location.search).toBe(''));
    expect(screen.getByLabelText('Status')).toHaveValue('');
    expect(screen.getByLabelText('Date')).toHaveValue('');
  });

  it('pages through results', async () => {
    const fetchMock = api(() => json(200, pageOf([failed], 45)));
    const router = renderPage();

    expect(await screen.findByText('45 executions · Page 1 of 3')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Next' }));

    expect(router.state.location.search).toBe('?page=2');
    await waitFor(() =>
      expect(listRequests(fetchMock).some((url) => url.searchParams.get('page') === '2')).toBe(
        true,
      ),
    );
  });

  it('shows the right empty state for no data and for no matches', async () => {
    api(() => json(200, pageOf([])));
    const router = renderPage();

    expect(await screen.findByText('No executions yet')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Go to workflows' })).toBeInTheDocument();

    await router.navigate('/executions?status=FAILED');
    expect(await screen.findByText('No executions match your filters')).toBeInTheDocument();
  });

  it('shows an error with a retry', async () => {
    let calls = 0;
    api(() =>
      ++calls === 1
        ? json(500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } })
        : json(200, pageOf([failed])),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await findRow('Video Processing')).toBeInTheDocument();
  });

  it('opens an execution when its row is clicked', async () => {
    api();
    renderPage();

    const row = await findRow('Data Sync');
    await userEvent.click(within(row).getByText('Data Sync'));
    expect(await screen.findByText('Execution details page')).toBeInTheDocument();
  });
});

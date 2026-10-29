import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { json, mockFetch, testUser } from '@/test/fetch';
import { LogsPage } from './logs-page';

const EXECUTION = '01a14cec-f85d-7079-b268-9c29038eb40d';
const WORKFLOW_A = '01a14cec-f85d-7079-b268-9c29038eb32d';
const WORKFLOW_B = '01a14cec-f85d-7079-b268-9c29038eb33d';

function log(id: number, overrides: Record<string, unknown> = {}) {
  return {
    id: String(id),
    level: 'INFO',
    message: 'Step "Fetch" started',
    meta: { attempt: 1, type: 'HTTP_REQUEST' },
    createdAt: new Date(Date.now() - (100 - id) * 1000).toISOString(),
    executionId: EXECUTION,
    workflowId: WORKFLOW_A,
    workflowName: 'Video Processing',
    stepExecutionId: 'step-1',
    stepName: 'Fetch',
    ...overrides,
  };
}

const lines = [
  log(3, {
    level: 'ERROR',
    message: 'Step "Fetch" failed on attempt 1 of 3: HTTP 503. Retrying in 1.5s',
    meta: { attempt: 1, delayMs: 1537 },
  }),
  log(2),
  log(1, { message: 'Execution started', stepExecutionId: null, stepName: null, meta: null }),
];

const workflowOptions = {
  data: [
    { id: WORKFLOW_A, name: 'Video Processing' },
    { id: WORKFLOW_B, name: 'Data Sync' },
  ],
  pagination: { page: 1, pageSize: 100, total: 2, totalPages: 1 },
};

interface Options {
  logs?: (url: URL) => Response;
}

function api(options: Options = {}) {
  return mockFetch((url) => {
    if (url.pathname === '/logs') {
      return options.logs ? options.logs(url) : json(200, { data: lines, nextCursor: null });
    }
    if (url.pathname === '/workflows') return json(200, workflowOptions);
    return json(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
}

function renderPage(initialEntry = '/logs') {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      { path: '/logs', element: <LogsPage /> },
      { path: '/executions/:id', element: <p>Execution page</p> },
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

function logRequests(fetchMock: ReturnType<typeof api>): URL[] {
  return fetchMock.mock.calls
    .map(([url]) => new URL(String(url)))
    .filter((url) => url.pathname === '/logs');
}

const viewer = () => screen.findByRole('region', { name: 'Log lines' });

beforeEach(() => {
  sessionStore.setSession(testUser, 'token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStore.reset();
});

describe('LogsPage', () => {
  it('shows each line with its level, workflow and step, message and metadata', async () => {
    api();
    renderPage();

    const region = within(await viewer());
    expect(region.getByText('ERROR')).toBeInTheDocument();
    expect(region.getByText(/Retrying in 1\.5s/)).toBeInTheDocument();
    expect(region.getByText('attempt=1 delayMs=1537')).toBeInTheDocument();
    expect(region.getAllByText('Video Processing / Fetch')).toHaveLength(2);
    expect(region.getByText('Video Processing')).toBeInTheDocument();
    expect(region.getAllByRole('button', { name: 'exec_038eb40d' })).toHaveLength(3);
  });

  it('debounces the search, keeps it in the URL and highlights the matches', async () => {
    const fetchMock = api();
    const router = renderPage();
    await viewer();

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search logs' }), 'retry');

    await waitFor(() => expect(router.state.location.search).toBe('?q=retry'), { timeout: 2000 });
    await waitFor(() =>
      expect(logRequests(fetchMock).some((url) => url.searchParams.get('search') === 'retry')).toBe(
        true,
      ),
    );
    expect(logRequests(fetchMock).filter((url) => url.searchParams.has('search'))).toHaveLength(1);
    expect(await screen.findByText('Retry', { selector: 'mark' })).toBeInTheDocument();
  });

  it('filters by level and by workflow', async () => {
    const fetchMock = api();
    const router = renderPage();
    await viewer();
    await screen.findByRole('option', { name: 'Data Sync' });

    await userEvent.selectOptions(screen.getByLabelText('Level'), 'ERROR');
    await userEvent.selectOptions(screen.getByLabelText('Workflow'), WORKFLOW_B);

    expect(router.state.location.search).toBe(`?level=ERROR&workflow=${WORKFLOW_B}`);
    await waitFor(() => {
      const last = logRequests(fetchMock).at(-1);
      expect(last?.searchParams.get('level')).toBe('ERROR');
      expect(last?.searchParams.get('workflowId')).toBe(WORKFLOW_B);
    });
  });

  it('turns the time range preset into a from timestamp', async () => {
    const fetchMock = api();
    renderPage();
    await viewer();

    await userEvent.selectOptions(screen.getByLabelText('Time range'), '1h');

    await waitFor(() => {
      const from = Date.parse(logRequests(fetchMock).at(-1)?.searchParams.get('from') ?? '');
      expect(Date.now() - from).toBeGreaterThan(3_600_000 - 5000);
      expect(Date.now() - from).toBeLessThan(3_600_000 + 5000);
    });
  });

  it('narrows to one execution when its id is clicked, and clears the filter again', async () => {
    const fetchMock = api();
    const router = renderPage();
    const region = within(await viewer());

    await userEvent.click(
      region.getAllByRole('button', { name: 'exec_038eb40d' })[0] as HTMLElement,
    );

    expect(router.state.location.search).toBe(`?execution=${EXECUTION}`);
    expect(
      await screen.findByRole('button', { name: 'Clear execution filter' }),
    ).toBeInTheDocument();
    await waitFor(() =>
      expect(logRequests(fetchMock).at(-1)?.searchParams.get('executionId')).toBe(EXECUTION),
    );

    await userEvent.click(screen.getByRole('button', { name: 'Clear execution filter' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('loads older lines with the cursor and appends them', async () => {
    const fetchMock = api({
      logs: (url) =>
        url.searchParams.get('cursor') === '1'
          ? json(200, {
              data: [log(0, { message: 'An older line', meta: null })],
              nextCursor: null,
            })
          : json(200, { data: lines, nextCursor: '1' }),
    });
    renderPage();
    const region = await viewer();
    expect(within(region).queryByText('An older line')).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Load older lines' }));

    expect(await within(await viewer()).findByText('An older line')).toBeInTheDocument();
    expect(within(await viewer()).getByText('Execution started')).toBeInTheDocument();
    expect(logRequests(fetchMock).some((url) => url.searchParams.get('cursor') === '1')).toBe(true);
    expect(screen.queryByRole('button', { name: 'Load older lines' })).not.toBeInTheDocument();
  });

  it('keeps follow mode in the URL', async () => {
    api();
    const router = renderPage();
    await viewer();
    const toggle = screen.getByRole('switch', { name: 'Auto-refresh' });
    expect(toggle).toBeChecked();

    await userEvent.click(toggle);

    expect(router.state.location.search).toBe('?live=off');
    expect(screen.getByRole('switch', { name: 'Auto-refresh' })).not.toBeChecked();
  });

  it('shows the right empty state for no logs and for no matches', async () => {
    api({ logs: () => json(200, { data: [], nextCursor: null }) });
    const router = renderPage();

    expect(await screen.findByText('No logs yet')).toBeInTheDocument();
    await router.navigate('/logs?level=ERROR');
    expect(await screen.findByText('No log lines match your filters')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('shows an error with a retry', async () => {
    let calls = 0;
    api({
      logs: () =>
        ++calls === 1
          ? json(500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } })
          : json(200, { data: lines, nextCursor: null }),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await viewer()).toBeInTheDocument();
  });
});

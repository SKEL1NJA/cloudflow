import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { Toaster } from '@/components/ui/sonner';
import { headerOf, json, mockFetch, testUser } from '@/test/fetch';
import { WorkflowsPage } from './workflows-page';

const minutesAgo = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();

function workflow(overrides: Record<string, unknown> = {}) {
  return {
    id: '01a14cec-f85d-7079-b268-9c29038eb32d',
    name: 'Video Processing',
    description: 'Fetch, transform and notify',
    enabled: true,
    maxAttempts: 3,
    backoffBaseMs: 2000,
    stepCount: 3,
    lastRun: { status: 'SUCCESS', at: minutesAgo(10) },
    successRate: 0.92,
    finishedRuns: 25,
    createdAt: minutesAgo(1000),
    updatedAt: minutesAgo(60),
    ...overrides,
  };
}

const videoProcessing = workflow();
const dataSync = workflow({
  id: '01a14cec-f85d-7079-b268-9c29038eb33e',
  name: 'Data Sync',
  description: null,
  enabled: false,
  stepCount: 1,
  lastRun: null,
  successRate: null,
  finishedRuns: 0,
});

function listOf(items: unknown[], total = items.length, page = 1) {
  return {
    data: items,
    pagination: { page, pageSize: 20, total, totalPages: Math.max(1, Math.ceil(total / 20)) },
  };
}

const execution = {
  id: '01a14cec-f85d-7079-b268-9c29038eb40d',
  workflowId: videoProcessing.id,
  workflowName: 'Video Processing',
  status: 'QUEUED',
  error: null,
  stepCount: 3,
  createdAt: minutesAgo(0),
  startedAt: null,
  finishedAt: null,
  durationMs: null,
  input: null,
  maxAttempts: 3,
  backoffBaseMs: 2000,
  steps: [],
};

interface Handlers {
  list?: () => Response | Promise<Response>;
  patch?: () => Response | Promise<Response>;
}

function api(handlers: Handlers = {}) {
  return mockFetch((url, init) => {
    const method = init.method ?? 'GET';
    if (url.pathname === '/workflows' && method === 'GET') {
      return handlers.list ? handlers.list() : json(200, listOf([videoProcessing, dataSync]));
    }
    if (url.pathname.endsWith('/run') && method === 'POST') return json(202, execution);
    if (method === 'PATCH') return handlers.patch ? handlers.patch() : json(200, videoProcessing);
    if (method === 'DELETE') return json(204);
    return json(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
}

function renderPage(initialEntry = '/workflows') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: '/workflows', element: <WorkflowsPage /> },
      { path: '/workflows/new', element: <p>New workflow page</p> },
      { path: '/workflows/:id', element: <p>Workflow page</p> },
    ],
    { initialEntries: [initialEntry] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return router;
}

function requestedUrls(fetchMock: ReturnType<typeof api>): string[] {
  return fetchMock.mock.calls.map(([url]) => String(url));
}

beforeEach(() => {
  sessionStore.setSession(testUser, 'token');
});

afterEach(() => {
  toast.dismiss();
  vi.unstubAllGlobals();
  sessionStore.reset();
});

describe('WorkflowsPage list', () => {
  it('shows each workflow with its status, steps, last run and success rate', async () => {
    api();
    renderPage();

    const video = (await screen.findByRole('link', { name: 'Video Processing' })).closest('tr') as HTMLElement;
    expect(within(video).getByRole('switch', { name: 'Video Processing enabled' })).toBeChecked();
    expect(within(video).getByText('3')).toBeInTheDocument();
    expect(within(video).getByText('Success')).toBeInTheDocument();
    expect(within(video).getByText('10m ago')).toBeInTheDocument();
    expect(within(video).getByText('92%')).toBeInTheDocument();

    const sync = screen.getByRole('link', { name: 'Data Sync' }).closest('tr') as HTMLElement;
    expect(within(sync).getByRole('switch', { name: 'Data Sync enabled' })).not.toBeChecked();
    expect(within(sync).getByText('Never run')).toBeInTheDocument();
    expect(within(sync).getByRole('button', { name: 'Run Data Sync' })).toBeDisabled();
  });

  it('debounces the search and keeps it in the URL', async () => {
    const fetchMock = api();
    const router = renderPage();
    await screen.findByRole('link', { name: 'Video Processing' });

    await userEvent.type(screen.getByRole('searchbox', { name: 'Search workflows' }), 'video');

    await waitFor(() => expect(router.state.location.search).toBe('?q=video'), { timeout: 2000 });
    await waitFor(() => expect(requestedUrls(fetchMock).some((url) => url.includes('search=video'))).toBe(true));
    expect(requestedUrls(fetchMock).filter((url) => url.includes('search='))).toHaveLength(1);
  });

  it('filters by status', async () => {
    const fetchMock = api();
    const router = renderPage();
    await screen.findByRole('link', { name: 'Video Processing' });

    await userEvent.click(screen.getByRole('button', { name: 'Enabled' }));

    expect(router.state.location.search).toBe('?status=enabled');
    await waitFor(() => expect(requestedUrls(fetchMock).some((url) => url.includes('enabled=true'))).toBe(true));
  });

  it('sorts by a column and flips the direction on a second click', async () => {
    const fetchMock = api();
    const router = renderPage();
    await screen.findByRole('link', { name: 'Video Processing' });

    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(router.state.location.search).toBe('?sort=name&order=asc');
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'ascending');

    await userEvent.click(screen.getByRole('button', { name: 'Name' }));
    expect(router.state.location.search).toBe('?sort=name');
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'descending');
    await waitFor(() =>
      expect(requestedUrls(fetchMock).some((url) => url.includes('sortBy=name') && url.includes('sortOrder=desc'))).toBe(true),
    );
  });

  it('pages through results', async () => {
    const fetchMock = api({ list: () => json(200, listOf([videoProcessing], 45)) });
    const router = renderPage();

    expect(await screen.findByText('45 workflows · Page 1 of 3')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Previous' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Next' }));
    expect(router.state.location.search).toBe('?page=2');
    await waitFor(() => expect(requestedUrls(fetchMock).some((url) => url.includes('page=2'))).toBe(true));
  });

  it('shows the empty states', async () => {
    api({ list: () => json(200, listOf([])) });
    renderPage();
    expect(await screen.findByText('No workflows yet')).toBeInTheDocument();
    expect(screen.getAllByRole('link', { name: 'Create workflow' }).length).toBeGreaterThan(0);
  });

  it('offers to clear filters when nothing matches', async () => {
    api({ list: () => json(200, listOf([])) });
    const router = renderPage('/workflows?q=zzz');

    expect(await screen.findByText('No workflows match your filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    await waitFor(() => expect(router.state.location.search).toBe(''));
  });

  it('shows an error with a retry', async () => {
    let calls = 0;
    api({
      list: () =>
        ++calls === 1
          ? json(500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } })
          : json(200, listOf([videoProcessing])),
    });
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByRole('link', { name: 'Video Processing' })).toBeInTheDocument();
  });
});

describe('WorkflowsPage actions', () => {
  it('flips the switch immediately and puts it back with an error when the update fails', async () => {
    let finish: (response: Response) => void = () => undefined;
    api({ patch: () => new Promise<Response>((resolve) => (finish = resolve)) });
    renderPage();

    const toggle = await screen.findByRole('switch', { name: 'Video Processing enabled' });
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-checked', 'false');

    finish(json(500, { error: { code: 'INTERNAL_ERROR', message: 'Database exploded' } }));
    await waitFor(() => expect(toggle).toHaveAttribute('aria-checked', 'true'));
    expect(await screen.findByText('Could not update the workflow')).toBeInTheDocument();
    expect(screen.getByText('Database exploded')).toBeInTheDocument();
  });

  it('keeps the new state and confirms when the update succeeds', async () => {
    const fetchMock = api({ patch: () => json(200, { ...videoProcessing, enabled: false }) });
    renderPage();

    const toggle = await screen.findByRole('switch', { name: 'Video Processing enabled' });
    await userEvent.click(toggle);

    expect(await screen.findByText('Workflow disabled')).toBeInTheDocument();
    const patch = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(patch?.[1]?.body))).toEqual({ enabled: false });
  });

  it('starts a run with an idempotency key and confirms with a link to the execution', async () => {
    const fetchMock = api();
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Run Video Processing' }));

    expect(await screen.findByText('Execution started')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View' })).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/run'));
    expect(headerOf(call?.[1], 'idempotency-key')).toMatch(/^[0-9a-f-]{36}$/);
    expect(call?.[1]?.body).toBe('{}');
  });

  it('uses a different idempotency key for each click', async () => {
    const fetchMock = api();
    renderPage();
    const run = await screen.findByRole('button', { name: 'Run Video Processing' });

    await userEvent.click(run);
    await waitFor(() => expect(run).toBeEnabled());
    await userEvent.click(run);

    await waitFor(() => {
      const keys = fetchMock.mock.calls
        .filter(([url]) => String(url).endsWith('/run'))
        .map(([, init]) => headerOf(init, 'idempotency-key'));
      expect(keys).toHaveLength(2);
      expect(new Set(keys).size).toBe(2);
    });
  });

  it('only deletes after confirmation', async () => {
    const fetchMock = api();
    renderPage();
    const deletes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');

    await userEvent.click(await screen.findByRole('button', { name: 'Actions for Video Processing' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Delete "Video Processing"?')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(deletes()).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Actions for Video Processing' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await userEvent.click(within(await screen.findByRole('alertdialog')).getByRole('button', { name: 'Delete workflow' }));

    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(String(deletes()[0]?.[0])).toContain(`/workflows/${videoProcessing.id}`);
    expect(await screen.findByText('Workflow deleted')).toBeInTheDocument();
  });
});
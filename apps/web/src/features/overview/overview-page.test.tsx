import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { json, mockFetch, testUser } from '@/test/fetch';
import { OverviewPage } from './overview-page';

vi.mock('./execution-chart', () => ({
  ExecutionChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="chart" data-points={data.length} />
  ),
}));

const overview = {
  range: '24h',
  workflows: { total: 4, enabled: 3 },
  executions: { queued: 2, running: 1, success: 40, failed: 5, cancelled: 0 },
  health: {
    database: { status: 'up', latencyMs: 4 },
    redis: { status: 'up', latencyMs: 2 },
    workers: { online: 2, busy: 1, offline: 0 },
  },
};

const series = {
  range: '24h',
  bucketSeconds: 3600,
  points: [
    {
      start: '2026-10-20T09:00:00.000Z',
      counts: { success: 3, failed: 1, cancelled: 0, active: 0 },
    },
  ],
};

const emptySeries = {
  ...series,
  points: [
    {
      start: series.points[0]?.start,
      counts: { success: 0, failed: 0, cancelled: 0, active: 0 },
    },
  ],
};

const execution = {
  id: '01a14cec-f85d-7079-b268-9c29038eb32d',
  workflowId: '01a14cec-f85d-7079-b268-9c29038eb32e',
  workflowName: 'Video Processing',
  status: 'FAILED',
  error: 'Step failed',
  stepCount: 3,
  createdAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  startedAt: new Date(Date.now() - 5 * 60_000).toISOString(),
  finishedAt: new Date(Date.now() - 4 * 60_000).toISOString(),
  durationMs: 4200,
};

const executions = {
  data: [execution],
  pagination: { page: 1, pageSize: 8, total: 1, totalPages: 1 },
};

const noExecutions = {
  data: [],
  pagination: { page: 1, pageSize: 8, total: 0, totalPages: 1 },
};

function api(overrides: Record<string, () => Response> = {}) {
  return mockFetch((url) => {
    const override = overrides[url.pathname];

    if (override) {
      return override();
    }

    switch (url.pathname) {
      case '/overview':
        return json(200, overview);
      case '/stats/executions':
        return json(200, series);
      case '/executions':
        return json(200, executions);
      default:
        return json(404, {
          error: { code: 'NOT_FOUND', message: 'Not found' },
        });
    }
  });
}

function renderOverview() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });

  const router = createMemoryRouter(
    [
      { path: '/', element: <OverviewPage /> },
      { path: '/executions/:id', element: <p>Execution page</p> },
    ],
    { initialEntries: ['/'] },
  );

  return render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  sessionStore.setSession(testUser, 'token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStore.reset();
});

describe('OverviewPage', () => {
  it('shows the key numbers, system health and recent executions', async () => {
    api();
    renderOverview();

    const total = await screen.findByRole('group', {
      name: 'Total workflows',
    });

    expect(await within(total).findByText('4')).toBeInTheDocument();
    expect(within(total).getByText('3 enabled')).toBeInTheDocument();

    expect(
      within(screen.getByRole('group', { name: 'Running executions' })).getByText('1'),
    ).toBeInTheDocument();

    expect(
      within(screen.getByRole('group', { name: 'Running executions' })).getByText('2 queued'),
    ).toBeInTheDocument();

    expect(
      within(screen.getByRole('group', { name: 'Successful executions' })).getByText('40'),
    ).toBeInTheDocument();

    expect(
      within(screen.getByRole('group', { name: 'Failed executions' })).getByText('5'),
    ).toBeInTheDocument();

    expect(screen.getByText('Operational · 4ms')).toBeInTheDocument();
    expect(screen.getByText('Operational · 2ms')).toBeInTheDocument();
    expect(screen.getByText('3 online')).toBeInTheDocument();

    expect(await screen.findByTestId('chart')).toHaveAttribute('data-points', '1');

    expect(await screen.findByText('Video Processing')).toBeInTheDocument();
    expect(screen.getByText('Failed', { selector: 'span' })).toBeInTheDocument();
    expect(screen.getByText('4.2s')).toBeInTheDocument();
    expect(screen.getByText('5m ago')).toBeInTheDocument();
  });

  it('requests new data when the range changes and reflects it in the switch', async () => {
    const fetchMock = api();
    renderOverview();

    await screen.findByRole('group', { name: 'Total workflows' });

    await userEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));

    expect(screen.getByRole('button', { name: 'Last 7 days' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    expect(screen.getByRole('button', { name: 'Last 24 hours' })).toHaveAttribute(
      'aria-pressed',
      'false',
    );

    await vi.waitFor(() => {
      const urls = fetchMock.mock.calls.map(([url]) => String(url));

      expect(urls).toContain('http://api.test/overview?range=7d');
      expect(urls).toContain('http://api.test/stats/executions?range=7d');
    });
  });

  it('opens an execution when its row is clicked', async () => {
    api();
    renderOverview();

    await userEvent.click(await screen.findByText('Video Processing'));

    expect(await screen.findByText('Execution page')).toBeInTheDocument();
  });

  it('shows friendly empty states when nothing has run', async () => {
    api({
      '/executions': () => json(200, noExecutions),
      '/stats/executions': () => json(200, emptySeries),
    });

    renderOverview();

    expect(await screen.findByText('No executions yet')).toBeInTheDocument();
    expect(await screen.findByText('No executions in this period')).toBeInTheDocument();

    expect(screen.queryByTestId('chart')).not.toBeInTheDocument();
  });

  it('shows an error with a retry that recovers', async () => {
    let overviewCalls = 0;

    api({
      '/overview': () =>
        ++overviewCalls === 1
          ? json(
              500,
              {
                error: {
                  code: 'INTERNAL_ERROR',
                  message: 'Something went wrong',
                },
              },
              { 'x-request-id': 'req-77' },
            )
          : json(200, overview),
    });

    renderOverview();

    const retryButtons = await screen.findAllByRole('button', {
      name: 'Try again',
    });

    expect(screen.getAllByText('Reference: req-77').length).toBeGreaterThan(0);

    await userEvent.click(retryButtons[0] as HTMLElement);

    expect(await screen.findByRole('group', { name: 'Total workflows' })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Try again' })).not.toBeInTheDocument();
  });
});

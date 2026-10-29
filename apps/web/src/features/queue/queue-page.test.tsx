import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { json, mockFetch, testUser } from '@/test/fetch';
import { QueuePage } from './queue-page';

vi.mock('./activity-chart', () => ({
  ActivityChart: ({ data }: { data: unknown[] }) => (
    <div data-testid="activity-chart" data-points={data.length} />
  ),
}));

const counts = { waiting: 4, active: 2, delayed: 1, completed: 120, failed: 0, deadLetter: 3 };

const series = {
  range: '24h',
  bucketSeconds: 3600,
  points: [{ start: '2026-10-20T09:00:00.000Z', counts: { succeeded: 9, failed: 1 } }],
};

const emptySeries = {
  ...series,
  points: [{ start: series.points[0]?.start, counts: { succeeded: 0, failed: 0 } }],
};

function worker(overrides: Record<string, unknown>) {
  return {
    workerId: 'worker-1',
    hostname: 'host',
    pid: 1,
    status: 'online',
    concurrency: 5,
    processing: 0,
    completed: 0,
    failed: 0,
    startedAt: new Date().toISOString(),
    lastHeartbeat: new Date().toISOString(),
    uptimeSeconds: 10,
    ...overrides,
  };
}

const twoWorkers = {
  summary: { online: 1, busy: 1, offline: 0 },
  workers: [
    worker({ status: 'busy', processing: 2 }),
    worker({ workerId: 'worker-2', status: 'online' }),
  ],
};
const noWorkers = { summary: { online: 0, busy: 0, offline: 0 }, workers: [] };

interface Responses {
  queue?: () => Response;
  activity?: () => Response;
  workers?: unknown;
}

function api(responses: Responses = {}) {
  return mockFetch((url) => {
    if (url.pathname === '/queue')
      return responses.queue ? responses.queue() : json(200, { counts });
    if (url.pathname === '/queue/activity')
      return responses.activity ? responses.activity() : json(200, series);
    if (url.pathname === '/workers') return json(200, responses.workers ?? twoWorkers);
    return json(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
}

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '/queue', element: <QueuePage /> }], {
    initialEntries: ['/queue'],
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const valueOf = (name: string) =>
  waitFor(() => {
    const value = screen.getByRole('group', { name }).querySelector('p');
    if (!value) throw new Error(`${name} has no value yet`);
    return value;
  });

beforeEach(() => {
  sessionStore.setSession(testUser, 'token');
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStore.reset();
});

describe('QueuePage', () => {
  it('shows the queue depth by state', async () => {
    api();
    renderPage();

    expect(await valueOf('Waiting jobs')).toHaveTextContent('4');
    expect(await valueOf('Active jobs')).toHaveTextContent('2');
    expect(await valueOf('Completed jobs')).toHaveTextContent('120');
    expect(await valueOf('Delayed jobs')).toHaveTextContent('1');
    expect(await valueOf('Failed jobs')).toHaveTextContent('0');
    expect(await valueOf('Dead-letter queue')).toHaveTextContent('3');
    expect(await screen.findByTestId('activity-chart')).toHaveAttribute('data-points', '1');
  });

  it('shows how many workers share the queue and how full their job slots are', async () => {
    api();
    renderPage();

    expect(await screen.findByText('workers online')).toBeInTheDocument();
    expect(screen.getByText('2 of 10 job slots in use')).toBeInTheDocument();
    expect(screen.getByRole('progressbar', { name: 'Job slots in use' })).toHaveAttribute(
      'aria-valuenow',
      '2',
    );
    expect(screen.getByRole('progressbar', { name: 'Job slots in use' })).toHaveAttribute(
      'aria-valuemax',
      '10',
    );
    expect(
      screen.queryByText(/Jobs are waiting, but no workers are online/),
    ).not.toBeInTheDocument();
  });

  it('warns when work is waiting and nothing is processing it', async () => {
    api({ workers: noWorkers });
    renderPage();

    expect(
      await screen.findByText(/Jobs are waiting, but no workers are online/),
    ).toBeInTheDocument();
    expect(screen.getByText('No workers are online.')).toBeInTheDocument();
  });

  it('does not warn when the queue is empty even without workers', async () => {
    api({
      workers: noWorkers,
      queue: () => json(200, { counts: { ...counts, waiting: 0, delayed: 0 } }),
    });
    renderPage();

    await valueOf('Waiting jobs');
    await waitFor(() => expect(screen.getByText('No workers are online.')).toBeInTheDocument());
    expect(screen.queryByText(/Jobs are waiting/)).not.toBeInTheDocument();
  });

  it('loads the activity for the chosen range', async () => {
    const fetchMock = api();
    renderPage();
    await screen.findByTestId('activity-chart');

    await userEvent.click(screen.getByRole('button', { name: 'Last 7 days' }));

    await waitFor(() =>
      expect(
        fetchMock.mock.calls.some(
          ([url]) => String(url) === 'http://api.test/queue/activity?range=7d',
        ),
      ).toBe(true),
    );
  });

  it('says so when nothing was processed in the period', async () => {
    api({ activity: () => json(200, emptySeries) });
    renderPage();

    expect(await screen.findByText('No steps finished in this period')).toBeInTheDocument();
    expect(screen.queryByTestId('activity-chart')).not.toBeInTheDocument();
  });

  it('shows an error with a retry when the queue cannot be read', async () => {
    let calls = 0;
    api({
      queue: () =>
        ++calls === 1
          ? json(500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } })
          : json(200, { counts }),
    });
    renderPage();

    const alert = await screen.findByRole('alert');
    await userEvent.click(within(alert).getByRole('button', { name: 'Try again' }));
    expect(await valueOf('Waiting jobs')).toHaveTextContent('4');
  });
});

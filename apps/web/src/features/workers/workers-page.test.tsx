import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { json, mockFetch, testUser } from '@/test/fetch';
import { WorkersPage } from './workers-page';

const ago = (seconds: number) => new Date(Date.now() - seconds * 1000).toISOString();

function worker(overrides: Record<string, unknown>) {
  return {
    workerId: 'worker-host-1',
    hostname: 'host',
    pid: 11,
    status: 'online',
    concurrency: 5,
    processing: 0,
    completed: 0,
    failed: 0,
    startedAt: ago(3600),
    lastHeartbeat: ago(0),
    uptimeSeconds: 3600,
    ...overrides,
  };
}

const busy = worker({
  workerId: 'worker-host-1',
  status: 'busy',
  processing: 2,
  completed: 40,
  failed: 3,
  uptimeSeconds: 7500,
});
const idle = worker({
  workerId: 'worker-host-2',
  pid: 12,
  status: 'online',
  uptimeSeconds: 45,
  lastHeartbeat: ago(600),
});
const offline = worker({
  workerId: 'worker-host-3',
  pid: 13,
  status: 'offline',
  processing: 1,
  uptimeSeconds: 3600,
  lastHeartbeat: ago(1200),
});

const response = {
  summary: { online: 1, busy: 1, offline: 1 },
  workers: [busy, idle, offline],
};

function renderPage() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(
    <QueryClientProvider client={queryClient}>
      <MemoryRouter>
        <WorkersPage />
      </MemoryRouter>
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

describe('WorkersPage', () => {
  it('summarizes online, busy and offline workers and the job slots in use', async () => {
    mockFetch(() => json(200, response));
    renderPage();

    const online = await screen.findByRole('group', { name: 'Online workers' });
    expect(await within(online).findByText('2')).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Busy workers' })).getByText('1'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Offline workers' })).getByText('1'),
    ).toBeInTheDocument();
    expect(
      within(screen.getByRole('group', { name: 'Job slots' })).getByText('2 / 10'),
    ).toBeInTheDocument();
  });

  it('lists each worker with its status, processing, totals, uptime and last heartbeat', async () => {
    mockFetch(() => json(200, response));
    renderPage();

    const busyRow = within((await screen.findByText('worker-host-1')).closest('tr') as HTMLElement);
    expect(busyRow.getByText('Busy')).toBeInTheDocument();
    expect(busyRow.getByText('2 / 5')).toBeInTheDocument();
    expect(busyRow.getByText('40')).toBeInTheDocument();
    expect(busyRow.getByText('3')).toBeInTheDocument();
    expect(busyRow.getByText('2h 5m')).toBeInTheDocument();
    expect(busyRow.getByText('just now')).toBeInTheDocument();

    const idleRow = within(screen.getByText('worker-host-2').closest('tr') as HTMLElement);
    expect(idleRow.getByText('Online')).toBeInTheDocument();
    expect(idleRow.getByText('0 / 5')).toBeInTheDocument();
    expect(idleRow.getByText('10m ago')).toBeInTheDocument();
  });

  it('shows an offline worker without live load and with the uptime it had when it stopped', async () => {
    mockFetch(() => json(200, response));
    renderPage();

    const row = within((await screen.findByText('worker-host-3')).closest('tr') as HTMLElement);
    expect(row.getByText('Offline')).toBeInTheDocument();
    expect(row.getByText('-')).toBeInTheDocument();
    expect(row.getByText('1h 0m')).toHaveAttribute('title', 'How long it ran before it stopped');
    expect(row.getByText('20m ago')).toBeInTheDocument();
  });

  it('explains what to expect when no worker has connected', async () => {
    mockFetch(() => json(200, { summary: { online: 0, busy: 0, offline: 0 }, workers: [] }));
    renderPage();

    expect(await screen.findByText('No workers yet')).toBeInTheDocument();
    expect(screen.getByText(/new executions wait in the queue/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View the queue' })).toHaveAttribute('href', '/queue');
  });

  it('shows an error with a retry', async () => {
    let calls = 0;
    mockFetch(() =>
      ++calls === 1
        ? json(500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } })
        : json(200, response),
    );
    renderPage();

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('worker-host-1')).toBeInTheDocument();
  });
});

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { Toaster } from '@/components/ui/sonner';
import { json, mockFetch, testUser } from '@/test/fetch';
import { ApiKeysSection } from './api-keys-section';

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const FULL_KEY = 'cf_AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-AbCdE';

const activeKey = {
  id: '01a14cec-f85d-7079-b268-9c29038eb32d',
  name: 'CI pipeline',
  prefix: 'cf_AbCdEfG',
  createdAt: ago(120),
  lastUsedAt: ago(5),
  revokedAt: null,
};

const unusedKey = {
  ...activeKey,
  id: '01a14cec-f85d-7079-b268-9c29038eb33d',
  name: 'Spare',
  prefix: 'cf_ZzZzZzZ',
  lastUsedAt: null,
};

const revokedKey = {
  ...activeKey,
  id: '01a14cec-f85d-7079-b268-9c29038eb34d',
  name: 'Old script',
  prefix: 'cf_QqQqQqQ',
  revokedAt: ago(60),
};

interface State {
  keys: unknown[];
  failList?: boolean;
  createResponse?: () => Response;
}

function api(state: State) {
  return mockFetch((url, init) => {
    const method = init.method ?? 'GET';

    if (url.pathname === '/api-keys' && method === 'GET') {
      return state.failList
        ? json(500, {
            error: {
              code: 'INTERNAL_ERROR',
              message: 'Something went wrong',
            },
          })
        : json(200, { data: state.keys });
    }

    if (url.pathname === '/api-keys' && method === 'POST') {
      if (state.createResponse) return state.createResponse();

      const created = {
        ...activeKey,
        id: '01a14cec-f85d-7079-b268-9c29038eb35d',
        name: 'New key',
        prefix: FULL_KEY.slice(0, 10),
        lastUsedAt: null,
        key: FULL_KEY,
      };

      const { key: _key, ...listed } = created;
      state.keys = [listed, ...state.keys];

      return json(201, created);
    }

    if (url.pathname.startsWith('/api-keys/') && method === 'DELETE') {
      return json(204);
    }

    return json(404, {
      error: {
        code: 'NOT_FOUND',
        message: 'Not found',
      },
    });
  });
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  render(
    <QueryClientProvider client={queryClient}>
      <ApiKeysSection />
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

describe('listing keys', () => {
  it('shows only the prefix, when each key was created and last used, and its status', async () => {
    api({ keys: [activeKey, unusedKey, revokedKey] });
    renderSection();

    const active = within((await screen.findByText('CI pipeline')).closest('tr') as HTMLElement);

    expect(active.getByText('cf_AbCdEfG…')).toBeInTheDocument();
    expect(active.getByText('5m ago')).toBeInTheDocument();
    expect(active.getByText('Active')).toBeInTheDocument();

    expect(
      within(screen.getByText('Spare').closest('tr') as HTMLElement).getByText('Never'),
    ).toBeInTheDocument();

    const revoked = within(screen.getByText('Old script').closest('tr') as HTMLElement);

    expect(revoked.getByText('Revoked')).toBeInTheDocument();
    expect(revoked.queryByRole('button', { name: 'Revoke Old script' })).not.toBeInTheDocument();

    expect(screen.getByText('2 of 20 active keys')).toBeInTheDocument();
  });

  it('shows an empty state and an error with a retry', async () => {
    const state: State = { keys: [], failList: true };
    api(state);
    renderSection();

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    state.failList = false;

    await userEvent.click(await screen.findByRole('button', { name: 'Try again' }));

    expect(await screen.findByText('No API keys yet')).toBeInTheDocument();
  });
});

describe('creating a key', () => {
  it('asks for a name first', async () => {
    const fetchMock = api({ keys: [] });
    renderSection();

    await screen.findByText('No API keys yet');

    await userEvent.click(screen.getByRole('button', { name: 'Create key' }));

    expect(await screen.findByText('Enter a name for the key')).toBeInTheDocument();

    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('shows the full key once, can copy it, and never shows it again', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal('navigator', {
      ...navigator,
      clipboard: { writeText },
    });

    const fetchMock = api({ keys: [] });
    renderSection();

    await screen.findByText('No API keys yet');

    await userEvent.type(screen.getByLabelText('Name'), 'New key');
    await userEvent.click(screen.getByRole('button', { name: 'Create key' }));

    const dialog = await screen.findByRole('alertdialog');

    expect(within(dialog).getByLabelText('New API key')).toHaveValue(FULL_KEY);

    const post = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');

    expect(JSON.parse(String(post?.[1]?.body))).toEqual({ name: 'New key' });

    await userEvent.click(within(dialog).getByRole('button', { name: 'Copy key' }));

    expect(writeText).toHaveBeenCalledWith(FULL_KEY);

    expect(await within(dialog).findByRole('button', { name: 'Copied' })).toBeInTheDocument();

    await userEvent.keyboard('{Escape}');

    expect(screen.getByRole('alertdialog')).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Done' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    expect(await screen.findByText('New key', { selector: 'td' })).toBeInTheDocument();

    expect(screen.getByText('cf_AbCdEfG…')).toBeInTheDocument();
    expect(document.body).not.toHaveTextContent(FULL_KEY);
  });

  it('shows the server message when the key limit is reached', async () => {
    api({
      keys: [],
      createResponse: () =>
        json(409, {
          error: {
            code: 'API_KEY_LIMIT',
            message: 'You can have at most 20 active API keys',
          },
        }),
    });

    renderSection();

    await screen.findByText('No API keys yet');

    await userEvent.type(screen.getByLabelText('Name'), 'One too many');
    await userEvent.click(screen.getByRole('button', { name: 'Create key' }));

    expect(await screen.findByText('You can have at most 20 active API keys')).toBeInTheDocument();

    expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument();
  });
});

describe('revoking a key', () => {
  it('only revokes after confirmation', async () => {
    const fetchMock = api({ keys: [activeKey] });
    renderSection();

    const deletes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');

    await userEvent.click(await screen.findByRole('button', { name: 'Revoke CI pipeline' }));

    const dialog = await screen.findByRole('alertdialog');

    expect(within(dialog).getByText('Revoke "CI pipeline"?')).toBeInTheDocument();
    expect(within(dialog).getByText(/stops working immediately/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));

    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());

    expect(deletes()).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Revoke CI pipeline' }));

    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Revoke key',
      }),
    );

    await waitFor(() => expect(deletes()).toHaveLength(1));

    expect(String(deletes()[0]?.[0])).toContain(`/api-keys/${activeKey.id}`);

    expect(await screen.findByText('API key revoked')).toBeInTheDocument();
  });
});

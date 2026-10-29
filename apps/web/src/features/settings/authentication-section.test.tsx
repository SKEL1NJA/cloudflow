import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { Toaster } from '@/components/ui/sonner';
import { json, mockFetch, testUser } from '@/test/fetch';
import { AuthenticationSection } from './authentication-section';

const ago = (minutes: number) => new Date(Date.now() - minutes * 60_000).toISOString();
const CHROME =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const FIREFOX =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:121.0) Gecko/20100101 Firefox/121.0';
const OTHER_ID = '01a14cec-f85d-7079-b268-9c29038eb33d';

const sessions = {
  data: [
    {
      id: '01a14cec-f85d-7079-b268-9c29038eb32d',
      userAgent: CHROME,
      ipAddress: '10.0.0.1',
      signedInAt: ago(180),
      lastActiveAt: ago(1),
      expiresAt: ago(-10_000),
      current: true,
    },
    {
      id: OTHER_ID,
      userAgent: FIREFOX,
      ipAddress: '10.0.0.2',
      signedInAt: ago(2000),
      lastActiveAt: ago(90),
      expiresAt: ago(-10_000),
      current: false,
    },
  ],
};

interface Handlers {
  changePassword?: () => Response;
}

function api(handlers: Handlers = {}) {
  return mockFetch((url, init) => {
    const method = init.method ?? 'GET';
    if (url.pathname === '/auth/sessions' && method === 'GET') return json(200, sessions);
    if (url.pathname.startsWith('/auth/sessions/') && method === 'DELETE') return json(204);
    if (url.pathname === '/auth/logout-all') return json(204);
    if (url.pathname === '/auth/change-password') {
      return handlers.changePassword
        ? handlers.changePassword()
        : json(200, { revokedSessions: 2 });
    }
    return json(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
}

function renderSection() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  render(
    <QueryClientProvider client={queryClient}>
      <AuthenticationSection />
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

describe('active sessions', () => {
  it('lists devices, marks this one and offers to sign out only the others', async () => {
    api();
    renderSection();

    const current = within(
      (await screen.findByText('Chrome on Windows')).closest('li') as HTMLElement,
    );
    expect(current.getByText('This device')).toBeInTheDocument();
    expect(current.getByText(/10\.0\.0\.1/)).toBeInTheDocument();
    expect(current.queryByRole('button')).not.toBeInTheDocument();

    const other = within(screen.getByText('Firefox on macOS').closest('li') as HTMLElement);
    expect(other.getByText(/Active 1h ago/)).toBeInTheDocument();
    expect(other.getByRole('button', { name: 'Sign out Firefox on macOS' })).toBeInTheDocument();
  });

  it('signs out another device only after confirmation and explains the delay', async () => {
    const fetchMock = api();
    renderSection();
    const deletes = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'DELETE');

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out Firefox on macOS' }));
    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText(/up to 15 minutes/)).toBeInTheDocument();

    await userEvent.click(within(dialog).getByRole('button', { name: 'Cancel' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(deletes()).toHaveLength(0);

    await userEvent.click(screen.getByRole('button', { name: 'Sign out Firefox on macOS' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Sign out device',
      }),
    );

    await waitFor(() => expect(deletes()).toHaveLength(1));
    expect(String(deletes()[0]?.[0])).toContain(`/auth/sessions/${OTHER_ID}`);
    expect(await screen.findByText('Device signed out')).toBeInTheDocument();
  });

  it('signs out everywhere, including this device', async () => {
    const fetchMock = api();
    renderSection();

    await userEvent.click(await screen.findByRole('button', { name: 'Sign out everywhere' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Sign out everywhere',
      }),
    );

    await waitFor(() => expect(sessionStore.getState().status).toBe('anonymous'));
    const call = fetchMock.mock.calls.find(([url]) => String(url).endsWith('/auth/logout-all'));
    expect(call?.[1]?.method).toBe('POST');
    expect(call?.[1]?.credentials).toBe('include');
  });
});

describe('changing the password', () => {
  async function fill(current: string, next: string, confirm: string) {
    await userEvent.type(await screen.findByLabelText('Current password'), current);
    await userEvent.type(screen.getByLabelText('New password'), next);
    await userEvent.type(screen.getByLabelText('Confirm new password'), confirm);
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));
  }

  it('explains what is wrong before sending anything', async () => {
    const fetchMock = api();
    renderSection();

    await userEvent.click(await screen.findByRole('button', { name: 'Change password' }));
    expect(await screen.findByText('Enter your current password')).toBeInTheDocument();
    expect(screen.getByText('Use at least 8 characters')).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText('Current password'), 'correct-horse-battery');
    await userEvent.type(screen.getByLabelText('New password'), 'a-brand-new-password');
    await userEvent.type(screen.getByLabelText('Confirm new password'), 'something-else-entirely');
    await userEvent.click(screen.getByRole('button', { name: 'Change password' }));

    expect(await screen.findByText('Passwords do not match')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.filter(([url]) => String(url).endsWith('/auth/change-password')),
    ).toHaveLength(0);
  });

  it('rejects reusing the current password', async () => {
    api();
    renderSection();

    await fill('correct-horse-battery', 'correct-horse-battery', 'correct-horse-battery');
    expect(
      await screen.findByText('Choose a password different from the current one'),
    ).toBeInTheDocument();
  });

  it('sends only the two passwords, tells you how many devices were signed out, and clears the form', async () => {
    const fetchMock = api();
    renderSection();

    await fill('correct-horse-battery', 'a-brand-new-password', 'a-brand-new-password');

    expect(await screen.findByText('Password changed')).toBeInTheDocument();
    expect(screen.getByText('2 other sessions were signed out.')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([url]) =>
      String(url).endsWith('/auth/change-password'),
    );
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({
      currentPassword: 'correct-horse-battery',
      newPassword: 'a-brand-new-password',
    });
    await waitFor(() => expect(screen.getByLabelText('Current password')).toHaveValue(''));
    expect(screen.getByLabelText('New password')).toHaveValue('');
  });

  it('puts a wrong current password on its field and focuses it', async () => {
    api({
      changePassword: () =>
        json(400, {
          error: {
            code: 'INVALID_CURRENT_PASSWORD',
            message: 'Your current password is incorrect',
          },
        }),
    });
    renderSection();

    await fill('wrong-password-1', 'a-brand-new-password', 'a-brand-new-password');

    expect(await screen.findByText('Your current password is incorrect')).toBeInTheDocument();
    expect(screen.getByLabelText('Current password')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Current password')).toHaveFocus();
    expect(screen.getByLabelText('New password')).toHaveValue('a-brand-new-password');
  });

  it('shows a rate limit message above the form', async () => {
    api({
      changePassword: () =>
        json(429, {
          error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again later.' },
        }),
    });
    renderSection();

    await fill('correct-horse-battery', 'a-brand-new-password', 'a-brand-new-password');
    expect(await screen.findByText('Too many requests. Try again later.')).toBeInTheDocument();
  });
});

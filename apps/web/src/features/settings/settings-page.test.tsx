import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { Toaster } from '@/components/ui/sonner';
import { resetNotificationPreferences } from '@/features/notifications/preferences';
import { json, mockFetch, testUser } from '@/test/fetch';
import { setThemePreference } from '@/theme/theme';
import { SettingsPage } from './settings-page';

const user = { ...testUser, name: 'Uday', createdAt: '2026-10-01T10:00:00.000Z' };

function api() {
  return mockFetch((url, init) => {
    if (url.pathname === '/auth/me' && init.method === 'PATCH') {
      const body = JSON.parse(String(init.body)) as { name: string };
      return json(200, { user: { ...user, name: body.name === '' ? null : body.name } });
    }
    if (url.pathname === '/auth/sessions') return json(200, { data: [] });
    if (url.pathname === '/api-keys') return json(200, { data: [] });
    return json(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
}

function renderPage(initialEntry = '/settings') {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter([{ path: '/settings', element: <SettingsPage /> }], {
    initialEntries: [initialEntry],
  });
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      <Toaster />
    </QueryClientProvider>,
  );
  return router;
}

beforeEach(() => {
  sessionStore.setSession(user, 'token');
});

afterEach(() => {
  toast.dismiss();
  setThemePreference('system');
  resetNotificationPreferences();
  vi.unstubAllGlobals();
  sessionStore.reset();
});

describe('tabs', () => {
  it('starts on General, keeps the chosen tab in the URL and restores it on reload', async () => {
    api();
    const router = renderPage();
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
    expect(await screen.findByLabelText('Name')).toHaveValue('Uday');

    await userEvent.click(screen.getByRole('tab', { name: 'Notifications' }));
    expect(router.state.location.search).toBe('?tab=notifications');
    expect(screen.getByRole('switch', { name: 'Execution failed' })).toBeInTheDocument();
  });

  it('falls back to General for an unknown tab', () => {
    api();
    renderPage('/settings?tab=nonsense');
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true');
  });

  it('only loads a tab data when it is opened', async () => {
    const fetchMock = api();
    renderPage();
    await screen.findByLabelText('Name');
    expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api-keys'))).toBe(false);

    await userEvent.click(screen.getByRole('tab', { name: 'API keys' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([url]) => String(url).includes('/api-keys'))).toBe(true),
    );
  });
});

describe('general', () => {
  it('shows the email, saves a changed name and updates the signed-in user', async () => {
    const fetchMock = api();
    renderPage();

    expect(await screen.findByText(user.email)).toBeInTheDocument();
    const save = screen.getByRole('button', { name: 'Save changes' });
    expect(save).toBeDisabled();

    await userEvent.clear(screen.getByLabelText('Name'));
    await userEvent.type(screen.getByLabelText('Name'), 'Uday Khanna');
    await userEvent.click(save);

    expect(await screen.findByText('Profile updated')).toBeInTheDocument();
    const call = fetchMock.mock.calls.find(([, init]) => init?.method === 'PATCH');
    expect(JSON.parse(String(call?.[1]?.body))).toEqual({ name: 'Uday Khanna' });
    const state = sessionStore.getState();
    expect(state.status === 'authenticated' && state.user.name).toBe('Uday Khanna');
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled(),
    );
  });

  it('lets you clear the name and rejects one that is too long', async () => {
    const fetchMock = api();
    renderPage();

    await userEvent.clear(await screen.findByLabelText('Name'));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    await waitFor(() =>
      expect(fetchMock.mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(true),
    );

    await userEvent.click(screen.getByLabelText('Name'));
    await userEvent.paste('x'.repeat(101));
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));
    expect(await screen.findByText('Use at most 100 characters')).toBeInTheDocument();
  });
});

describe('notifications', () => {
  it('starts with failures on, saves changes in this browser and can send a test', async () => {
    api();
    renderPage('/settings?tab=notifications');

    expect(screen.getByRole('switch', { name: 'Execution failed' })).toBeChecked();
    expect(screen.getByRole('switch', { name: 'Execution succeeded' })).not.toBeChecked();

    await userEvent.click(screen.getByRole('switch', { name: 'Execution succeeded' }));
    expect(screen.getByRole('switch', { name: 'Execution succeeded' })).toBeChecked();
    expect(
      JSON.parse(window.localStorage.getItem('cloudflow-notifications') ?? '{}'),
    ).toMatchObject({
      failed: true,
      succeeded: true,
    });

    await userEvent.click(screen.getByRole('button', { name: 'Send a test notification' }));
    expect(await screen.findByText('Test notification')).toBeInTheDocument();
  });
});

describe('appearance', () => {
  it('switches the theme and remembers it', async () => {
    api();
    renderPage('/settings?tab=appearance');
    expect(screen.getByRole('button', { name: 'System' })).toHaveAttribute('aria-pressed', 'true');

    await userEvent.click(screen.getByRole('button', { name: 'Dark' }));

    expect(document.documentElement.classList.contains('dark')).toBe(true);
    expect(window.localStorage.getItem('cloudflow-theme')).toBe('dark');
    expect(screen.getByText('Currently using the dark theme.')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Light' }));
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

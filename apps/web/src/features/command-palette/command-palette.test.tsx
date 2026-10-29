import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider, useLocation } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { json, mockFetch, testUser } from '@/test/fetch';
import { setThemePreference } from '@/theme/theme';
import { CommandPaletteProvider } from './palette-context';

const WORKFLOW_ID = '01a14cec-f85d-7079-b268-9c29038eb32d';

function mockWorkflows(data: { id: string; name: string }[] = []) {
  return mockFetch((url) =>
    url.pathname === '/workflows'
      ? json(200, { data, pagination: { page: 1, pageSize: 5, total: data.length, totalPages: 1 } })
      : json(404, { error: { code: 'NOT_FOUND', message: 'Not found' } }),
  );
}

function Where() {
  const location = useLocation();
  return <p data-testid="where">{`${location.pathname}${location.search}`}</p>;
}

function renderApp() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter(
    [
      {
        path: '*',
        element: (
          <CommandPaletteProvider>
            <Where />
            <button type="button">Page button</button>
          </CommandPaletteProvider>
        ),
      },
    ],
    { initialEntries: ['/'] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

const palette = () => screen.getByRole('dialog', { name: 'Command palette' });
const input = () => screen.getByRole('combobox', { name: 'Search commands' });
const where = () => screen.getByTestId('where').textContent;

async function openWithKeyboard() {
  await userEvent.keyboard('{Control>}k{/Control}');
  await screen.findByRole('dialog', { name: 'Command palette' });
}

beforeEach(() => {
  sessionStore.setSession(testUser, 'token');
  mockWorkflows();
});

afterEach(() => {
  setThemePreference('system');
  vi.unstubAllGlobals();
  sessionStore.reset();
});

describe('opening and closing', () => {
  it('opens with Ctrl+K or Cmd+K, focuses the search box, and closes with Escape', async () => {
    renderApp();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await openWithKeyboard();
    expect(input()).toHaveFocus();

    await userEvent.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await userEvent.keyboard('{Meta>}k{/Meta}');
    expect(await screen.findByRole('dialog', { name: 'Command palette' })).toBeInTheDocument();
  });

  it('toggles with the same shortcut and starts empty every time', async () => {
    renderApp();
    await openWithKeyboard();
    await userEvent.type(input(), 'logs');

    await userEvent.keyboard('{Control>}k{/Control}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await openWithKeyboard();
    expect(input()).toHaveValue('');
  });

  it('lists every command in groups when nothing is typed', async () => {
    renderApp();
    await openWithKeyboard();

    expect(within(palette()).getAllByRole('option')).toHaveLength(10);
    expect(within(palette()).getByRole('group', { name: 'Go to' })).toBeInTheDocument();
    expect(within(palette()).getByRole('group', { name: 'Actions' })).toBeInTheDocument();
    expect(within(palette()).getAllByRole('option')[0]).toHaveAttribute('aria-selected', 'true');
  });
});

describe('running commands', () => {
  it('puts the best matching command first so Enter runs it, with the text search last', async () => {
    renderApp();
    await openWithKeyboard();

    await userEvent.type(input(), 'failed');
    const options = within(palette()).getAllByRole('option');
    expect(options.map((option) => option.textContent)).toEqual([
      'View failed executions',
      'Search workflows for "failed"',
    ]);
    expect(options[0]).toHaveAttribute('aria-selected', 'true');
    expect(input()).toHaveAttribute('aria-activedescendant', options[0]?.id);

    await userEvent.keyboard('{Enter}');
    expect(where()).toBe('/executions?status=FAILED');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('moves with the arrow keys and wraps around at both ends', async () => {
    renderApp();
    await openWithKeyboard();
    await userEvent.type(input(), 'view');

    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(screen.getByRole('option', { name: 'View workers' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(screen.getByRole('option', { name: 'Search workflows for "view"' })).toHaveAttribute(
      'aria-selected',
      'true',
    );

    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(where()).toBe('/executions');
  });

  it('runs a command when it is clicked', async () => {
    renderApp();
    await openWithKeyboard();

    await userEvent.click(screen.getByRole('option', { name: 'Create workflow' }));
    expect(where()).toBe('/workflows/new');
  });

  it('toggles the theme', async () => {
    renderApp();
    expect(document.documentElement.classList.contains('dark')).toBe(false);

    await openWithKeyboard();
    await userEvent.type(input(), 'toggle');
    await userEvent.keyboard('{Enter}');
    expect(document.documentElement.classList.contains('dark')).toBe(true);

    await openWithKeyboard();
    await userEvent.type(input(), 'toggle');
    await userEvent.keyboard('{Enter}');
    expect(document.documentElement.classList.contains('dark')).toBe(false);
  });
});

describe('workflow search', () => {
  it('offers matching workflows first and opens the chosen one', async () => {
    mockWorkflows([{ id: WORKFLOW_ID, name: 'Video Processing' }]);
    renderApp();
    await openWithKeyboard();
    await userEvent.type(input(), 'vid');

    const workflow = await screen.findByRole('option', { name: 'Video Processing' });
    const options = within(palette()).getAllByRole('option');
    expect(options[0]).toBe(workflow);
    expect(options.at(-1)).toHaveTextContent('Search workflows for "vid"');
    expect(workflow).toHaveAttribute('aria-selected', 'true');

    await userEvent.keyboard('{Enter}');
    expect(where()).toBe(`/workflows/${WORKFLOW_ID}`);
  });

  it('can search the workflows page for the typed text when nothing else matches', async () => {
    renderApp();
    await openWithKeyboard();
    await userEvent.type(input(), 'sync & more');

    expect(within(palette()).getAllByRole('option')).toHaveLength(1);
    await userEvent.keyboard('{Enter}');
    expect(where()).toBe('/workflows?q=sync%20%26%20more');
  });

  it('does not ask the server for one-letter searches', async () => {
    const fetchMock = mockWorkflows();
    renderApp();
    await openWithKeyboard();

    await userEvent.type(input(), 'v');
    await new Promise((resolve) => setTimeout(resolve, 400));
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

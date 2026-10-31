import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { InlineRouteError } from '@/pages/route-error';
import { appApi } from '@/test/app-api';
import { testUser } from '@/test/fetch';
import { AppShell } from './app-shell';

function Boom(): never {
  throw new Error('Kaboom');
}

beforeEach(() => {
  sessionStore.setSession(testUser, 'token');
  appApi();
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  sessionStore.reset();
});

describe('a page that crashes', () => {
  it('shows the error inside the shell so navigation keeps working', async () => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const router = createMemoryRouter(
      [
        {
          element: <AppShell />,
          children: [
            { errorElement: <InlineRouteError />, children: [{ path: '/', element: <Boom /> }] },
          ],
        },
      ],
      { initialEntries: ['/'] },
    );
    render(
      <QueryClientProvider client={queryClient}>
        <RouterProvider router={router} />
      </QueryClientProvider>,
    );

    const alert = await screen.findByRole('alert');
    expect(
      within(alert).getByRole('heading', { name: 'Something went wrong' }),
    ).toBeInTheDocument();
    expect(within(alert).getByRole('button', { name: 'Reload page' })).toBeInTheDocument();
    expect(within(alert).getByRole('link', { name: 'Back to overview' })).toHaveAttribute(
      'href',
      '/',
    );
    expect(screen.getByRole('main')).toContainElement(alert);
    expect(screen.getByRole('navigation', { name: 'Main' })).toBeInTheDocument();
  });
});

import { screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { appApi, EXECUTION_ID, WORKFLOW_ID } from '@/test/app-api';
import { expectNoViolations } from '@/test/axe';
import { testUser } from '@/test/fetch';
import { renderApp } from '@/test/render-app';

vi.mock('@/features/overview/execution-chart', () => ({
  ExecutionChart: () => <div data-testid="execution-chart" />,
}));
vi.mock('@/features/queue/activity-chart', () => ({
  ActivityChart: () => <div data-testid="activity-chart" />,
}));

vi.setConfig({ testTimeout: 30_000 });

interface PageCase {
  path: string;
  title: string;
  ready: string | RegExp;
}

const PAGES: PageCase[] = [
  { path: '/', title: 'Overview', ready: 'Operational · 4ms' },
  { path: '/workflows', title: 'Workflows', ready: 'Video Processing' },
  { path: '/workflows/new', title: 'Create workflow', ready: 'Create workflow' },
  { path: `/workflows/${WORKFLOW_ID}`, title: 'Workflow', ready: 'Fetch data' },
  {
    path: `/workflows/${WORKFLOW_ID}?tab=configuration`,
    title: 'Workflow',
    ready: /"authorization"/,
  },
  {
    path: `/workflows/${WORKFLOW_ID}/edit`,
    title: 'Edit workflow',
    ready: 'Edit Video Processing',
  },
  { path: '/executions', title: 'Executions', ready: 'Data Sync' },
  { path: `/executions/${EXECUTION_ID}`, title: 'Execution', ready: 'Execution started' },
  { path: '/workers', title: 'Workers', ready: 'worker-host-1' },
  { path: '/queue', title: 'Queue', ready: '120' },
  { path: '/logs', title: 'Logs', ready: /Retrying in 1\.5s/ },
  { path: '/settings', title: 'Settings', ready: 'Profile' },
  { path: '/settings?tab=authentication', title: 'Settings', ready: 'Chrome on Windows' },
  { path: '/settings?tab=api-keys', title: 'Settings', ready: 'CI pipeline' },
  { path: '/settings?tab=notifications', title: 'Settings', ready: 'In-app notifications' },
  { path: '/settings?tab=appearance', title: 'Settings', ready: 'Theme' },
  { path: '/does-not-exist', title: 'Not found', ready: 'There is nothing at this address' },
];

beforeEach(() => {
  sessionStore.setSession(testUser, 'token');
  appApi();
});

afterEach(() => {
  vi.unstubAllGlobals();
  sessionStore.reset();
});

describe('every page', () => {
  it.each(PAGES)(
    '$path has one heading, a named main landmark, a title and no axe violations',
    async (page) => {
      renderApp(page.path);

      await screen.findAllByText(page.ready);
      expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
      expect(screen.getByRole('main')).toHaveAccessibleName(page.title);
      await waitFor(() => expect(document.title).toBe(`${page.title} · CloudFlow`));
      await expectNoViolations();
    },
  );

  it.each(['/login', '/register'])('%s has no axe violations when signed out', async (path) => {
    sessionStore.signOut();
    renderApp(path);

    await screen.findByRole('heading', { level: 1 });
    expect(screen.getAllByRole('heading', { level: 1 })).toHaveLength(1);
    expect(screen.getByRole('main')).toBeInTheDocument();
    await expectNoViolations();
  });
});

describe('overlays', () => {
  it('the command palette has no violations while open', async () => {
    renderApp('/');
    await screen.findAllByText('Operational · 4ms');

    await userEvent.keyboard('{Control>}k{/Control}');
    await screen.findByRole('dialog', { name: 'Command palette' });
    await userEvent.type(screen.getByRole('combobox', { name: 'Search commands' }), 'fail');

    await expectNoViolations();
  });

  it('a row menu and a confirmation dialog have no violations while open', async () => {
    renderApp('/workflows');
    await userEvent.click(
      await screen.findByRole('button', { name: 'Actions for Video Processing' }),
    );
    await screen.findByRole('menu');
    await expectNoViolations();

    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete' }));
    await screen.findByRole('alertdialog');
    await expectNoViolations();
  });
});

describe('focus management', () => {
  it('moves focus to the named main landmark after a navigation', async () => {
    renderApp('/');
    await screen.findAllByText('Operational · 4ms');
    const main = screen.getByRole('main');
    expect(main).not.toHaveFocus();

    const nav = screen.getByRole('navigation', { name: 'Main' });
    await userEvent.click(within(nav).getByRole('link', { name: 'Workflows' }));

    await screen.findByRole('heading', { name: 'Workflows', level: 1 });
    await waitFor(() => expect(main).toHaveFocus());
    expect(main).toHaveAccessibleName('Workflows');
  });

  it('leaves focus alone when only the query string changes', async () => {
    renderApp('/executions');
    await screen.findAllByText('Data Sync');
    const main = screen.getByRole('main');

    await userEvent.selectOptions(screen.getByLabelText('Status'), 'FAILED');

    await waitFor(() => expect(screen.getByLabelText('Status')).toHaveValue('FAILED'));
    expect(main).not.toHaveFocus();
  });

  it('offers a skip link that targets the main landmark', async () => {
    renderApp('/');
    await screen.findAllByText('Operational · 4ms');

    const skip = screen.getByRole('link', { name: 'Skip to content' });
    expect(skip).toHaveAttribute('href', '#main');
    expect(screen.getByRole('main')).toHaveAttribute('id', 'main');
  });
});

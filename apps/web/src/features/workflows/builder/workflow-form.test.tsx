import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { sessionStore } from '@/auth/session';
import { json, mockFetch, testUser } from '@/test/fetch';
import { CreateWorkflowPage, EditWorkflowPage } from '../workflow-form-page';

const WORKFLOW_ID = '01a14cec-f85d-7079-b268-9c29038eb32d';
const now = new Date().toISOString();

const saved = {
  id: WORKFLOW_ID,
  name: 'Nightly sync',
  description: null,
  enabled: true,
  maxAttempts: 3,
  backoffBaseMs: 2000,
  stepCount: 1,
  lastRun: null,
  successRate: null,
  finishedRuns: 0,
  createdAt: now,
  updatedAt: now,
  steps: [],
};

const existing = {
  ...saved,
  name: 'Video Processing',
  description: 'Fetch and notify',
  maxAttempts: 4,
  backoffBaseMs: 3000,
  stepCount: 2,
  steps: [
    {
      id: 's1',
      position: 0,
      type: 'HTTP_REQUEST',
      name: 'Fetch data',
      config: {
        method: 'POST',
        url: 'https://example.com/api',
        headers: { authorization: 'Bearer secret-token' },
        body: { a: 1 },
        timeoutMs: 5000,
      },
    },
    { id: 's2', position: 1, type: 'DELAY', name: 'Cool down', config: { durationMs: 1500 } },
  ],
};

interface Handlers {
  save?: () => Response | Promise<Response>;
  load?: () => Response;
}

function api(handlers: Handlers = {}) {
  return mockFetch((url, init) => {
    const method = init.method ?? 'GET';
    if (url.pathname === '/workflows' && method === 'POST') {
      return handlers.save ? handlers.save() : json(201, saved);
    }
    if (url.pathname === `/workflows/${WORKFLOW_ID}` && method === 'PUT') {
      return handlers.save ? handlers.save() : json(200, saved);
    }
    if (url.pathname === `/workflows/${WORKFLOW_ID}` && method === 'GET') {
      return handlers.load ? handlers.load() : json(200, existing);
    }
    return json(404, { error: { code: 'NOT_FOUND', message: 'Not found' } });
  });
}

function submitted(fetchMock: ReturnType<typeof api>, method: string): unknown {
  const call = fetchMock.mock.calls.find(([, init]) => init?.method === method);
  return call ? JSON.parse(String(call[1]?.body)) : undefined;
}

function renderAt(path: string) {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  const router = createMemoryRouter(
    [
      { path: '/workflows', element: <p>Workflows list page</p> },
      { path: '/workflows/new', element: <CreateWorkflowPage /> },
      { path: '/workflows/:id', element: <p>Workflow details page</p> },
      { path: '/workflows/:id/edit', element: <EditWorkflowPage /> },
    ],
    { initialEntries: [path] },
  );
  render(
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
  return router;
}

const step = (position: number) => within(screen.getByRole('group', { name: `Step ${position}` }));
const create = () => screen.getByRole('button', { name: 'Create workflow' });

beforeEach(() => {
  sessionStore.setSession(testUser, 'token');
});

afterEach(() => {
  toast.dismiss();
  vi.unstubAllGlobals();
  sessionStore.reset();
});

describe('creating a workflow', () => {
  it('starts with one HTTP step and shows what is missing without calling the API', async () => {
    const fetchMock = api();
    renderAt('/workflows/new');

    expect(screen.getByRole('group', { name: 'Step 1' })).toBeInTheDocument();
    await userEvent.click(create());

    expect(await screen.findByText('Enter a name')).toBeInTheDocument();
    expect(step(1).getByText('Enter a valid http or https URL')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveFocus();
    expect(fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST')).toHaveLength(0);
  });

  it('builds a workflow from several step types and sends the validated definition', async () => {
    const fetchMock = api();
    const router = renderAt('/workflows/new');

    await userEvent.type(screen.getByLabelText('Name'), 'Nightly sync');
    await userEvent.type(step(1).getByLabelText('URL'), 'https://example.com/api');

    await userEvent.click(screen.getByRole('button', { name: 'Add Delay step' }));
    await userEvent.clear(step(2).getByLabelText('Duration (ms)'));
    await userEvent.type(step(2).getByLabelText('Duration (ms)'), '1500');

    await userEvent.click(screen.getByRole('button', { name: 'Add Notification step' }));
    await userEvent.type(step(3).getByLabelText('Message'), 'Done');

    await userEvent.click(create());

    await waitFor(() => expect(submitted(fetchMock, 'POST')).toBeDefined());
    expect(submitted(fetchMock, 'POST')).toEqual({
      name: 'Nightly sync',
      enabled: true,
      maxAttempts: 3,
      backoffBaseMs: 2000,
      steps: [
        {
          type: 'HTTP_REQUEST',
          name: 'Call API',
          config: { method: 'GET', url: 'https://example.com/api', headers: {}, timeoutMs: 10_000 },
        },
        { type: 'DELAY', name: 'Wait', config: { durationMs: 1500 } },
        { type: 'NOTIFICATION', name: 'Send notification', config: { message: 'Done' } },
      ],
    });
    expect(await screen.findByText('Workflow details page')).toBeInTheDocument();
    expect(router.state.location.pathname).toBe(`/workflows/${WORKFLOW_ID}`);
  });

  it('reorders steps and keeps each step with what was typed into it', async () => {
    const fetchMock = api();
    renderAt('/workflows/new');

    await userEvent.type(screen.getByLabelText('Name'), 'Ordered');
    await userEvent.type(step(1).getByLabelText('URL'), 'https://example.com/first');
    await userEvent.click(screen.getByRole('button', { name: 'Add Delay step' }));

    expect(screen.getByRole('button', { name: 'Move step 1 up' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Move step 2 down' })).toBeDisabled();

    await userEvent.click(screen.getByRole('button', { name: 'Move step 1 down' }));
    expect(step(2).getByLabelText('URL')).toHaveValue('https://example.com/first');

    await userEvent.click(create());
    await waitFor(() => expect(submitted(fetchMock, 'POST')).toBeDefined());
    const body = submitted(fetchMock, 'POST') as { steps: { type: string }[] };
    expect(body.steps.map((entry) => entry.type)).toEqual(['DELAY', 'HTTP_REQUEST']);
  });

  it('removes a step', async () => {
    const fetchMock = api();
    renderAt('/workflows/new');

    await userEvent.type(screen.getByLabelText('Name'), 'Short');
    await userEvent.click(screen.getByRole('button', { name: 'Add Delay step' }));
    await userEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
    expect(screen.queryByRole('group', { name: 'Step 2' })).not.toBeInTheDocument();

    await userEvent.click(create());
    await waitFor(() => expect(submitted(fetchMock, 'POST')).toBeDefined());
    const body = submitted(fetchMock, 'POST') as { steps: { type: string }[] };
    expect(body.steps.map((entry) => entry.type)).toEqual(['DELAY']);
  });

  it('requires at least one step', async () => {
    api();
    renderAt('/workflows/new');

    await userEvent.type(screen.getByLabelText('Name'), 'Empty');
    await userEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
    await userEvent.click(create());

    expect(await screen.findByText('Add at least one step')).toBeInTheDocument();
  });

  it('masks header values, lets you reveal them, skips blank rows and rejects duplicates', async () => {
    const fetchMock = api();
    renderAt('/workflows/new');

    await userEvent.type(screen.getByLabelText('Name'), 'With headers');
    await userEvent.type(step(1).getByLabelText('URL'), 'https://example.com');
    await userEvent.click(step(1).getByRole('button', { name: 'Add header' }));
    await userEvent.click(step(1).getByRole('button', { name: 'Add header' }));
    await userEvent.type(step(1).getByLabelText('Header 1 name'), 'Authorization');
    await userEvent.type(step(1).getByLabelText('Header 1 value'), 'Bearer abc');

    expect(step(1).getByLabelText('Header 1 value')).toHaveAttribute('type', 'password');
    await userEvent.click(step(1).getByRole('button', { name: 'Show header 1 value' }));
    expect(step(1).getByLabelText('Header 1 value')).toHaveAttribute('type', 'text');

    await userEvent.type(step(1).getByLabelText('Header 2 name'), 'authorization');
    await userEvent.click(create());
    expect(await screen.findByText('Header names must be unique')).toBeInTheDocument();
    expect(submitted(fetchMock, 'POST')).toBeUndefined();

    await userEvent.clear(step(1).getByLabelText('Header 2 name'));
    await userEvent.click(create());
    await waitFor(() => expect(submitted(fetchMock, 'POST')).toBeDefined());
    const body = submitted(fetchMock, 'POST') as { steps: { config: { headers: object } }[] };
    expect(body.steps[0]?.config.headers).toEqual({ Authorization: 'Bearer abc' });
  });

  it('shows the body field only for methods that send one, and validates it as JSON', async () => {
    const fetchMock = api();
    renderAt('/workflows/new');

    await userEvent.type(screen.getByLabelText('Name'), 'With body');
    await userEvent.type(step(1).getByLabelText('URL'), 'https://example.com');
    expect(step(1).queryByLabelText('Body (JSON)')).not.toBeInTheDocument();

    await userEvent.selectOptions(step(1).getByLabelText('Method'), 'POST');
    await userEvent.click(step(1).getByLabelText('Body (JSON)'));
    await userEvent.paste('{bad');
    await userEvent.click(create());
    expect(await screen.findByText('Enter valid JSON')).toBeInTheDocument();

    await userEvent.clear(step(1).getByLabelText('Body (JSON)'));
    await userEvent.click(step(1).getByLabelText('Body (JSON)'));
    await userEvent.paste('{"a": 1}');
    await userEvent.click(create());

    await waitFor(() => expect(submitted(fetchMock, 'POST')).toBeDefined());
    const body = submitted(fetchMock, 'POST') as { steps: { config: object }[] };
    expect(body.steps[0]?.config).toMatchObject({ method: 'POST', body: { a: 1 } });
  });

  it('validates transform mappings row by row', async () => {
    const fetchMock = api();
    renderAt('/workflows/new');

    await userEvent.type(screen.getByLabelText('Name'), 'Mapper');
    await userEvent.click(screen.getByRole('button', { name: 'Remove step 1' }));
    await userEvent.click(screen.getByRole('button', { name: 'Add Transform step' }));
    await userEvent.click(create());

    expect(await screen.findByText('Enter a field name')).toBeInTheDocument();
    expect(screen.getByText('Enter a source path')).toBeInTheDocument();

    await userEvent.type(step(1).getByLabelText('Mapping 1 target'), 'id');
    await userEvent.type(step(1).getByLabelText('Mapping 1 source'), 'body.id');
    await userEvent.click(create());

    await waitFor(() => expect(submitted(fetchMock, 'POST')).toBeDefined());
    const body = submitted(fetchMock, 'POST') as { steps: { config: object }[] };
    expect(body.steps[0]?.config).toEqual({ mappings: [{ target: 'id', source: 'body.id' }] });
  });
});

describe('server errors', () => {
  async function fillValid() {
    await userEvent.type(screen.getByLabelText('Name'), 'Nightly sync');
    await userEvent.type(step(1).getByLabelText('URL'), 'https://example.com/api');
  }

  it('puts a duplicate name on the name field and keeps the form', async () => {
    api({
      save: () =>
        json(409, {
          error: { code: 'CONFLICT', message: 'You already have a workflow with this name' },
        }),
    });
    const router = renderAt('/workflows/new');

    await fillValid();
    await userEvent.click(create());

    expect(
      await screen.findByText('You already have a workflow with this name'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveAttribute('aria-invalid', 'true');
    expect(screen.getByLabelText('Name')).toHaveValue('Nightly sync');
    expect(router.state.location.pathname).toBe('/workflows/new');
    expect(create()).toBeEnabled();
  });

  it('maps validation errors from the API onto the matching fields', async () => {
    api({
      save: () =>
        json(400, {
          error: {
            code: 'VALIDATION_ERROR',
            message: 'Invalid request',
            details: [
              {
                code: 'invalid_format',
                path: ['steps', 0, 'config', 'url'],
                message: 'The server rejected this address',
              },
            ],
          },
        }),
    });
    renderAt('/workflows/new');

    await fillValid();
    await userEvent.click(create());

    expect(await step(1).findByText('The server rejected this address')).toBeInTheDocument();
  });

  it('shows other failures in a banner without losing the form', async () => {
    api({
      save: () => json(500, { error: { code: 'INTERNAL_ERROR', message: 'Something went wrong' } }),
    });
    renderAt('/workflows/new');

    await fillValid();
    await userEvent.click(create());

    expect(await screen.findByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByLabelText('Name')).toHaveValue('Nightly sync');
  });
});

describe('unsaved changes', () => {
  it('leaves straight away when nothing was changed', async () => {
    api();
    renderAt('/workflows/new');

    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }));
    expect(await screen.findByText('Workflows list page')).toBeInTheDocument();
  });

  it('asks before discarding edits, and keeps them when you choose to keep editing', async () => {
    api();
    renderAt('/workflows/new');

    await userEvent.type(screen.getByLabelText('Name'), 'Draft');
    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }));

    const dialog = await screen.findByRole('alertdialog');
    expect(within(dialog).getByText('Discard unsaved changes?')).toBeInTheDocument();
    await userEvent.click(within(dialog).getByRole('button', { name: 'Keep editing' }));
    await waitFor(() => expect(screen.queryByRole('alertdialog')).not.toBeInTheDocument());
    expect(screen.getByLabelText('Name')).toHaveValue('Draft');

    await userEvent.click(screen.getByRole('link', { name: 'Cancel' }));
    await userEvent.click(
      within(await screen.findByRole('alertdialog')).getByRole('button', {
        name: 'Discard changes',
      }),
    );
    expect(await screen.findByText('Workflows list page')).toBeInTheDocument();
  });
});

describe('editing a workflow', () => {
  it('loads the saved values, keeps secrets masked and disables saving until something changes', async () => {
    api();
    renderAt(`/workflows/${WORKFLOW_ID}/edit`);

    expect(await screen.findByLabelText('Name')).toHaveValue('Video Processing');
    expect(screen.getByLabelText('Max attempts')).toHaveValue('4');
    expect(step(1).getByLabelText('URL')).toHaveValue('https://example.com/api');
    expect(step(1).getByLabelText('Header 1 value')).toHaveAttribute('type', 'password');
    expect(step(1).getByLabelText('Header 1 value')).toHaveValue('Bearer secret-token');
    expect(step(1).getByLabelText('Body (JSON)')).toHaveValue(JSON.stringify({ a: 1 }, null, 2));
    expect(step(2).getByLabelText('Duration (ms)')).toHaveValue('1500');
    expect(screen.getByRole('button', { name: 'Save changes' })).toBeDisabled();
  });

  it('saves the whole definition, secrets included, and returns to the details page', async () => {
    const fetchMock = api();
    renderAt(`/workflows/${WORKFLOW_ID}/edit`);

    await userEvent.type(await screen.findByLabelText('Name'), ' v2');
    await userEvent.click(screen.getByRole('button', { name: 'Save changes' }));

    await waitFor(() => expect(submitted(fetchMock, 'PUT')).toBeDefined());
    expect(submitted(fetchMock, 'PUT')).toEqual({
      name: 'Video Processing v2',
      description: 'Fetch and notify',
      enabled: true,
      maxAttempts: 4,
      backoffBaseMs: 3000,
      steps: [
        {
          type: 'HTTP_REQUEST',
          name: 'Fetch data',
          config: {
            method: 'POST',
            url: 'https://example.com/api',
            headers: { authorization: 'Bearer secret-token' },
            body: { a: 1 },
            timeoutMs: 5000,
          },
        },
        { type: 'DELAY', name: 'Cool down', config: { durationMs: 1500 } },
      ],
    });
    expect(await screen.findByText('Workflow details page')).toBeInTheDocument();
  });

  it('shows a not-found page for a workflow that does not exist', async () => {
    api({ load: () => json(404, { error: { code: 'NOT_FOUND', message: 'Workflow not found' } }) });
    renderAt(`/workflows/${WORKFLOW_ID}/edit`);

    expect(await screen.findByText("This workflow doesn't exist")).toBeInTheDocument();
  });
});

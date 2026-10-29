import { createBrowserRouter } from 'react-router';
import { RequireAnonymous, RequireAuth } from '@/auth/guards';
import { AppShell } from '@/components/layout/app-shell';
import { ExecutionDetailsPage } from '@/features/executions/execution-details-page';
import { ExecutionsPage } from '@/features/executions/executions-page';
import { LogsPage } from '@/features/logs/logs-page';
import { OverviewPage } from '@/features/overview/overview-page';
import { QueuePage } from '@/features/queue/queue-page';
import { WorkersPage } from '@/features/workers/workers-page';
import { WorkflowDetailsPage } from '@/features/workflows/workflow-details-page';
import { CreateWorkflowPage, EditWorkflowPage } from '@/features/workflows/workflow-form-page';
import { WorkflowsPage } from '@/features/workflows/workflows-page';
import { LoginPage } from '@/pages/login';
import { NotFoundPage } from '@/pages/not-found';
import { PlaceholderPage } from '@/pages/placeholder';
import { RegisterPage } from '@/pages/register';
import { RouteErrorPage } from '@/pages/route-error';

export const router = createBrowserRouter([
  {
    errorElement: <RouteErrorPage />,
    children: [
      {
        element: <RequireAnonymous />,
        children: [
          {
            path: '/login',
            element: <LoginPage />,
            handle: { title: 'Sign in' },
          },
          {
            path: '/register',
            element: <RegisterPage />,
            handle: { title: 'Create account' },
          },
        ],
      },
      {
        element: <RequireAuth />,
        children: [
          {
            element: <AppShell />,
            children: [
              {
                index: true,
                handle: { title: 'Overview' },
                element: <OverviewPage />,
              },
              {
                path: 'workflows',
                handle: { title: 'Workflows' },
                element: <WorkflowsPage />,
              },
              {
                path: 'workflows/new',
                handle: { title: 'Create workflow' },
                element: <CreateWorkflowPage />,
              },
              {
                path: 'workflows/:id/edit',
                handle: { title: 'Edit workflow' },
                element: <EditWorkflowPage />,
              },
              {
                path: 'workflows/:id',
                handle: { title: 'Workflow' },
                element: <WorkflowDetailsPage />,
              },
              {
                path: 'executions',
                handle: { title: 'Executions' },
                element: <ExecutionsPage />,
              },
              {
                path: 'executions/:id',
                handle: { title: 'Execution' },
                element: <ExecutionDetailsPage />,
              },
              { path: 'workers', handle: { title: 'Workers' }, element: <WorkersPage /> },
              { path: 'queue', handle: { title: 'Queue' }, element: <QueuePage /> },
              { path: 'logs', handle: { title: 'Logs' }, element: <LogsPage /> },
              {
                path: 'settings',
                handle: { title: 'Settings' },
                element: (
                  <PlaceholderPage
                    title="Settings"
                    description="Account, API keys and appearance."
                  />
                ),
              },
              {
                path: '*',
                handle: { title: 'Not found' },
                element: <NotFoundPage />,
              },
            ],
          },
        ],
      },
    ],
  },
]);

import { createBrowserRouter } from 'react-router';
import { RequireAnonymous, RequireAuth } from '@/auth/guards';
import { AppShell } from '@/components/layout/app-shell';
import { OverviewPage } from '@/features/overview/overview-page';
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
                element: (
                  <PlaceholderPage title="Executions" description="Every run, step by step." />
                ),
              },
              {
                path: 'executions/:id',
                handle: { title: 'Execution' },
                element: (
                  <PlaceholderPage
                    title="Execution"
                    description="Step-by-step details for one run."
                  />
                ),
              },
              {
                path: 'workers',
                handle: { title: 'Workers' },
                element: (
                  <PlaceholderPage
                    title="Workers"
                    description="Processes that execute your steps."
                  />
                ),
              },
              {
                path: 'queue',
                handle: { title: 'Queue' },
                element: (
                  <PlaceholderPage title="Queue" description="Work waiting to be processed." />
                ),
              },
              {
                path: 'logs',
                handle: { title: 'Logs' },
                element: (
                  <PlaceholderPage title="Logs" description="Search what your workflows did." />
                ),
              },
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

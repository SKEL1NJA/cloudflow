import type { RouteObject } from 'react-router';
import { RequireAnonymous, RequireAuth } from '@/auth/guards';
import { AppShell } from '@/components/layout/app-shell';
import { FullPageSkeleton } from '@/components/layout/full-page-skeleton';
import { NotFoundPage } from '@/pages/not-found';
import { InlineRouteError, RouteErrorPage } from '@/pages/route-error';

export const routes: RouteObject[] = [
  {
    errorElement: <RouteErrorPage />,
    HydrateFallback: FullPageSkeleton,
    children: [
      {
        element: <RequireAnonymous />,
        children: [
          {
            path: '/login',
            handle: { title: 'Sign in' },
            lazy: async () => ({ Component: (await import('@/pages/login')).LoginPage }),
          },
          {
            path: '/register',
            handle: { title: 'Create account' },
            lazy: async () => ({ Component: (await import('@/pages/register')).RegisterPage }),
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
                errorElement: <InlineRouteError />,
                children: [
                  {
                    index: true,
                    handle: { title: 'Overview' },
                    lazy: async () => ({
                      Component: (await import('@/features/overview/overview-page')).OverviewPage,
                    }),
                  },
                  {
                    path: 'workflows',
                    handle: { title: 'Workflows' },
                    lazy: async () => ({
                      Component: (await import('@/features/workflows/workflows-page'))
                        .WorkflowsPage,
                    }),
                  },
                  {
                    path: 'workflows/new',
                    handle: { title: 'Create workflow' },
                    lazy: async () => ({
                      Component: (await import('@/features/workflows/workflow-form-page'))
                        .CreateWorkflowPage,
                    }),
                  },
                  {
                    path: 'workflows/:id/edit',
                    handle: { title: 'Edit workflow' },
                    lazy: async () => ({
                      Component: (await import('@/features/workflows/workflow-form-page'))
                        .EditWorkflowPage,
                    }),
                  },
                  {
                    path: 'workflows/:id',
                    handle: { title: 'Workflow' },
                    lazy: async () => ({
                      Component: (await import('@/features/workflows/workflow-details-page'))
                        .WorkflowDetailsPage,
                    }),
                  },
                  {
                    path: 'executions',
                    handle: { title: 'Executions' },
                    lazy: async () => ({
                      Component: (await import('@/features/executions/executions-page'))
                        .ExecutionsPage,
                    }),
                  },
                  {
                    path: 'executions/:id',
                    handle: { title: 'Execution' },
                    lazy: async () => ({
                      Component: (await import('@/features/executions/execution-details-page'))
                        .ExecutionDetailsPage,
                    }),
                  },
                  {
                    path: 'workers',
                    handle: { title: 'Workers' },
                    lazy: async () => ({
                      Component: (await import('@/features/workers/workers-page')).WorkersPage,
                    }),
                  },
                  {
                    path: 'queue',
                    handle: { title: 'Queue' },
                    lazy: async () => ({
                      Component: (await import('@/features/queue/queue-page')).QueuePage,
                    }),
                  },
                  {
                    path: 'logs',
                    handle: { title: 'Logs' },
                    lazy: async () => ({
                      Component: (await import('@/features/logs/logs-page')).LogsPage,
                    }),
                  },
                  {
                    path: 'settings',
                    handle: { title: 'Settings' },
                    lazy: async () => ({
                      Component: (await import('@/features/settings/settings-page')).SettingsPage,
                    }),
                  },
                  { path: '*', handle: { title: 'Not found' }, element: <NotFoundPage /> },
                ],
              },
            ],
          },
        ],
      },
    ],
  },
];

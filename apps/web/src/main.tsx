import { QueryClientProvider } from '@tanstack/react-query';
import { StrictMode, Suspense, lazy } from 'react';
import { createRoot } from 'react-dom/client';
import { RouterProvider } from 'react-router/dom';
import { bootstrapSession } from '@/auth/bootstrap';
import { queryClient } from '@/lib/query-client';
import { router } from './router';
import './index.css';
import '@/theme/theme';

const Devtools = import.meta.env.DEV
  ? lazy(() =>
      import('@tanstack/react-query-devtools').then((module) => ({
        default: module.ReactQueryDevtools,
      })),
    )
  : null;

void bootstrapSession();

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

createRoot(container).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
      {Devtools ? (
        <Suspense fallback={null}>
          <Devtools buttonPosition="bottom-right" />
        </Suspense>
      ) : null}
    </QueryClientProvider>
  </StrictMode>,
);
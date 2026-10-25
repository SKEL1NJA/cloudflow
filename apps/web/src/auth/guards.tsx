import { Navigate, Outlet, useLocation } from 'react-router';
import { FullPageSkeleton } from '@/components/layout/full-page-skeleton';
import { safeRedirectPath } from '@/lib/safe-redirect';
import { useSession } from './use-session';

export function RequireAuth() {
  const session = useSession();
  const location = useLocation();

  if (session.status === 'loading') return <FullPageSkeleton />;
  if (session.status === 'anonymous') {
    return (
      <Navigate to="/login" replace state={{ from: `${location.pathname}${location.search}` }} />
    );
  }
  return <Outlet />;
}

export function RequireAnonymous() {
  const session = useSession();
  const location = useLocation();

  if (session.status === 'loading') return <FullPageSkeleton />;
  if (session.status === 'authenticated') {
    const from = (location.state as { from?: unknown } | null)?.from;
    return <Navigate to={safeRedirectPath(from)} replace />;
  }
  return <Outlet />;
}

import { isRouteErrorResponse, useRouteError } from 'react-router';
import { Button } from '@/components/ui/button';

export function RouteErrorPage() {
  const error = useRouteError();
  const detail = isRouteErrorResponse(error)
    ? `${error.status} ${error.statusText}`
    : error instanceof Error
      ? error.message
      : 'Unknown error';

  return (
    <div role="alert" className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center">
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <p className="max-w-md text-sm text-muted-foreground">
        {import.meta.env.DEV ? detail : 'We hit an unexpected problem. Reloading the page usually fixes it.'}
      </p>
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </div>
  );
}
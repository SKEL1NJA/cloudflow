import { isRouteErrorResponse, Link, useRouteError } from 'react-router';
import { Button, buttonVariants } from '@/components/ui/button';

function describe(error: unknown): string {
  if (isRouteErrorResponse(error)) return `${error.status} ${error.statusText}`;
  if (error instanceof Error) return error.message;
  return 'Unknown error';
}

function Details({ error }: { error: unknown }) {
  return (
    <p className="max-w-md text-sm text-muted-foreground">
      {import.meta.env.DEV
        ? describe(error)
        : 'We hit an unexpected problem. Reloading the page usually fixes it.'}
    </p>
  );
}

export function RouteErrorPage() {
  const error = useRouteError();

  return (
    <div
      role="alert"
      className="flex min-h-dvh flex-col items-center justify-center gap-3 px-4 text-center"
    >
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <Details error={error} />
      <Button onClick={() => window.location.reload()}>Reload</Button>
    </div>
  );
}

export function InlineRouteError() {
  const error = useRouteError();

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed px-6 py-16 text-center"
    >
      <h1 className="text-xl font-semibold tracking-tight">Something went wrong</h1>
      <Details error={error} />
      <div className="flex gap-2">
        <Button onClick={() => window.location.reload()}>Reload page</Button>
        <Link to="/" className={buttonVariants({ variant: 'outline' })}>
          Back to overview
        </Link>
      </div>
    </div>
  );
}

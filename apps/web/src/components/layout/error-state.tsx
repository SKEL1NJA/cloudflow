import { TriangleAlert } from 'lucide-react';
import { ApiError } from '@/api/errors';
import { Button } from '@/components/ui/button';

interface ErrorStateProps {
  what: string;
  error?: unknown;
  onRetry: () => void;
}

export function ErrorState({ what, error, onRetry }: ErrorStateProps) {
  const reference = error instanceof ApiError ? error.requestId : undefined;

  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center rounded-lg border border-dashed px-6 py-10 text-center"
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-md bg-danger/10 text-danger">
        <TriangleAlert className="size-5" aria-hidden="true" />
      </div>
      <h2 className="text-sm font-medium">Something went wrong</h2>
      <p className="mt-1 text-sm text-muted-foreground">{`We couldn't load ${what}.`}</p>
      {reference ? (
        <p className="mt-1 font-mono text-xs text-muted-foreground">Reference: {reference}</p>
      ) : null}
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        Try again
      </Button>
    </div>
  );
}

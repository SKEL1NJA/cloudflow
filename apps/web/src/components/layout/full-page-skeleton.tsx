import { Skeleton } from '@/components/ui/skeleton';

export function FullPageSkeleton() {
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status" aria-label="Loading">
      <div className="w-full max-w-sm space-y-3 px-4">
        <Skeleton className="mx-auto size-9" />
        <Skeleton className="mx-auto h-4 w-1/2" />
        <Skeleton className="h-32 w-full" />
      </div>
    </div>
  );
}

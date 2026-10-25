import { SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { Button } from '@/components/ui/button';

export function NotFoundPage() {
  return (
    <>
      <PageHeader title="Page not found" />
      <EmptyState
        icon={SearchX}
        title="There is nothing at this address"
        description="The page may have moved, or the link may be wrong."
        action={
          <Link
            to="/"
            className="inline-flex h-9 items-center rounded-md border px-4 text-sm font-medium transition-colors hover:bg-accent"
          >
            Back to overview
          </Link>
        }
      />
    </>
  );
}

import { SearchX } from 'lucide-react';
import { Link } from 'react-router';
import { EmptyState } from '@/components/layout/empty-state';
import { PageHeader } from '@/components/layout/page-header';
import { buttonVariants } from '@/components/ui/button';

export function WorkflowNotFound() {
  return (
    <>
      <PageHeader title="Workflow not found" />
      <EmptyState
        icon={SearchX}
        title="This workflow doesn't exist"
        description="It may have been deleted, or the link is wrong."
        action={
          <Link to="/workflows" className={buttonVariants({ variant: 'outline' })}>
            Back to workflows
          </Link>
        }
      />
    </>
  );
}

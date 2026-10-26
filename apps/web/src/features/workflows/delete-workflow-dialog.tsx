import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { useDeleteWorkflow } from './mutations';

interface DeleteWorkflowDialogProps {
  workflow: { id: string; name: string };
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onDeleted?: () => void;
}

export function DeleteWorkflowDialog({ workflow, open, onOpenChange, onDeleted }: DeleteWorkflowDialogProps) {
  const remove = useDeleteWorkflow();

  return (
    <ConfirmDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Delete "${workflow.name}"?`}
      description="This permanently deletes the workflow, its steps and its whole execution history. This can't be undone."
      confirmLabel="Delete workflow"
      pending={remove.isPending}
      onConfirm={() =>
        remove.mutate(workflow.id, {
          onSuccess: () => {
            onOpenChange(false);
            onDeleted?.();
          },
        })
      }
    />
  );
}
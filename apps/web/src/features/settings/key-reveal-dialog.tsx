import type { CreatedApiKey } from '@cloudflow/shared';
import { AlertDialog as AlertDialogPrimitive } from 'radix-ui';
import { useState } from 'react';
import { Button } from '@/components/ui/button';

function KeyBody({ created, onDone }: { created: CreatedApiKey; onDone: () => void }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(created.key);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <>
      <AlertDialogPrimitive.Title className="text-base font-semibold">
        Copy your new API key
      </AlertDialogPrimitive.Title>
      <AlertDialogPrimitive.Description className="mt-2 text-sm text-muted-foreground">
        This is the only time the full key is shown. Store it somewhere safe, such as a password
        manager. If you lose it, revoke it and create a new one.
      </AlertDialogPrimitive.Description>
      <input
        readOnly
        aria-label="New API key"
        value={created.key}
        onFocus={(event) => event.currentTarget.select()}
        className="mt-4 h-9 w-full rounded-md border bg-muted/30 px-3 font-mono text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => void copy()}>
          {copied ? 'Copied' : 'Copy key'}
        </Button>
        <Button onClick={onDone}>Done</Button>
      </div>
    </>
  );
}

export function KeyRevealDialog({
  created,
  onDone,
}: {
  created: CreatedApiKey | null;
  onDone: () => void;
}) {
  return (
    <AlertDialogPrimitive.Root open={created !== null}>
      <AlertDialogPrimitive.Portal>
        <AlertDialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
        <AlertDialogPrimitive.Content
          onEscapeKeyDown={(event) => event.preventDefault()}
          className="fixed top-1/2 left-1/2 z-50 w-[calc(100%-2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-lg border bg-popover p-6 text-popover-foreground shadow-lg outline-none data-[state=open]:animate-[fade-in_150ms_ease-out]"
        >
          {created ? <KeyBody created={created} onDone={onDone} /> : null}
        </AlertDialogPrimitive.Content>
      </AlertDialogPrimitive.Portal>
    </AlertDialogPrimitive.Root>
  );
}

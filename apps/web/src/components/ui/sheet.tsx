import { Dialog as DialogPrimitive } from 'radix-ui';
import type * as React from 'react';
import { cn } from '@/lib/utils';

export const Sheet = DialogPrimitive.Root;

interface SheetContentProps extends React.ComponentProps<typeof DialogPrimitive.Content> {
  title: string;
}

export function SheetContent({ className, children, title, ...props }: SheetContentProps) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-[fade-in_150ms_ease-out]" />
      <DialogPrimitive.Content
        aria-describedby={undefined}
        className={cn(
          'fixed inset-y-0 left-0 z-50 w-72 max-w-[85vw] border-r bg-sidebar shadow-lg outline-none data-[state=open]:animate-[slide-in-left_180ms_ease-out]',
          className,
        )}
        {...props}
      >
        <DialogPrimitive.Title className="sr-only">{title}</DialogPrimitive.Title>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

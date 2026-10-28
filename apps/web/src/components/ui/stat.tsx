import type { ReactNode } from 'react';

export function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="rounded-lg border bg-card p-4 shadow-xs">
      <dt className="text-sm text-muted-foreground">{label}</dt>
      <dd className="mt-1.5 text-sm">{children}</dd>
    </div>
  );
}

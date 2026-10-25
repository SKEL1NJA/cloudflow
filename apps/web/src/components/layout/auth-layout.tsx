import type { ReactNode } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { ThemeToggle } from '@/theme/theme-toggle';
import { LogoMark } from './logo-mark';

interface AuthLayoutProps {
  title: string;
  description: string;
  footer: ReactNode;
  children: ReactNode;
}

export function AuthLayout({ title, description, footer, children }: AuthLayoutProps) {
  useDocumentTitle(title);

  return (
    <div className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <main className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center gap-3 text-center">
          <LogoMark className="size-9" />
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>
        <Card>
          <CardContent>{children}</CardContent>
        </Card>
        <p className="mt-4 text-center text-sm text-muted-foreground">{footer}</p>
      </main>
    </div>
  );
}

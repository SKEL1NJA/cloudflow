import { Menu } from 'lucide-react';
import { useState } from 'react';
import { Outlet, useMatches } from 'react-router';
import { Button } from '@/components/ui/button';
import { Sheet, SheetContent } from '@/components/ui/sheet';
import { useDocumentTitle } from '@/hooks/use-document-title';
import { SidebarContent } from './sidebar';
import { SystemStatus } from './system-status';

function usePageTitle(): string | undefined {
  const matches = useMatches();
  for (let index = matches.length - 1; index >= 0; index -= 1) {
    const handle = matches[index]?.handle as { title?: string } | undefined;
    if (handle?.title) return handle.title;
  }
  return undefined;
}

export function AppShell() {
  const [navOpen, setNavOpen] = useState(false);
  const title = usePageTitle();
  useDocumentTitle(title);

  return (
    <div className="min-h-dvh lg:grid lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-md focus:bg-primary focus:px-3 focus:py-2 focus:text-sm focus:text-primary-foreground"
      >
        Skip to content
      </a>

      <aside className="sticky top-0 hidden h-dvh border-r bg-sidebar lg:block">
        <SidebarContent />
      </aside>

      <Sheet open={navOpen} onOpenChange={setNavOpen}>
        <SheetContent title="Navigation">
          <SidebarContent onNavigate={() => setNavOpen(false)} />
        </SheetContent>
      </Sheet>

      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-30 flex h-14 items-center gap-3 border-b bg-background px-4 lg:px-6">
          <Button
            variant="ghost"
            size="icon"
            className="lg:hidden"
            aria-label="Open navigation"
            onClick={() => setNavOpen(true)}
          >
            <Menu aria-hidden="true" />
          </Button>
          <p className="truncate text-sm text-muted-foreground">
            CloudFlow <span aria-hidden="true">/</span>{' '}
            <span className="font-medium text-foreground">{title ?? 'Page'}</span>
          </p>
          <SystemStatus className="ml-auto" />
        </header>
        <main id="main" tabIndex={-1} className="flex-1 px-4 py-6 outline-none lg:px-6">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
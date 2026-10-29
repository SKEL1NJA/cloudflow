import { Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useCommandPalette } from './palette-context';

export function shortcutLabel(): string {
  return /Mac|iPhone|iPad/i.test(navigator.userAgent) ? '⌘K' : 'Ctrl K';
}

export function PaletteButton() {
  const { open } = useCommandPalette();

  return (
    <>
      <button
        type="button"
        onClick={open}
        aria-label="Open command palette"
        className="hidden h-8 items-center gap-2 rounded-md border px-3 text-sm text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring md:flex"
      >
        <Search className="size-4" aria-hidden="true" />
        <span>Search</span>
        <kbd className="rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px]">
          {shortcutLabel()}
        </kbd>
      </button>
      <Button
        variant="ghost"
        size="icon"
        className="md:hidden"
        aria-label="Open command palette"
        onClick={open}
      >
        <Search aria-hidden="true" />
      </Button>
    </>
  );
}

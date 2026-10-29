import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { CommandPalette } from './command-palette';

interface PaletteApi {
  open: () => void;
}

const PaletteContext = createContext<PaletteApi | null>(null);

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      const modifier = event.ctrlKey || event.metaKey;
      if (modifier && !event.altKey && !event.shiftKey && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((current) => !current);
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  const api = useMemo<PaletteApi>(() => ({ open: () => setOpen(true) }), []);

  return (
    <PaletteContext.Provider value={api}>
      {children}
      <CommandPalette open={open} onOpenChange={setOpen} />
    </PaletteContext.Provider>
  );
}

export function useCommandPalette(): PaletteApi {
  const api = useContext(PaletteContext);
  if (!api) throw new Error('useCommandPalette must be used inside CommandPaletteProvider');
  return api;
}

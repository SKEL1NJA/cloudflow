import { Search } from 'lucide-react';
import { Dialog as DialogPrimitive } from 'radix-ui';
import { useEffect, useId, useMemo, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { cn } from '@/lib/utils';
import { setThemePreference, useResolvedTheme } from '@/theme/theme';
import {
  buildCommands,
  filterCommands,
  toSections,
  workflowCommands,
  type Command,
} from './commands';
import { useWorkflowResults } from './use-workflow-results';

function PaletteBody({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const listId = useId();
  const resolvedTheme = useResolvedTheme();
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const trimmed = query.trim();
  const results = useWorkflowResults(useDebouncedValue(trimmed, 250));

  const sections = useMemo(() => {
    const go = (to: string) => void navigate(to);
    const staticCommands = filterCommands(
      buildCommands({
        navigate: go,
        toggleTheme: () => setThemePreference(resolvedTheme === 'dark' ? 'light' : 'dark'),
      }),
      query,
    );
    return toSections([...workflowCommands(trimmed, results, go), ...staticCommands]);
  }, [query, trimmed, results, navigate, resolvedTheme]);

  const items = sections.flatMap((section) => section.items);
  const activeIndex = items.length === 0 ? -1 : Math.min(active, items.length - 1);
  const activeItem = items[activeIndex];
  const optionId = (command: Command) => `${listId}-${command.id}`;

  useEffect(() => {
    if (activeItem)
      document.getElementById(optionId(activeItem))?.scrollIntoView({ block: 'nearest' });
  }, [activeIndex]);

  function choose(command: Command) {
    onClose();
    command.run();
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    if (event.key === 'ArrowDown' && items.length > 0) {
      event.preventDefault();
      setActive((activeIndex + 1) % items.length);
    } else if (event.key === 'ArrowUp' && items.length > 0) {
      event.preventDefault();
      setActive((activeIndex - 1 + items.length) % items.length);
    } else if (event.key === 'Enter' && activeItem) {
      event.preventDefault();
      choose(activeItem);
    }
  }

  return (
    <>
      <div className="flex items-center gap-2 border-b px-3">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          role="combobox"
          aria-label="Search commands"
          aria-expanded="true"
          aria-autocomplete="list"
          aria-controls={listId}
          aria-activedescendant={activeItem ? optionId(activeItem) : undefined}
          autoComplete="off"
          spellCheck={false}
          placeholder="Type a command or search workflows"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={handleKeyDown}
          className="h-12 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
        />
      </div>
      <div id={listId} role="listbox" aria-label="Results" className="max-h-80 overflow-y-auto p-1">
        {sections.map((section, sectionIndex) => {
          const headingId = `${listId}-group-${sectionIndex}`;
          return (
            <div key={section.group} role="group" aria-labelledby={headingId}>
              <div
                id={headingId}
                role="presentation"
                className="px-2 py-1.5 text-xs font-medium text-muted-foreground"
              >
                {section.group}
              </div>
              {section.items.map((item) => {
                const index = items.indexOf(item);
                const Icon = item.icon;
                return (
                  <div
                    key={item.id}
                    id={optionId(item)}
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseMove={() => {
                      if (index !== activeIndex) setActive(index);
                    }}
                    onClick={() => choose(item)}
                    className={cn(
                      'flex cursor-pointer items-center gap-3 rounded-md px-2 py-2 text-sm',
                      index === activeIndex && 'bg-accent',
                    )}
                  >
                    <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <span className="truncate">{item.label}</span>
                  </div>
                );
              })}
            </div>
          );
        })}
      </div>
      <p className="border-t px-3 py-2 text-xs text-muted-foreground">
        Up and down to move, Enter to select, Esc to close
      </p>
    </>
  );
}

interface CommandPaletteProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CommandPalette({ open, onOpenChange }: CommandPaletteProps) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-black/50 data-[state=open]:animate-[fade-in_120ms_ease-out]" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed top-[15vh] left-1/2 z-50 w-[calc(100%-2rem)] max-w-xl -translate-x-1/2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg outline-none data-[state=open]:animate-[fade-in_120ms_ease-out]"
        >
          <DialogPrimitive.Title className="sr-only">Command palette</DialogPrimitive.Title>
          <PaletteBody onClose={() => onOpenChange(false)} />
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

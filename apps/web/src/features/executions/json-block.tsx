import { useMemo, useState } from 'react';

const PREVIEW_LIMIT = 4000;

function formatSize(characters: number): string {
  return characters < 1024 ? `${characters} B` : `${(characters / 1024).toFixed(1)} KB`;
}

export function JsonBlock({ label, value }: { label: string; value: unknown }) {
  const [expanded, setExpanded] = useState(false);
  const [copied, setCopied] = useState(false);
  const text = useMemo(
    () => (value === null || value === undefined ? null : JSON.stringify(value, null, 2)),
    [value],
  );

  const truncated = text !== null && text.length > PREVIEW_LIMIT && !expanded;
  const shown = text === null ? null : truncated ? `${text.slice(0, PREVIEW_LIMIT)}\n…` : text;

  async function copy() {
    if (text === null) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <h4 className="text-xs font-medium text-muted-foreground">{label}</h4>
        {text !== null ? (
          <button
            type="button"
            onClick={() => void copy()}
            className="rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
          >
            {copied ? 'Copied' : 'Copy'}
          </button>
        ) : null}
      </div>
      {shown === null ? (
        <p className="rounded-md border border-dashed px-3 py-2 text-xs text-muted-foreground">
          No data
        </p>
      ) : (
        <pre
          tabIndex={0}
          role="group"
          aria-label={label}
          className="max-h-72 overflow-auto rounded-md border bg-muted/30 p-3 font-mono text-xs leading-relaxed"
        >
          {shown}
        </pre>
      )}
      {truncated && text !== null ? (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="mt-1.5 rounded-sm text-xs text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring"
        >
          Show all ({formatSize(text.length)})
        </button>
      ) : null}
    </div>
  );
}

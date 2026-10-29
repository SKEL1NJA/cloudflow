import { Fragment } from 'react';

export interface TextPart {
  text: string;
  match: boolean;
}

export function splitMatches(text: string, term: string): TextPart[] {
  if (term === '') return [{ text, match: false }];

  const lowerText = text.toLowerCase();
  const lowerTerm = term.toLowerCase();
  const parts: TextPart[] = [];
  let cursor = 0;

  for (;;) {
    const index = lowerText.indexOf(lowerTerm, cursor);
    if (index === -1) break;
    if (index > cursor) parts.push({ text: text.slice(cursor, index), match: false });
    parts.push({ text: text.slice(index, index + term.length), match: true });
    cursor = index + term.length;
  }
  if (cursor < text.length) parts.push({ text: text.slice(cursor), match: false });
  return parts;
}

export function Highlight({ text, term }: { text: string; term: string }) {
  return (
    <>
      {splitMatches(text, term).map((part, index) =>
        part.match ? (
          <mark key={index} className="rounded-sm bg-warning/30 text-inherit">
            {part.text}
          </mark>
        ) : (
          <Fragment key={index}>{part.text}</Fragment>
        ),
      )}
    </>
  );
}

import { describe, expect, it } from 'vitest';
import { formatMeta } from './format-meta';
import { splitMatches } from './highlight';

describe('formatMeta', () => {
  it('prints structured data as key=value pairs', () => {
    expect(formatMeta({ attempt: 2, delayMs: 1537, ok: true, type: 'HTTP_REQUEST' })).toBe(
      'attempt=2 delayMs=1537 ok=true type=HTTP_REQUEST',
    );
  });

  it('quotes strings that would be ambiguous and keeps nested values compact', () => {
    expect(formatMeta({ reason: 'no workers online', tags: ['a', 'b'], empty: null })).toBe(
      'reason="no workers online" tags=["a","b"] empty=null',
    );
  });

  it('is empty without metadata and truncates very long values', () => {
    expect(formatMeta(null)).toBe('');
    expect(formatMeta({ blob: 'x'.repeat(1000) }).length).toBe(300);
  });
});

describe('splitMatches', () => {
  it('splits around every case-insensitive match and keeps the original casing', () => {
    expect(splitMatches('Retrying: retry limit', 'retry')).toEqual([
      { text: 'Retry', match: true },
      { text: 'ing: ', match: false },
      { text: 'retry', match: true },
      { text: ' limit', match: false },
    ]);
  });

  it('returns the text untouched without a term or without a match', () => {
    expect(splitMatches('hello', '')).toEqual([{ text: 'hello', match: false }]);
    expect(splitMatches('hello', 'zzz')).toEqual([{ text: 'hello', match: false }]);
  });

  it('treats special characters literally', () => {
    expect(splitMatches('a.b (c)', '.')).toEqual([
      { text: 'a', match: false },
      { text: '.', match: true },
      { text: 'b (c)', match: false },
    ]);
  });
});

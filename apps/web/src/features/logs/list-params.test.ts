import { describe, expect, it } from 'vitest';
import { applyLogPatch, hasLogFilters, parseLogFilters, toLogParams } from './list-params';

const EXECUTION = '01a14cec-f85d-7079-b268-9c29038eb40d';
const parse = (query: string) => parseLogFilters(new URLSearchParams(query));

describe('parseLogFilters', () => {
  it('follows new lines and has no filters by default', () => {
    expect(parse('')).toEqual({
      q: '',
      level: undefined,
      workflow: undefined,
      execution: undefined,
      when: undefined,
      live: true,
    });
  });

  it('reads valid values', () => {
    expect(parse(`q=retry&level=ERROR&execution=${EXECUTION}&when=1h&live=off`)).toMatchObject({
      q: 'retry',
      level: 'ERROR',
      execution: EXECUTION,
      when: '1h',
      live: false,
    });
  });

  it('ignores invalid values instead of failing', () => {
    expect(parse('level=LOUD&execution=nope&when=forever&live=maybe')).toMatchObject({
      level: undefined,
      execution: undefined,
      when: undefined,
      live: true,
    });
  });
});

describe('applyLogPatch', () => {
  it('keeps the URL clean and records only a disabled follow mode', () => {
    expect(applyLogPatch(new URLSearchParams('q=retry'), { q: '' }).toString()).toBe('');
    expect(applyLogPatch(new URLSearchParams(''), { live: false }).toString()).toBe('live=off');
    expect(applyLogPatch(new URLSearchParams('live=off'), { live: true }).toString()).toBe('');
  });

  it('adds and removes a single filter without touching the others', () => {
    const added = applyLogPatch(new URLSearchParams('level=WARN'), { execution: EXECUTION });
    expect(added.toString()).toBe(`level=WARN&execution=${EXECUTION}`);
    expect(applyLogPatch(added, { execution: undefined }).toString()).toBe('level=WARN');
  });
});

describe('toLogParams', () => {
  const now = Date.parse('2026-10-20T12:00:00.000Z');
  const base = {
    q: '',
    level: undefined,
    workflow: undefined,
    execution: undefined,
    when: undefined,
  };

  it('sends only what is set', () => {
    expect(toLogParams(base, now)).toEqual({ limit: 200 });
  });

  it('turns the preset into a from timestamp and passes the cursor on', () => {
    expect(toLogParams({ ...base, q: 'timeout', level: 'ERROR', when: '15m' }, now, '123')).toEqual(
      {
        limit: 200,
        search: 'timeout',
        level: 'ERROR',
        from: '2026-10-20T11:45:00.000Z',
        cursor: '123',
      },
    );
  });

  it('knows whether any filter is active', () => {
    expect(hasLogFilters(base)).toBe(false);
    expect(hasLogFilters({ ...base, q: 'x' })).toBe(true);
  });
});

import { describe, expect, it } from 'vitest';
import { applyFilterPatch, hasFilters, parseFilters, toApiParams } from './list-params';

const WORKFLOW = '01a14cec-f85d-7079-b268-9c29038eb32d';
const parse = (query: string) => parseFilters(new URLSearchParams(query));

describe('parseFilters', () => {
  it('has no filters by default', () => {
    expect(parse('')).toEqual({
      page: 1,
      status: undefined,
      workflow: undefined,
      when: undefined,
      duration: undefined,
    });
    expect(hasFilters(parse(''))).toBe(false);
  });

  it('reads valid values', () => {
    expect(parse(`status=FAILED&workflow=${WORKFLOW}&when=7d&duration=gt1m&page=3`)).toEqual({
      page: 3,
      status: 'FAILED',
      workflow: WORKFLOW,
      when: '7d',
      duration: 'gt1m',
    });
  });

  it('ignores invalid values instead of failing', () => {
    expect(parse('status=EXPLODED&workflow=nope&when=yesterday&duration=slow&page=-4')).toEqual({
      page: 1,
      status: undefined,
      workflow: undefined,
      when: undefined,
      duration: undefined,
    });
  });
});

describe('applyFilterPatch', () => {
  it('keeps the URL clean and resets the page when a filter changes', () => {
    const next = applyFilterPatch(new URLSearchParams('page=4&status=FAILED'), { when: '24h' });
    expect(next.toString()).toBe('status=FAILED&when=24h');
  });

  it('removes a filter when it is cleared', () => {
    const next = applyFilterPatch(new URLSearchParams('status=FAILED&when=24h'), {
      status: undefined,
    });
    expect(next.toString()).toBe('when=24h');
  });

  it('keeps the filters when only the page changes', () => {
    expect(applyFilterPatch(new URLSearchParams('status=FAILED'), { page: 2 }).toString()).toBe(
      'page=2&status=FAILED',
    );
  });
});

describe('toApiParams', () => {
  const now = Date.parse('2026-10-20T12:00:00.000Z');

  it('sends only what is set', () => {
    expect(toApiParams(parse(''), now)).toEqual({ page: 1, pageSize: 20 });
  });

  it('turns presets into absolute bounds relative to now', () => {
    expect(toApiParams(parse(`status=FAILED&workflow=${WORKFLOW}&when=24h`), now)).toEqual({
      page: 1,
      pageSize: 20,
      status: 'FAILED',
      workflowId: WORKFLOW,
      from: '2026-10-19T12:00:00.000Z',
    });
  });

  it.each([
    ['lt1s', { maxDurationMs: 999 }],
    ['1to10s', { minDurationMs: 1000, maxDurationMs: 9999 }],
    ['10to60s', { minDurationMs: 10_000, maxDurationMs: 59_999 }],
    ['gt1m', { minDurationMs: 60_000 }],
  ])('maps the %s duration preset to bounds', (duration, bounds) => {
    expect(toApiParams(parse(`duration=${duration}`), now)).toEqual({
      page: 1,
      pageSize: 20,
      ...bounds,
    });
  });
});

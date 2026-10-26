import { describe, expect, it } from 'vitest';
import { applyListPatch, parseListParams, toApiParams } from './list-params';

const params = (query: string) => parseListParams(new URLSearchParams(query));

describe('parseListParams', () => {
  it('uses defaults for an empty URL', () => {
    expect(params('')).toEqual({ page: 1, q: '', status: 'all', sort: 'updatedAt', order: 'desc' });
  });

  it('reads valid values', () => {
    expect(params('page=3&q=video&status=enabled&sort=name&order=asc')).toEqual({
      page: 3,
      q: 'video',
      status: 'enabled',
      sort: 'name',
      order: 'asc',
    });
  });

  it.each(['page=0', 'page=-2', 'page=abc', 'page=1.5'])('falls back to page 1 for %s', (query) => {
    expect(params(query).page).toBe(1);
  });

  it('ignores invalid enum values instead of failing', () => {
    expect(params('status=weird&sort=password&order=sideways')).toMatchObject({
      status: 'all',
      sort: 'updatedAt',
      order: 'desc',
    });
  });

  it('trims the search text', () => {
    expect(params('q=%20%20hello%20').q).toBe('hello');
  });
});

describe('applyListPatch', () => {
  it('keeps the URL clean by leaving defaults out', () => {
    expect(applyListPatch(new URLSearchParams('q=video'), { q: '' }).toString()).toBe('');
  });

  it('resets to the first page when a filter changes', () => {
    const next = applyListPatch(new URLSearchParams('page=4&q=video'), { status: 'disabled' });
    expect(next.get('page')).toBeNull();
    expect(next.get('status')).toBe('disabled');
    expect(next.get('q')).toBe('video');
  });

  it('keeps the page when only the page is patched', () => {
    expect(applyListPatch(new URLSearchParams('q=video'), { page: 3 }).toString()).toBe('page=3&q=video');
  });
});

describe('toApiParams', () => {
  it('sends only the filters that are set', () => {
    expect(toApiParams(params(''))).toEqual({ page: 1, pageSize: 20, sortBy: 'updatedAt', sortOrder: 'desc' });
    expect(toApiParams(params('q=video&status=disabled&page=2&sort=name&order=asc'))).toEqual({
      page: 2,
      pageSize: 20,
      sortBy: 'name',
      sortOrder: 'asc',
      search: 'video',
      enabled: false,
    });
  });
});
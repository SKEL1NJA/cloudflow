import { describe, expect, it } from 'vitest';
import { safeRedirectPath } from './safe-redirect';

describe('safeRedirectPath', () => {
  it('keeps same-site paths, including queries', () => {
    expect(safeRedirectPath('/workflows')).toBe('/workflows');
    expect(safeRedirectPath('/executions?status=FAILED')).toBe('/executions?status=FAILED');
  });

  it.each(['https://evil.example', '//evil.example', '/\\evil.example', 'javascript:alert(1)', '', 42, null, undefined])(
    'falls back for %s',
    (value) => {
      expect(safeRedirectPath(value)).toBe('/');
    },
  );
});
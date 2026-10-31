import { beforeEach, describe, expect, it, vi } from 'vitest';
import { installChunkReload, shouldReload } from './chunk-reload';

const fire = () => window.dispatchEvent(new Event('vite:preloadError', { cancelable: true }));

describe('shouldReload', () => {
  it('reloads the first time, and not again within ten seconds', () => {
    expect(shouldReload(null, 1_000_000)).toBe(true);
    expect(shouldReload(1_000_000, 1_005_000)).toBe(false);
    expect(shouldReload(1_000_000, 1_010_001)).toBe(true);
  });
});

describe('installChunkReload', () => {
  beforeEach(() => {
    window.sessionStorage.clear();
  });

  it('reloads once when a chunk fails to load and does not loop', () => {
    const reload = vi.fn();
    installChunkReload(reload);

    fire();
    fire();

    expect(reload).toHaveBeenCalledTimes(1);
  });

  it('prevents the default error so the failure is handled instead of thrown', () => {
    installChunkReload(vi.fn());
    const event = new Event('vite:preloadError', { cancelable: true });

    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
});

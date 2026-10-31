const STORAGE_KEY = 'cloudflow-chunk-reload';
const RELOAD_WINDOW_MS = 10_000;

export function shouldReload(lastReloadAt: number | null, now: number): boolean {
  return lastReloadAt === null || now - lastReloadAt > RELOAD_WINDOW_MS;
}

export function installChunkReload(reload: () => void = () => window.location.reload()): void {
  window.addEventListener('vite:preloadError', (event) => {
    event.preventDefault();
    try {
      const stored = window.sessionStorage.getItem(STORAGE_KEY);
      const last = stored === null ? null : Number(stored);
      if (shouldReload(last, Date.now())) {
        window.sessionStorage.setItem(STORAGE_KEY, String(Date.now()));
        reload();
      }
    } catch {
      return;
    }
  });
}

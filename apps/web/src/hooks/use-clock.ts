import { useSyncExternalStore } from 'react';

const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | undefined;
let lastTick = Date.now();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  timer ??= setInterval(() => {
    lastTick = Date.now();
    for (const notify of listeners) notify();
  }, 1000);

  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer);
      timer = undefined;
    }
  };
}

export function useClock(granularityMs: number): number {
  return useSyncExternalStore(
    subscribe,
    () => {
      if (timer === undefined) lastTick = Date.now();
      return Math.floor(lastTick / granularityMs);
    },
    () => 0,
  );
}

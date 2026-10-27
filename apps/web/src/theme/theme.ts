import { useSyncExternalStore } from 'react';

export type ThemePreference = 'light' | 'dark' | 'system';
export type ResolvedTheme = 'light' | 'dark';

const STORAGE_KEY = 'cloudflow-theme';
const listeners = new Set<() => void>();

function readStored(): ThemePreference {
  try {
    const value = window.localStorage.getItem(STORAGE_KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function systemPrefersDark(): boolean {
  return (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches
  );
}

let preference: ThemePreference = readStored();

function resolve(value: ThemePreference): ResolvedTheme {
  if (value === 'system') return systemPrefersDark() ? 'dark' : 'light';
  return value;
}

function apply(): void {
  const resolved = resolve(preference);
  document.documentElement.classList.toggle('dark', resolved === 'dark');
  document.documentElement.style.colorScheme = resolved;
}

function emit(): void {
  apply();
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function setThemePreference(next: ThemePreference): void {
  preference = next;

  try {
    if (next === 'system') window.localStorage.removeItem(STORAGE_KEY);
    else window.localStorage.setItem(STORAGE_KEY, next);
  } catch {}

  emit();
}

export function useThemePreference(): ThemePreference {
  return useSyncExternalStore(subscribe, () => preference);
}

export function useResolvedTheme(): ResolvedTheme {
  return useSyncExternalStore(subscribe, () => resolve(preference));
}

if (typeof window.matchMedia === 'function') {
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (preference === 'system') emit();
  });
}

apply();

import { useSyncExternalStore } from 'react';
import { z } from 'zod';

export interface NotificationPreferences {
  failed: boolean;
  succeeded: boolean;
  cancelled: boolean;
}

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  failed: true,
  succeeded: false,
  cancelled: false,
};

const STORAGE_KEY = 'cloudflow-notifications';
const storedSchema = z
  .object({ failed: z.boolean(), succeeded: z.boolean(), cancelled: z.boolean() })
  .partial();

function load(): NotificationPreferences {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw === null) return DEFAULT_PREFERENCES;
    const parsed = storedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? { ...DEFAULT_PREFERENCES, ...parsed.data } : DEFAULT_PREFERENCES;
  } catch {
    return DEFAULT_PREFERENCES;
  }
}

let current = load();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNotificationPreferences(): NotificationPreferences {
  return current;
}

export function setNotificationPreference(
  key: keyof NotificationPreferences,
  value: boolean,
): void {
  current = { ...current, [key]: value };
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(current));
  } catch {
    current = { ...current };
  }
  emit();
}

export function resetNotificationPreferences(): void {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    current = { ...current };
  }
  current = DEFAULT_PREFERENCES;
  emit();
}

export function useNotificationPreferences(): NotificationPreferences {
  return useSyncExternalStore(subscribe, getNotificationPreferences);
}

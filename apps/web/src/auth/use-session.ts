import { useSyncExternalStore } from 'react';
import { sessionStore, type SessionState } from './session';

export function useSession(): SessionState {
  return useSyncExternalStore(sessionStore.subscribe, sessionStore.getState);
}

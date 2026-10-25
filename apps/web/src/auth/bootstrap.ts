import { refreshAccessToken } from '@/api/refresh';
import { sessionStore } from './session';

let started: Promise<void> | null = null;

export function bootstrapSession(): Promise<void> {
  started ??= refreshAccessToken().then(
    () => undefined,
    () => {
      sessionStore.signOut();
    },
  );
  return started;
}

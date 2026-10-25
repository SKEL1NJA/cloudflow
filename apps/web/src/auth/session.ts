import type { AuthUser } from '@cloudflow/shared';

export type SessionState =
  | { status: 'loading' }
  | { status: 'anonymous'; expired: boolean }
  | { status: 'authenticated'; user: AuthUser; accessToken: string };

type Listener = () => void;

let state: SessionState = { status: 'loading' };
const listeners = new Set<Listener>();

function update(next: SessionState): void {
  state = next;
  for (const listener of listeners) listener();
}

export const sessionStore = {
  getState: (): SessionState => state,

  getAccessToken: (): string | null =>
    state.status === 'authenticated' ? state.accessToken : null,

  subscribe(listener: Listener): () => void {
    listeners.add(listener);
    return () => {
      listeners.delete(listener);
    };
  },

  setSession(user: AuthUser, accessToken: string): void {
    update({ status: 'authenticated', user, accessToken });
  },

  expire(): void {
    update({ status: 'anonymous', expired: state.status === 'authenticated' });
  },

  signOut(): void {
    update({ status: 'anonymous', expired: false });
  },

  reset(): void {
    update({ status: 'loading' });
  },
};

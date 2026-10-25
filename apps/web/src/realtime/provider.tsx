import {
  createContext,
  useContext,
  useEffect,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from 'react';
import { queryClient } from '@/lib/query-client';
import { createRealtimeClient, type RealtimeClient, type RealtimeStatus } from './client';
import { createInvalidator } from './invalidation';

const RealtimeContext = createContext<RealtimeClient | null>(null);

export function RealtimeProvider({ children }: { children: ReactNode }) {
  const [{ client, invalidator }] = useState(() => {
    const invalidator = createInvalidator(queryClient);
    const client = createRealtimeClient({
      onEvent: invalidator.handleEvent,
      onResync: invalidator.handleResync,
    });
    return { client, invalidator };
  });

  useEffect(() => {
    client.start();
    return () => {
      client.stop();
      invalidator.dispose();
    };
  }, [client, invalidator]);

  return <RealtimeContext.Provider value={client}>{children}</RealtimeContext.Provider>;
}

const subscribeNothing = () => () => undefined;
const stoppedSnapshot = (): RealtimeStatus => 'stopped';

export function useRealtimeStatus(): RealtimeStatus {
  const client = useContext(RealtimeContext);
  return useSyncExternalStore(
    client ? client.subscribe : subscribeNothing,
    client ? client.getStatus : stoppedSnapshot,
  );
}

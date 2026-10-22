import {
  createEventPublisher,
  readEventsAfter,
  startEventReader,
  type EventPublisher,
  type EventReader,
} from '@cloudflow/queue';
import type { FastifyInstance } from 'fastify';
import { env } from '../config/env.js';
import { EventHub } from '../modules/events/event-hub.js';

declare module 'fastify' {
  interface FastifyInstance {
    events: EventPublisher;
    eventHub: EventHub;
  }
}

export function registerRealtime(app: FastifyInstance): void {
  const events = createEventPublisher(app.redis, (err) =>
    app.log.warn({ err }, 'could not publish event'),
  );
  const hub = new EventHub({
    readAfter: (afterId, count) => readEventsAfter(app.redis, afterId, count),
    onError: (err, message) => app.log.warn({ err }, message),
  });
  hub.start();

  app.decorate('events', events);
  app.decorate('eventHub', hub);

  let reader: EventReader | undefined;

  app.addHook('onReady', async () => {
    reader = await startEventReader({
      redisUrl: env.REDIS_URL,
      onEntry: (entry) => hub.dispatch(entry),
      onError: (err) => app.log.warn({ err }, 'event stream error'),
    });
  });

  app.addHook('preClose', async () => {
    hub.closeAll();
  });

  app.addHook('onClose', async () => {
    hub.stop();
    await reader?.stop();
  });
}
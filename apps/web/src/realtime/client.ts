import {
  realtimeEventSchema,
  type EventTicketResponse,
  type RealtimeEvent,
} from '@cloudflow/shared';
import { request } from '@/api/client';
import { env } from '@/lib/env';

export type RealtimeStatus = 'stopped' | 'connecting' | 'live' | 'reconnecting';

export interface EventSourceLike {
  addEventListener(type: string, listener: (event: Event) => void): void;
  close(): void;
}

export interface RealtimeClientOptions {
  onEvent: (event: RealtimeEvent) => void;
  onResync: () => void;
  getTicket?: (signal: AbortSignal) => Promise<EventTicketResponse>;
  createSource?: (url: string) => EventSourceLike;
  random?: () => number;
}

export interface RealtimeClient {
  start(): void;
  stop(): void;
  getStatus(): RealtimeStatus;
  subscribe(listener: () => void): () => void;
}

const BASE_BACKOFF_MS = 1000;
const MAX_BACKOFF_MS = 30_000;
const WATCHDOG_INTERVAL_MS = 10_000;
const SILENCE_LIMIT_MS = 70_000;
const EVENT_TYPES = ['execution.updated', 'step.updated'] as const;

export function reconnectDelayMs(attempt: number, random: () => number = Math.random): number {
  const exponential = Math.min(MAX_BACKOFF_MS, BASE_BACKOFF_MS * 2 ** attempt);
  return Math.round(exponential * (0.5 + random() * 0.5));
}

function defaultGetTicket(signal: AbortSignal): Promise<EventTicketResponse> {
  return request<EventTicketResponse>('/events/ticket', { method: 'POST', signal });
}

function defaultCreateSource(url: string): EventSourceLike {
  return new EventSource(url);
}

function buildUrl(ticket: string, lastEventId: string | null): string {
  const url = new URL(`${env.apiUrl}/events`);
  url.searchParams.set('ticket', ticket);
  if (lastEventId) url.searchParams.set('lastEventId', lastEventId);
  return url.toString();
}

function parseEvent(data: string): RealtimeEvent | null {
  try {
    const result = realtimeEventSchema.safeParse(JSON.parse(data));
    return result.success ? result.data : null;
  } catch {
    return null;
  }
}

export function createRealtimeClient(options: RealtimeClientOptions): RealtimeClient {
  const getTicket = options.getTicket ?? defaultGetTicket;
  const createSource = options.createSource ?? defaultCreateSource;
  const random = options.random ?? Math.random;

  let status: RealtimeStatus = 'stopped';
  let generation = 0;
  let attempt = 0;
  let lastEventId: string | null = null;
  let lastActivity = 0;
  let source: EventSourceLike | null = null;
  let ticketRequest: AbortController | null = null;
  let retryTimer: ReturnType<typeof setTimeout> | undefined;
  let watchdog: ReturnType<typeof setInterval> | undefined;
  const listeners = new Set<() => void>();

  function setStatus(next: RealtimeStatus): void {
    if (status === next) return;
    status = next;
    for (const listener of listeners) listener();
  }

  function teardown(): void {
    ticketRequest?.abort();
    ticketRequest = null;
    source?.close();
    source = null;
    clearTimeout(retryTimer);
    retryTimer = undefined;
    clearInterval(watchdog);
    watchdog = undefined;
  }

  function scheduleReconnect(from: number): void {
    if (from !== generation) return;
    teardown();
    setStatus('reconnecting');
    const delay = reconnectDelayMs(attempt, random);
    attempt += 1;
    retryTimer = setTimeout(() => void connect(), delay);
  }

  async function connect(): Promise<void> {
    const current = ++generation;
    teardown();
    setStatus(attempt === 0 ? 'connecting' : 'reconnecting');

    const controller = new AbortController();
    ticketRequest = controller;
    let response: EventTicketResponse;
    try {
      response = await getTicket(controller.signal);
    } catch {
      scheduleReconnect(current);
      return;
    }
    if (current !== generation) return;
    ticketRequest = null;

    const needsSync = lastEventId === null;
    const stream = createSource(buildUrl(response.ticket, lastEventId));
    source = stream;
    lastActivity = Date.now();

    stream.addEventListener('open', () => {
      if (current !== generation) return;
      attempt = 0;
      lastActivity = Date.now();
      setStatus('live');
      if (needsSync) options.onResync();
    });

    for (const type of EVENT_TYPES) {
      stream.addEventListener(type, (event) => {
        if (current !== generation) return;
        lastActivity = Date.now();
        const message = event as MessageEvent<string>;
        if (message.lastEventId) lastEventId = message.lastEventId;
        const parsed = parseEvent(message.data);
        if (parsed) options.onEvent(parsed);
      });
    }

    stream.addEventListener('resync', () => {
      if (current !== generation) return;
      lastActivity = Date.now();
      options.onResync();
    });

    stream.addEventListener('heartbeat', () => {
      if (current === generation) lastActivity = Date.now();
    });

    stream.addEventListener('shutdown', () => scheduleReconnect(current));
    stream.addEventListener('error', () => scheduleReconnect(current));

    watchdog = setInterval(() => {
      if (current === generation && Date.now() - lastActivity > SILENCE_LIMIT_MS) {
        scheduleReconnect(current);
      }
    }, WATCHDOG_INTERVAL_MS);
  }

  function handleOnline(): void {
    if (status !== 'reconnecting') return;
    attempt = 0;
    void connect();
  }

  return {
    start() {
      if (status !== 'stopped') return;
      attempt = 0;
      window.addEventListener('online', handleOnline);
      void connect();
    },

    stop() {
      if (status === 'stopped') return;
      generation += 1;
      teardown();
      lastEventId = null;
      window.removeEventListener('online', handleOnline);
      setStatus('stopped');
    },

    getStatus: () => status,

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

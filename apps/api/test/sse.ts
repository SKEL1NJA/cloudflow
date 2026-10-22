export interface SseFrame {
  id?: string;
  event?: string;
  data?: string;
}

export interface SseStream {
  status: number;
  errorBody: string;
  next: (timeoutMs?: number) => Promise<SseFrame>;
  untilClosed: (timeoutMs?: number) => Promise<void>;
  close: () => Promise<void>;
}

const timeoutAfter = (ms: number) =>
  new Promise<'timeout'>((resolve) => setTimeout(() => resolve('timeout'), ms));

function parseFrame(raw: string): SseFrame | null {
  const frame: SseFrame = {};
  for (const line of raw.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const index = line.indexOf(':');
    const field = index === -1 ? line : line.slice(0, index);
    const value = index === -1 ? '' : line.slice(index + 1).replace(/^ /, '');
    if (field === 'id') frame.id = value;
    else if (field === 'event') frame.event = value;
    else if (field === 'data') frame.data = frame.data === undefined ? value : `${frame.data}\n${value}`;
  }
  return frame.event === undefined && frame.data === undefined ? null : frame;
}

export async function openStream(
  url: string,
  headers: Record<string, string> = {},
): Promise<SseStream> {
  const controller = new AbortController();
  const response = await fetch(url, { headers, signal: controller.signal });

  if (!response.ok || !response.body) {
    const errorBody = await response.text();
    return {
      status: response.status,
      errorBody,
      next: async () => {
        throw new Error('this response is not a stream');
      },
      untilClosed: async () => undefined,
      close: async () => undefined,
    };
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const frames: SseFrame[] = [];
  let buffer = '';
  let inflight: ReturnType<typeof reader.read> | undefined;

  async function readChunk(ms: number): Promise<string | null | 'timeout'> {
    inflight ??= reader.read();
    const result = await Promise.race([inflight, timeoutAfter(ms)]);
    if (result === 'timeout') return 'timeout';
    inflight = undefined;
    return result.done ? null : decoder.decode(result.value, { stream: true });
  }

  async function next(timeoutMs = 3000): Promise<SseFrame> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const frame = frames.shift();
      if (frame) return frame;
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('Timed out waiting for an event');
      const chunk = await readChunk(remaining);
      if (chunk === 'timeout') throw new Error('Timed out waiting for an event');
      if (chunk === null) throw new Error('The stream ended');
      buffer += chunk;
      const parts = buffer.split('\n\n');
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const parsed = parseFrame(part);
        if (parsed) frames.push(parsed);
      }
    }
  }

  async function untilClosed(timeoutMs = 3000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const remaining = deadline - Date.now();
      if (remaining <= 0) throw new Error('The stream did not close in time');
      try {
        const chunk = await readChunk(remaining);
        if (chunk === null) return;
        if (chunk === 'timeout') throw new Error('The stream did not close in time');
      } catch (err) {
        if (err instanceof Error && err.message === 'The stream did not close in time') throw err;
        return;
      }
    }
  }

  async function close(): Promise<void> {
    controller.abort();
    await reader.cancel().catch(() => undefined);
    await inflight?.catch(() => undefined);
  }

  return { status: response.status, errorBody: '', next, untilClosed, close };
}
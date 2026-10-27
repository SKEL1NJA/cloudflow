import { RESERVED_HEADERS, type HttpRequestConfig, type JsonValue } from '@cloudflow/shared';
import http from 'node:http';
import https from 'node:https';
import { isIP } from 'node:net';
import { BlockedAddressError, isBlockedAddress, safeLookup } from './ssrf.js';
import { StepError, type StepContext } from './types.js';

const MAX_RESPONSE_BYTES = 1024 * 1024;
const RETRYABLE_STATUSES = new Set([408, 425, 429]);

interface RawResponse {
  status: number;
  contentType: string;
  body: string;
}

interface OutgoingRequest {
  method: string;
  headers: Record<string, string>;
  payload: string | undefined;
  signal: AbortSignal;
  allowPrivateNetwork: boolean;
}

function send(url: URL, request: OutgoingRequest): Promise<RawResponse> {
  return new Promise((resolve, reject) => {
    let failure: StepError | undefined;
    const transport = url.protocol === 'https:' ? https : http;

    const req = transport.request(
      url,
      {
        method: request.method,
        headers: request.headers,
        signal: request.signal,
        agent: false,
        ...(request.allowPrivateNetwork ? {} : { lookup: safeLookup }),
      },
      (res) => {
        const chunks: Buffer[] = [];
        let size = 0;

        res.on('data', (chunk: Buffer) => {
          size += chunk.length;

          if (size > MAX_RESPONSE_BYTES) {
            failure = new StepError(`Response is larger than ${MAX_RESPONSE_BYTES} bytes`, false);
            req.destroy();
            return;
          }

          chunks.push(chunk);
        });

        res.on('end', () => {
          resolve({
            status: res.statusCode ?? 0,
            contentType: String(res.headers['content-type'] ?? ''),
            body: Buffer.concat(chunks).toString('utf8'),
          });
        });

        res.on('error', (err) => reject(failure ?? err));

        res.on('close', () => {
          if (failure) reject(failure);
          else if (!res.complete) {
            reject(new Error('Connection closed before the response completed'));
          }
        });
      },
    );

    req.on('error', (err) => reject(failure ?? err));

    if (request.payload !== undefined) req.write(request.payload);
    req.end();
  });
}

function buildHeaders(config: HttpRequestConfig, ctx: StepContext, payload: string | undefined) {
  const headers: Record<string, string> = {
    'user-agent': 'CloudFlow/0.1',
    accept: 'application/json, text/plain, */*',
    'idempotency-key': ctx.stepExecutionId,
  };

  for (const [name, value] of Object.entries(config.headers)) {
    const lower = name.toLowerCase();

    if (RESERVED_HEADERS.has(lower)) {
      throw new StepError(`Header "${name}" cannot be set on an HTTP step`, false);
    }

    headers[lower] = value;
  }

  if (payload !== undefined) {
    headers['content-type'] ??= 'application/json';
    headers['content-length'] = String(Buffer.byteLength(payload));
  }

  return headers;
}

function toStepError(err: unknown, signal: AbortSignal, timeoutMs: number): StepError {
  if (err instanceof StepError) return err;
  if (signal.aborted) {
    return new StepError(`Request timed out after ${timeoutMs}ms`, true);
  }

  const code =
    typeof err === 'object' && err !== null && 'code' in err ? String(err.code) : undefined;

  const message = err instanceof Error ? err.message : String(err);

  if (code?.startsWith('ERR_INVALID')) {
    return new StepError(`Invalid request: ${message}`, false);
  }

  return new StepError(`Request failed: ${code ? `${code} ` : ''}${message}`, true);
}

function parseBody(raw: RawResponse): JsonValue {
  if (raw.body === '') return null;

  if (raw.contentType.includes('json')) {
    try {
      return JSON.parse(raw.body) as JsonValue;
    } catch {
      return raw.body;
    }
  }

  return raw.body;
}

export async function runHttpRequest(
  config: HttpRequestConfig,
  ctx: StepContext,
): Promise<JsonValue> {
  const url = new URL(config.url);

  const host = url.hostname.replace(/^\[|\]$/g, '');

  if (!ctx.allowPrivateNetwork && isIP(host) !== 0 && isBlockedAddress(host)) {
    throw new BlockedAddressError(host);
  }

  const payload = config.body === undefined ? undefined : JSON.stringify(config.body);
  const headers = buildHeaders(config, ctx, payload);
  const signal = AbortSignal.timeout(config.timeoutMs);

  await ctx.log('INFO', `${config.method} ${url.origin}${url.pathname}`);

  const started = Date.now();
  let raw: RawResponse;

  try {
    raw = await send(url, {
      method: config.method,
      headers,
      payload,
      signal,
      allowPrivateNetwork: ctx.allowPrivateNetwork,
    });
  } catch (err) {
    throw toStepError(err, signal, config.timeoutMs);
  }

  await ctx.log('INFO', `Response ${raw.status} in ${Date.now() - started}ms`);

  if (raw.status >= 200 && raw.status < 300) {
    return { status: raw.status, body: parseBody(raw) };
  }

  if (raw.status >= 300 && raw.status < 400) {
    throw new StepError(`HTTP ${raw.status}: redirects are not followed`, false);
  }

  const snippet = raw.body.slice(0, 200).trim();
  const retryable = raw.status >= 500 || RETRYABLE_STATUSES.has(raw.status);

  throw new StepError(`HTTP ${raw.status}${snippet ? `: ${snippet}` : ''}`, retryable);
}

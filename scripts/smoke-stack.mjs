const apiUrl = process.env.API_URL ?? 'http://127.0.0.1:3000';
const webUrl = process.env.WEB_URL ?? 'http://127.0.0.1:5173';
const email = process.env.SMOKE_EMAIL ?? 'smoke@example.com';
const password = process.env.SMOKE_PASSWORD ?? 'smoke-test-password-1';

let failures = 0;

function check(name, ok, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures += 1;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitUntilUp(url, label) {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      await sleep(1000);
      continue;
    }
    await sleep(1000);
  }
  throw new Error(`${label} did not become ready at ${url}`);
}

async function call(path, { method = 'GET', body, token, headers = {} } = {}) {
  const response = await fetch(`${apiUrl}${path}`, {
    method,
    headers: {
      'content-type': 'application/json',
      origin: webUrl,
      ...(token && { authorization: `Bearer ${token}` }),
      ...headers,
    },
    ...(body !== undefined && { body: JSON.stringify(body) }),
  });
  const text = await response.text();
  return { status: response.status, body: text ? JSON.parse(text) : null };
}

async function signIn() {
  const login = await call('/auth/login', { method: 'POST', body: { email, password } });
  if (login.status === 200) return login.body.accessToken;
  const registered = await call('/auth/register', { method: 'POST', body: { email, password } });
  check('registers the smoke user', registered.status === 201, `status ${registered.status}`);
  return registered.body?.accessToken;
}

async function main() {
  await waitUntilUp(`${apiUrl}/health/ready`, 'API');
  await waitUntilUp(`${webUrl}/healthz`, 'web server');

  const page = await fetch(`${webUrl}/workflows`);
  const policy = page.headers.get('content-security-policy') ?? '';
  check(
    'serves the app for client-side routes',
    page.status === 200 && (page.headers.get('content-type') ?? '').includes('text/html'),
  );
  check(
    'sends a content security policy',
    policy.includes("script-src 'self'") && policy.includes("frame-ancestors 'none'"),
  );
  check('sends nosniff', page.headers.get('x-content-type-options') === 'nosniff');
  check(
    'returns 404 for a missing asset',
    (await fetch(`${webUrl}/assets/missing.js`)).status === 404,
  );

  const token = await signIn();
  check('signs in', typeof token === 'string');
  if (!token) return;

  const created = await call('/workflows', {
    method: 'POST',
    token,
    body: {
      name: `smoke-${Date.now()}`,
      steps: [
        { type: 'DELAY', name: 'Wait', config: { durationMs: 200 } },
        { type: 'NOTIFICATION', name: 'Tell', config: { message: 'smoke test' } },
      ],
    },
  });
  check('creates a workflow', created.status === 201, `status ${created.status}`);
  if (created.status !== 201) return;
  const workflowId = created.body.id;

  const run = await call(`/workflows/${workflowId}/run`, {
    method: 'POST',
    token,
    body: {},
    headers: { 'idempotency-key': crypto.randomUUID() },
  });
  check('starts a run', run.status >= 200 && run.status < 300, `status ${run.status}`);
  const executionId = run.body?.id;

  let status = 'QUEUED';
  for (let attempt = 0; executionId && attempt < 120; attempt += 1) {
    status = (await call(`/executions/${executionId}`, { token })).body?.status;
    if (['SUCCESS', 'FAILED', 'CANCELLED'].includes(status)) break;
    await sleep(500);
  }
  check('a worker finishes the run', status === 'SUCCESS', `status ${status}`);

  const workers = await call('/workers', { token });
  const online = (workers.body?.summary?.online ?? 0) + (workers.body?.summary?.busy ?? 0);
  check('at least one worker is online', online >= 1, `${online} online`);

  const removed = await call(`/workflows/${workflowId}`, { method: 'DELETE', token });
  check('cleans up', removed.status === 204, `status ${removed.status}`);
}

try {
  await main();
} catch (error) {
  check('completes without errors', false, error instanceof Error ? error.message : String(error));
}

console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
process.exit(failures === 0 ? 0 : 1);

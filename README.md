# CloudFlow

A distributed workflow orchestration platform. Users define workflows as ordered steps (HTTP request, delay, transform, notification), run them, and watch them execute across a pool of workers with retries, live status and logs.

[CI badge goes here once a run on main is green]

## What it demonstrates

- At-least-once job processing with idempotent steps, exponential backoff with jitter, a dead-letter queue, and a reconciler that recovers lost work
- A real-time dashboard over server-sent events backed by Redis Streams, with replay after reconnect
- Security by design: Argon2id, rotating refresh tokens with reuse detection, SSRF-safe HTTP executor, strict CSP, rate limiting, least-privilege containers
- A typed monorepo with one validation schema shared by the API and the form builder
- Tested at every level: 165 API, 96 worker and 457 web tests, axe accessibility checks on every route, a computed contrast test, a bundle size budget
- Production images, a full-stack compose file with a smoke test, and a GitHub Actions pipeline

## Architecture

(diagram: browser, nginx, API, Redis, Postgres, workers; see docs/architecture.md)

## Run it

Development: `npm install`, `npm run infra:up`, then `npm run dev:api`, `npm run dev:worker`, `npm run dev:web` and open http://127.0.0.1:5173.

Full stack in containers: `npm run stack:up`, then `npm run smoke:stack`.

## Tests

`npm test` runs every workspace. `npm run typecheck`, `npm run format:check` and `npm run report -w apps/web` are the other gates.

## Documents

Security notes, accessibility method, deployment notes, CI, and the AWS design are in `docs/`.

## Known limits

Single region design, plain text header secrets, no email or webhook notifications, last write wins when two people edit one workflow. Each is discussed in the docs with the intended fix.

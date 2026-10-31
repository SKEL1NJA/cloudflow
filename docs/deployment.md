# Deployment notes

## Images

One Dockerfile builds four targets: `api`, `worker`, `migrate` and `web`.

- The API and worker are esbuild bundles of the app and the workspace packages. Third-party packages stay external and are installed with `npm ci --omit=dev` for only the workspaces each app needs. Runtime images are `node:24-slim`, run as the `node` user, and start Node directly so it receives SIGTERM.
- `migrate` runs `prisma migrate deploy` once and exits. Apps never migrate on startup, so replicas cannot race and app containers need no migration tooling.
- `web` is `nginx-unprivileged` serving the Vite build, with a Content-Security-Policy, nosniff, a referrer policy and a permissions policy. The API origin in `connect-src` is set at container start from `API_ORIGIN`.

## Running the full stack locally

`npm run stack:up` builds and starts everything. `npm run smoke:stack` verifies it end to end. `docker compose -f docker-compose.stack.yml up -d --scale worker=3` runs three workers against the same queue.

## Security decisions

- Postgres and Redis are on an internal network with no published ports and no internet access.
- API and worker containers drop all capabilities, forbid privilege escalation, use a read-only root filesystem and have memory limits.
- The SSRF guard still applies inside the stack: private and container-network addresses are not reachable from HTTP steps.
- `style-src` allows inline styles because the toast library injects a style element at runtime. Scripts are never inline.

## Known limits

- Secrets arrive through `env_file` and are visible with `docker inspect`. A real deployment injects them from a secrets manager.
- `VITE_API_URL` is fixed at build time, so each environment needs its own web image build.
- No TLS or HSTS here. Both belong to the load balancer in front of the stack.
- Compose targets a single host. Multi-host orchestration is covered in the cloud design document.

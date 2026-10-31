# syntax=docker/dockerfile:1.7

FROM node:24-slim AS manifests
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY apps/worker/package.json apps/worker/
COPY packages/db/package.json packages/db/
COPY packages/queue/package.json packages/queue/
COPY packages/shared/package.json packages/shared/

FROM manifests AS full-deps
RUN --mount=type=cache,target=/root/.npm npm ci --ignore-scripts

FROM full-deps AS build
COPY . .
WORKDIR /app/packages/db
RUN DATABASE_URL=postgresql://build:build@localhost:5432/build npx prisma generate
WORKDIR /app

FROM build AS bundles
RUN node scripts/bundle.mjs api && node scripts/bundle.mjs worker

FROM manifests AS api-deps
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts -w apps/api -w packages/db -w packages/queue -w packages/shared

FROM manifests AS worker-deps
RUN --mount=type=cache,target=/root/.npm \
    npm ci --omit=dev --ignore-scripts -w apps/worker -w packages/db -w packages/queue -w packages/shared

FROM node:24-slim AS api
ENV NODE_ENV=production
WORKDIR /app
COPY --from=api-deps /app/node_modules ./node_modules
COPY --from=bundles /app/apps/api/dist ./apps/api/dist
USER node
EXPOSE 3000
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:3000/health',{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1),()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "apps/api/dist/index.mjs"]

FROM node:24-slim AS worker
ENV NODE_ENV=production
WORKDIR /app
COPY --from=worker-deps /app/node_modules ./node_modules
COPY --from=bundles /app/apps/worker/dist ./apps/worker/dist
USER node
HEALTHCHECK --interval=15s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "require('node:net').connect(Number(process.env.WORKER_METRICS_PORT||9101),'127.0.0.1').on('connect',()=>process.exit(0)).on('error',()=>process.exit(1))"
CMD ["node", "--enable-source-maps", "apps/worker/dist/index.mjs"]

FROM build AS migrate
ENV NODE_ENV=production PRISMA_HIDE_UPDATE_MESSAGE=1 CHECKPOINT_DISABLE=1
WORKDIR /app/packages/db
USER node
CMD ["npx", "prisma", "migrate", "deploy"]

FROM build AS web-build
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
RUN npm run build -w apps/web && npm run report -w apps/web

FROM nginxinc/nginx-unprivileged:stable-alpine AS web
ENV API_ORIGIN=http://127.0.0.1:3000
COPY docker/nginx/default.conf.template /etc/nginx/templates/default.conf.template
COPY --from=web-build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 8080
HEALTHCHECK --interval=15s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:8080/healthz
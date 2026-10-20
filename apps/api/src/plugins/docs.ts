import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import type { FastifyInstance } from 'fastify';
import { buildOpenApiDocument } from '../openapi/spec.js';

export function registerDocs(app: FastifyInstance): void {
  void app.register(swagger, {
    mode: 'static',
    specification: { document: buildOpenApiDocument() as never },
  });
  void app.register(swaggerUi, { routePrefix: '/docs' });
}
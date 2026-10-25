import type { FastifyError, FastifyInstance } from 'fastify';
import { ZodError } from 'zod';
import { AppError } from '../lib/errors.js';

export interface ApiErrorBody {
  error: {
    code: string;
    message: string;
    details?: unknown;
  };
}

export function registerErrorHandler(app: FastifyInstance): void {
  app.setNotFoundHandler((request, reply) => {
    const body: ApiErrorBody = {
      error: {
        code: 'NOT_FOUND',
        message: `Route ${request.method} ${request.url} not found`,
      },
    };
    return reply.status(404).send(body);
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    if (error instanceof AppError) {
      const body: ApiErrorBody = {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details !== undefined && {
            details: error.details,
          }),
        },
      };

      if (error.headers) reply.headers(error.headers);

      return reply.status(error.statusCode).send(body);
    }

    if (error instanceof ZodError) {
      const body: ApiErrorBody = {
        error: {
          code: 'VALIDATION_ERROR',
          message: 'Invalid request',
          details: error.issues,
        },
      };
      return reply.status(400).send(body);
    }

    const statusCode = error.statusCode && error.statusCode >= 400 ? error.statusCode : 500;

    if (statusCode >= 500) {
      request.log.error({ err: error }, 'unhandled error');

      const body: ApiErrorBody = {
        error: {
          code: 'INTERNAL_ERROR',
          message: 'Something went wrong',
        },
      };
      return reply.status(500).send(body);
    }

    const body: ApiErrorBody = {
      error: {
        code: error.code ?? 'REQUEST_ERROR',
        message: error.message,
      },
    };
    return reply.status(statusCode).send(body);
  });
}

import cookie from '@fastify/cookie';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import sensible from '@fastify/sensible';
import Fastify from 'fastify';
import { ZodError } from 'zod';
import { corsOrigins, env, isProd } from './env.js';
import { HttpError } from './lib/errors.js';
import authPlugin from './plugins/auth.js';
import prismaPlugin from './plugins/prisma.js';
import authRoutes from './routes/auth.js';
import breedingRoutes from './routes/breeding.js';
import dashboardRoutes from './routes/dashboard.js';
import litterRoutes from './routes/litters.js';
import studRoutes from './routes/studs.js';
import dogRoutes from './routes/dogs.js';
import kennelRoutes from './routes/kennels.js';
import pedigreeRoutes from './routes/pedigree.js';
import verificationRoutes from './routes/verification.js';

export async function buildServer() {
  const app = Fastify({
    logger: isProd
      ? { level: env.LOG_LEVEL }
      : { level: env.LOG_LEVEL, transport: { target: 'pino-pretty', options: { translateTime: 'HH:MM:ss', ignore: 'pid,hostname' } } },
    trustProxy: true,
    bodyLimit: 8 * 1024 * 1024,
  });

  await app.register(sensible);
  await app.register(cors, { origin: corsOrigins, credentials: true });
  await app.register(cookie, { secret: env.AUTH_SECRET });
  await app.register(rateLimit, { global: false, max: 300, timeWindow: '1 minute' });
  await app.register(multipart, { limits: { fileSize: 25 * 1024 * 1024 } });

  await app.register(prismaPlugin);
  await app.register(authPlugin);

  app.setErrorHandler((err, req, reply) => {
    if (err instanceof ZodError) {
      return reply.code(422).send({
        error: 'unprocessable',
        message: 'Some fields need attention',
        details: err.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      });
    }
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message, details: err.details });
    }
    // Prisma unique-constraint violation.
    if ((err as { code?: string }).code === 'P2002') {
      return reply.code(409).send({ error: 'conflict', message: 'That record already exists' });
    }
    if ((err as { code?: string }).code === 'P2025') {
      return reply.code(404).send({ error: 'not_found', message: 'Not found' });
    }
    const fallback = err as { statusCode?: number; message?: string };
    req.log.error({ err }, 'unhandled error');
    return reply
      .code(fallback.statusCode && fallback.statusCode < 500 ? fallback.statusCode : 500)
      .send({
        error: 'internal',
        message: isProd ? 'Something went wrong' : (fallback.message ?? 'Unknown error'),
      });
  });

  app.get('/health', async () => {
    await app.db.$queryRaw`SELECT 1`;
    return { ok: true, service: 'stud-api', env: env.NODE_ENV, time: new Date().toISOString() };
  });

  await app.register(
    async (api) => {
      await api.register(authRoutes);
      await api.register(kennelRoutes);
      await api.register(dogRoutes);
      await api.register(pedigreeRoutes);
      await api.register(verificationRoutes);
      await api.register(breedingRoutes);
      await api.register(litterRoutes);
      await api.register(dashboardRoutes);
      await api.register(studRoutes);
    },
    { prefix: '/v1' },
  );

  return app;
}

const isEntrypoint = process.argv[1]?.includes('server');

if (isEntrypoint) {
  const app = await buildServer();
  try {
    await app.listen({ port: env.PORT, host: env.HOST });
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }

  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      await app.close();
      process.exit(0);
    });
  }
}

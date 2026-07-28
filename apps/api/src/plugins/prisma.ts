import { prisma, type PrismaClient } from '@stud/db';
import type { FastifyInstance } from 'fastify';
import fp from 'fastify-plugin';

declare module 'fastify' {
  interface FastifyInstance {
    db: PrismaClient;
  }
}

export default fp(async function prismaPlugin(app: FastifyInstance) {
  await prisma.$connect();
  app.decorate('db', prisma);
  app.addHook('onClose', async () => {
    await prisma.$disconnect();
  });
});

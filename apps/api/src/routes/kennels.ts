import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { conflict, notFound } from '../lib/errors.js';

function slugify(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
}

const kennelInput = z.object({
  name: z.string().min(2).max(160),
  prefix: z.string().max(80).optional(),
  tagline: z.string().max(200).optional(),
  about: z.string().max(8000).optional(),
  logoUrl: z.string().url().optional(),
  coverUrl: z.string().url().optional(),
  websiteUrl: z.string().url().optional(),
  city: z.string().max(120).optional(),
  region: z.string().max(120).optional(),
  country: z.string().length(2).default('US'),
  postalCode: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  breeds: z.array(z.string().max(80)).max(20).default([]),
  foundedYear: z.number().int().min(1850).max(2100).optional(),
  isPublished: z.boolean().optional(),
});

export default async function kennelRoutes(app: FastifyInstance) {
  app.get('/kennels/mine', async (req) => {
    const user = await app.requireUser(req);
    const memberships = await app.db.membership.findMany({
      where: { userId: user.id, acceptedAt: { not: null } },
      include: { kennel: true },
      orderBy: { createdAt: 'asc' },
    });
    return { kennels: memberships.map((m) => ({ ...m.kennel, myRole: m.role })) };
  });

  app.get('/kennels/:slug', async (req) => {
    const { slug } = z.object({ slug: z.string() }).parse(req.params);
    const kennel = await app.db.kennel.findUnique({
      where: { slug },
      include: {
        dogs: {
          where: { isPublished: true },
          select: {
            id: true,
            slug: true,
            callName: true,
            registeredName: true,
            breed: true,
            sex: true,
            dateOfBirth: true,
            media: { where: { isPrimary: true }, take: 1 },
          },
        },
        memberships: {
          where: { role: 'KENNEL_OWNER' },
          include: { user: { select: { id: true, displayName: true, avatarUrl: true } } },
        },
      },
    });
    if (!kennel) throw notFound('Kennel not found');
    return { kennel };
  });

  app.post('/kennels', async (req, reply) => {
    const user = await app.requireUser(req);
    const body = kennelInput.parse(req.body);

    let slug = slugify(body.name);
    if (await app.db.kennel.findUnique({ where: { slug } })) {
      slug = `${slug}-${Math.random().toString(36).slice(2, 6)}`;
    }

    const kennel = await app.db.kennel.create({
      data: {
        ...body,
        slug,
        memberships: {
          create: { userId: user.id, role: 'KENNEL_OWNER', acceptedAt: new Date() },
        },
      },
    });

    // Creating a kennel makes you a breeder, whether you called yourself one or not.
    if (!user.roles.includes('BREEDER')) {
      await app.db.user.update({
        where: { id: user.id },
        data: { roles: { set: [...user.roles, 'BREEDER'] } },
      });
    }

    await audit(app.db, {
      actor: { id: user.id },
      action: 'kennel.create',
      entityType: 'Kennel',
      entityId: kennel.id,
      after: kennel,
      ipAddress: req.ip,
    });
    return reply.code(201).send({ kennel });
  });

  app.patch('/kennels/:id', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { user } = await app.requireKennelAccess(req, id, 'MANAGER');
    const body = kennelInput.partial().parse(req.body);

    const before = await app.db.kennel.findUnique({ where: { id } });
    if (!before) throw notFound('Kennel not found');

    const kennel = await app.db.kennel.update({ where: { id }, data: body });
    await audit(app.db, {
      actor: { id: user.id },
      action: 'kennel.update',
      entityType: 'Kennel',
      entityId: id,
      before,
      after: kennel,
      ipAddress: req.ip,
    });
    return { kennel };
  });

  app.get('/kennels/:id/members', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    await app.requireKennelAccess(req, id, 'VIEWER');
    const members = await app.db.membership.findMany({
      where: { kennelId: id },
      include: { user: { select: { id: true, email: true, displayName: true, avatarUrl: true } } },
    });
    return { members };
  });

  app.post('/kennels/:id/members', async (req, reply) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const { user } = await app.requireKennelAccess(req, id, 'KENNEL_OWNER');
    const body = z
      .object({
        email: z.string().email(),
        role: z.enum(['MANAGER', 'HANDLER', 'VIEWER']).default('HANDLER'),
      })
      .parse(req.body);

    const invitee = await app.db.user.findUnique({ where: { email: body.email } });
    if (!invitee) throw notFound('No Stud account for that email yet — ask them to sign up first');

    const existing = await app.db.membership.findUnique({
      where: { userId_kennelId: { userId: invitee.id, kennelId: id } },
    });
    if (existing) throw conflict('That person is already on this kennel');

    const membership = await app.db.membership.create({
      data: { userId: invitee.id, kennelId: id, role: body.role, invitedByUserId: user.id },
    });
    return reply.code(201).send({ membership });
  });

  app.post('/kennels/:id/members/accept', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    const membership = await app.db.membership.update({
      where: { userId_kennelId: { userId: user.id, kennelId: id } },
      data: { acceptedAt: new Date() },
    });
    return { membership };
  });

  app.delete('/kennels/:id/members/:userId', async (req) => {
    const { id, userId } = z.object({ id: z.string(), userId: z.string() }).parse(req.params);
    await app.requireKennelAccess(req, id, 'KENNEL_OWNER');
    await app.db.membership.delete({ where: { userId_kennelId: { userId, kennelId: id } } });
    return { ok: true };
  });
}

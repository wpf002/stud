import { randomBytes } from 'node:crypto';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { badRequest, conflict, unauthorized } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { SESSION_COOKIE, hashPassword, verifyPassword } from '../plugins/auth.js';

const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(10, 'Use at least 10 characters'),
  name: z.string().min(1).max(120).optional(),
  roles: z.array(z.enum(['OWNER', 'BREEDER', 'BUYER'])).min(1).default(['BUYER']),
  city: z.string().max(120).optional(),
  region: z.string().max(120).optional(),
  postalCode: z.string().max(20).optional(),
  country: z.string().length(2).default('US'),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export default async function authRoutes(app: FastifyInstance) {
  app.post('/auth/signup', { config: { rateLimit: { max: 10, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = signupSchema.parse(req.body);
    const existing = await app.db.user.findUnique({ where: { email: body.email } });
    if (existing) throw conflict('An account already exists for that email');

    const user = await app.db.user.create({
      data: {
        email: body.email,
        passwordHash: await hashPassword(body.password),
        name: body.name,
        displayName: body.name,
        roles: body.roles,
        city: body.city,
        region: body.region,
        postalCode: body.postalCode,
        country: body.country,
      },
      select: { id: true, email: true, name: true, displayName: true, avatarUrl: true, roles: true },
    });

    // Email verification token — delivery is wired to the mailer in Phase 9.
    await app.db.verificationToken.create({
      data: {
        identifier: user.email,
        token: randomBytes(24).toString('base64url'),
        purpose: 'email_verify',
        expiresAt: new Date(Date.now() + 86_400_000),
      },
    });

    await app.issueSession(reply, user.id, req);
    await audit(app.db, {
      actor: { id: user.id },
      action: 'user.signup',
      entityType: 'User',
      entityId: user.id,
      after: { email: user.email, roles: user.roles },
      ipAddress: req.ip,
    });
    return reply.code(201).send({ user });
  });

  app.post('/auth/login', { config: { rateLimit: { max: 20, timeWindow: '10 minutes' } } }, async (req, reply) => {
    const body = loginSchema.parse(req.body);
    const record = await app.db.user.findUnique({ where: { email: body.email } });

    // Constant-ish work whether or not the account exists.
    const ok = record?.passwordHash
      ? await verifyPassword(record.passwordHash, body.password)
      : await verifyPassword(
          '$argon2id$v=19$m=19456,t=2,p=1$c29tZXNhbHRzb21lc2FsdA$0000000000000000000000000000000000000000000',
          body.password,
        );

    if (!record || !ok || !record.isActive) throw unauthorized('Email or password is incorrect');

    await app.issueSession(reply, record.id, req);
    await app.db.user.update({ where: { id: record.id }, data: { lastSeenAt: new Date() } });

    return {
      user: {
        id: record.id,
        email: record.email,
        name: record.name,
        displayName: record.displayName,
        avatarUrl: record.avatarUrl,
        roles: record.roles,
      },
    };
  });

  app.post('/auth/logout', async (req, reply) => {
    await app.clearSession(reply, req.cookies?.[SESSION_COOKIE]);
    return { ok: true };
  });

  app.get('/auth/me', async (req) => ({ user: req.user ?? null }));

  app.patch('/auth/me', async (req) => {
    const user = await app.requireUser(req);
    const body = z
      .object({
        name: z.string().min(1).max(120).optional(),
        displayName: z.string().max(120).optional(),
        bio: z.string().max(2000).optional(),
        phone: z.string().max(40).optional(),
        avatarUrl: z.string().url().optional(),
        city: z.string().max(120).optional(),
        region: z.string().max(120).optional(),
        postalCode: z.string().max(20).optional(),
        country: z.string().length(2).optional(),
        latitude: z.number().min(-90).max(90).optional(),
        longitude: z.number().min(-180).max(180).optional(),
        timezone: z.string().max(64).optional(),
        roles: z.array(z.enum(['OWNER', 'BREEDER', 'BUYER'])).min(1).optional(),
      })
      .parse(req.body);

    const updated = await app.db.user.update({
      where: { id: user.id },
      data: body,
      select: { id: true, email: true, name: true, displayName: true, avatarUrl: true, roles: true },
    });
    return { user: updated };
  });

  app.post('/auth/verify-email', async (req) => {
    const { token } = z.object({ token: z.string().min(1) }).parse(req.body);
    const record = await app.db.verificationToken.findUnique({ where: { token } });
    if (!record || record.purpose !== 'email_verify' || record.usedAt || record.expiresAt < new Date()) {
      throw badRequest('That verification link is invalid or has expired');
    }
    await app.db.$transaction([
      app.db.user.update({ where: { email: record.identifier }, data: { emailVerified: new Date() } }),
      app.db.verificationToken.update({ where: { id: record.id }, data: { usedAt: new Date() } }),
    ]);
    return { ok: true };
  });
}

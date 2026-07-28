import { randomBytes, createHash } from 'node:crypto';
import argon2 from 'argon2';
import type { MembershipRole, Role, User } from '@stud/db';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import fp from 'fastify-plugin';
import { env, isProd } from '../env.js';
import { forbidden, unauthorized } from '../lib/errors.js';

export const SESSION_COOKIE = 'stud_session';

export type SessionUser = Pick<User, 'id' | 'email' | 'name' | 'displayName' | 'avatarUrl'> & {
  roles: Role[];
};

declare module 'fastify' {
  interface FastifyInstance {
    /** Throws 401 when there is no valid session. */
    requireUser: (req: FastifyRequest) => Promise<SessionUser>;
    /** Throws 403 unless the user holds one of `roles`. */
    requireRole: (req: FastifyRequest, roles: Role[]) => Promise<SessionUser>;
    /** Throws 403 unless the user is a member of `kennelId` at sufficient rank. */
    requireKennelAccess: (
      req: FastifyRequest,
      kennelId: string,
      minRole?: MembershipRole,
    ) => Promise<{ user: SessionUser; role: MembershipRole }>;
    issueSession: (reply: FastifyReply, userId: string, req: FastifyRequest) => Promise<void>;
    clearSession: (reply: FastifyReply, token?: string) => Promise<void>;
  }
  interface FastifyRequest {
    user?: SessionUser | null;
  }
}

export async function hashPassword(plain: string): Promise<string> {
  return argon2.hash(plain, { type: argon2.argon2id, memoryCost: 19456, timeCost: 2, parallelism: 1 });
}

export async function verifyPassword(hash: string, plain: string): Promise<boolean> {
  try {
    return await argon2.verify(hash, plain);
  } catch {
    return false;
  }
}

/** Session tokens are stored hashed — a DB leak must not be a login. */
function hashToken(token: string): string {
  return createHash('sha256').update(`${token}${env.AUTH_SECRET}`).digest('hex');
}

const RANK: Record<MembershipRole, number> = {
  VIEWER: 0,
  HANDLER: 1,
  MANAGER: 2,
  KENNEL_OWNER: 3,
};

export default fp(async function authPlugin(app: FastifyInstance) {
  // Populate req.user on every request, without failing unauthenticated ones.
  app.decorateRequest('user', null);
  app.addHook('preHandler', async (req) => {
    const raw = req.cookies?.[SESSION_COOKIE];
    if (!raw) return;
    const session = await app.db.session.findUnique({
      where: { sessionToken: hashToken(raw) },
      include: {
        user: {
          select: { id: true, email: true, name: true, displayName: true, avatarUrl: true, roles: true, isActive: true },
        },
      },
    });
    if (!session || session.expiresAt < new Date() || !session.user.isActive) return;
    const { isActive: _isActive, ...user } = session.user;
    req.user = user;
    // Sliding expiry: touch at most once an hour to avoid a write per request.
    const ttlMs = env.SESSION_TTL_DAYS * 86_400_000;
    if (session.expiresAt.getTime() - Date.now() < ttlMs - 3_600_000) {
      await app.db.session
        .update({ where: { id: session.id }, data: { expiresAt: new Date(Date.now() + ttlMs) } })
        .catch(() => undefined);
    }
  });

  app.decorate('requireUser', async (req: FastifyRequest): Promise<SessionUser> => {
    if (!req.user) throw unauthorized();
    return req.user;
  });

  app.decorate('requireRole', async (req: FastifyRequest, roles: Role[]): Promise<SessionUser> => {
    const user = await app.requireUser(req);
    if (!roles.some((r) => user.roles.includes(r))) {
      throw forbidden(`Requires one of: ${roles.join(', ')}`);
    }
    return user;
  });

  app.decorate(
    'requireKennelAccess',
    async (req: FastifyRequest, kennelId: string, minRole: MembershipRole = 'HANDLER') => {
      const user = await app.requireUser(req);
      if (user.roles.includes('ADMIN')) return { user, role: 'KENNEL_OWNER' as MembershipRole };
      const membership = await app.db.membership.findUnique({
        where: { userId_kennelId: { userId: user.id, kennelId } },
      });
      if (!membership || membership.acceptedAt == null) throw forbidden('Not a member of this kennel');
      if (RANK[membership.role] < RANK[minRole]) {
        throw forbidden(`Requires ${minRole} access or higher`);
      }
      return { user, role: membership.role };
    },
  );

  app.decorate('issueSession', async (reply: FastifyReply, userId: string, req: FastifyRequest) => {
    const token = randomBytes(32).toString('base64url');
    const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 86_400_000);
    await app.db.session.create({
      data: {
        userId,
        sessionToken: hashToken(token),
        expiresAt,
        userAgent: req.headers['user-agent']?.slice(0, 500) ?? null,
        ipAddress: req.ip,
      },
    });
    reply.setCookie(SESSION_COOKIE, token, {
      path: '/',
      httpOnly: true,
      sameSite: 'lax',
      secure: isProd,
      domain: env.COOKIE_DOMAIN,
      expires: expiresAt,
    });
  });

  app.decorate('clearSession', async (reply: FastifyReply, token?: string) => {
    if (token) {
      await app.db.session.deleteMany({ where: { sessionToken: hashToken(token) } }).catch(() => undefined);
    }
    reply.clearCookie(SESSION_COOKIE, { path: '/', domain: env.COOKIE_DOMAIN });
  });
});

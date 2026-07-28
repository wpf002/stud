import type { PrismaClient } from '@stud/db';

export type AuditActor = { id: string | null; type?: 'user' | 'system' | 'worker' };

/**
 * Write an audit row. Every consequential mutation calls this. Failures are
 * logged but never thrown — an audit write must not take down a user action,
 * and a missing row is caught by the reconciliation job.
 */
export async function audit(
  db: PrismaClient,
  input: {
    actor: AuditActor;
    action: string;
    entityType: string;
    entityId: string;
    before?: unknown;
    after?: unknown;
    metadata?: Record<string, unknown>;
    ipAddress?: string | null;
  },
): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        actorId: input.actor.id,
        actorType: input.actor.type ?? 'user',
        action: input.action,
        entityType: input.entityType,
        entityId: input.entityId,
        before: (input.before ?? undefined) as never,
        after: (input.after ?? undefined) as never,
        metadata: (input.metadata ?? undefined) as never,
        ipAddress: input.ipAddress ?? null,
      },
    });
  } catch (err) {
    console.error('[audit] failed to write audit entry', input.action, err);
  }
}

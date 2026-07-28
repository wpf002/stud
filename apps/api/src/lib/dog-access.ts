import type { PrismaClient } from '@stud/db';
import { loadDescendantIds } from '@stud/db/pedigree-loader';

/**
 * Who may edit a dog record.
 *
 * One implementation, used by every route that mutates a dog. Duplicating
 * this rule is how the merge endpoint ended up rejecting a breeder who could
 * happily edit both records individually.
 *
 * The rule:
 *   · admins, always
 *   · a current owner
 *   · a kennel member at HANDLER or above
 *   · for an ANCESTOR STUB — anyone with a dog descending from it
 *
 * That last case matters. A stub has no owner by definition; it exists only
 * as a name on someone else's papers. Locking stubs to admins would make
 * every imported pedigree permanently uncorrectable.
 */
export async function canEditDog(
  db: PrismaClient,
  userId: string,
  roles: readonly string[],
  dogId: string,
): Promise<boolean> {
  if (roles.includes('ADMIN')) return true;

  const dog = await db.dog.findUnique({
    where: { id: dogId },
    select: {
      kennelId: true,
      isAncestorStub: true,
      ownerships: { where: { endedAt: null }, select: { userId: true } },
    },
  });
  if (!dog) return false;

  if (dog.ownerships.some((o) => o.userId === userId)) return true;

  if (dog.kennelId) {
    const membership = await db.membership.findUnique({
      where: { userId_kennelId: { userId, kennelId: dog.kennelId } },
      select: { role: true, acceptedAt: true },
    });
    if (membership?.acceptedAt && membership.role !== 'VIEWER') return true;
  }

  if (dog.isAncestorStub) {
    const descendants = await loadDescendantIds(db, dogId);
    if (descendants.length === 0) {
      // An orphan stub belongs to nobody yet. Anyone signed in may tidy it —
      // there is no record to damage and no owner to wrong.
      return true;
    }
    const mine = await db.dog.findFirst({
      where: {
        id: { in: descendants },
        OR: [
          { ownerships: { some: { userId, endedAt: null } } },
          { kennel: { memberships: { some: { userId, acceptedAt: { not: null } } } } },
        ],
      },
      select: { id: true },
    });
    if (mine) return true;
  }

  return false;
}

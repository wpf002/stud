/**
 * Turning a puppy into a dog.
 *
 * ── The phase gate ─────────────────────────────────────────────────────────
 * "A buyer opens their dog's record on pickup day and it's already complete."
 *
 * Complete means: the pedigree the breeder built, both parents' verified
 * health, the growth curve from the whelping box, the microchip, the contract
 * and everything it obliges either side to do. The buyer types nothing.
 *
 * ── Why a new Dog row rather than a flag on Puppy ──────────────────────────
 * A puppy is a row in a litter. A dog is a thing with a pedigree, an owner, a
 * verification record and potentially offspring of its own. Every part of the
 * platform above Phase 1 speaks Dog, so a puppy that stayed a Puppy forever
 * would be invisible to pedigrees, verification and the stud directory — which
 * is to say invisible at exactly the point it starts to matter.
 *
 * ── What is NOT copied ─────────────────────────────────────────────────────
 * The weight history stays on the Puppy row and is read through
 * `Puppy.dogId`. Copying it would create a second source of truth for the same
 * eight weeks, and the first correction to either would make them disagree.
 *
 * Lives in @stud/db because the API and the seed both do this, and two
 * implementations of "what a new owner receives" would drift immediately.
 */

import type { Prisma, PrismaClient } from '@prisma/client';

export interface TransferResult {
  dogId: string;
  slug: string;
  created: boolean;
}

/** Slugify a name for a public URL. Mirrors the listing slug rules. */
function slugify(input: string): string {
  return input
    .toLowerCase()
    .replace(/ø/g, 'o')
    .replace(/đ/g, 'd')
    .replace(/ł/g, 'l')
    .replace(/ß/g, 'ss')
    .replace(/æ/g, 'ae')
    .replace(/œ/g, 'oe')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '');
}

async function uniqueSlug(db: PrismaClient | Prisma.TransactionClient, base: string): Promise<string> {
  const root = slugify(base) || 'dog';
  let candidate = root;
  for (let n = 2; ; n++) {
    const clash = await db.dog.findUnique({ where: { slug: candidate }, select: { id: true } });
    if (!clash) return candidate;
    candidate = `${root}-${n}`;
  }
}

/**
 * Promote a puppy to a dog record owned by the buyer.
 *
 * Idempotent: a puppy that already has a `dogId` returns it rather than
 * creating a second dog. Handovers get recorded twice more often than you
 * would think, and the second one must not mint a duplicate animal.
 */
export async function transferPuppyToOwner(
  db: PrismaClient,
  args: {
    puppyId: string;
    /** Null when the buyer has no account yet — the record waits for them. */
    ownerUserId: string | null;
    /** Name the owner gave it, if they have chosen one. */
    callName?: string | null;
    registeredName?: string | null;
    reason?: string;
  },
): Promise<TransferResult> {
  const puppy = await db.puppy.findUnique({
    where: { id: args.puppyId },
    include: {
      litter: {
        select: {
          id: true, sireId: true, damId: true, whelpedOn: true, kennelId: true,
          dam: { select: { breed: true, kennelId: true } },
        },
      },
    },
  });
  if (!puppy) throw new Error(`Puppy ${args.puppyId} not found`);

  if (puppy.dogId) {
    const existing = await db.dog.findUnique({
      where: { id: puppy.dogId },
      select: { id: true, slug: true },
    });
    if (existing) {
      // Make sure the ownership exists even if the dog already did — the two
      // writes are separate and only one of them may have landed.
      if (args.ownerUserId) await ensureOwnership(db, existing.id, args.ownerUserId, args.reason);
      return { dogId: existing.id, slug: existing.slug, created: false };
    }
  }

  const callName =
    args.callName?.trim() || puppy.name?.trim() || puppy.collarColor?.trim() || 'Puppy';
  const slug = await uniqueSlug(db, args.registeredName ?? callName);

  const dog = await db.$transaction(async (tx) => {
    const created = await tx.dog.create({
      data: {
        slug,
        callName,
        registeredName: args.registeredName ?? null,
        breed: puppy.litter.dam.breed,
        sex: puppy.sex,
        dateOfBirth: puppy.bornAt ?? puppy.litter.whelpedOn,
        colorPattern: puppy.colorPattern,
        markings: puppy.markings,
        microchip: puppy.microchip,
        // The pedigree, which is the whole point. A dog that goes home
        // without its parents attached has no pedigree, no COI and no
        // verified ancestry — and rebuilding that later is exactly the
        // paperwork this platform exists to remove.
        sireId: puppy.litter.sireId,
        damId: puppy.litter.damId,
        /**
         * NOT attached to the breeder's kennel. It belongs to the owner now,
         * and leaving it on the kennel would put someone else's dog in the
         * breeder's list and, worse, on their public profile.
         */
        kennelId: null,
        isPublished: false,
      },
    });

    await tx.puppy.update({ where: { id: puppy.id }, data: { dogId: created.id } });

    if (args.ownerUserId) {
      await tx.dogOwnership.create({
        data: {
          dogId: created.id,
          userId: args.ownerUserId,
          sharePercent: 100,
          reason: args.reason ?? 'purchase',
        },
      });
    }
    return created;
  });

  return { dogId: dog.id, slug: dog.slug, created: true };
}

async function ensureOwnership(
  db: PrismaClient,
  dogId: string,
  userId: string,
  reason?: string,
): Promise<void> {
  const existing = await db.dogOwnership.findFirst({
    where: { dogId, userId, endedAt: null },
    select: { id: true },
  });
  if (!existing) {
    await db.dogOwnership.create({
      data: { dogId, userId, sharePercent: 100, reason: reason ?? 'purchase' },
    });
  }
}

/**
 * Move a dog from one owner to another.
 *
 * The outgoing ownership is ENDED, not deleted. Who owned a dog and when is
 * exactly the kind of thing that seems obvious at the time and is impossible
 * to reconstruct three owners later — and it is the record that answers "was
 * this dog ever returned to its breeder?".
 */
export async function completeOwnershipTransfer(
  db: PrismaClient,
  args: { dogId: string; fromUserId: string | null; toUserId: string; reason: string; at?: Date },
): Promise<void> {
  const at = args.at ?? new Date();
  await db.$transaction(async (tx) => {
    await tx.dogOwnership.updateMany({
      where: { dogId: args.dogId, endedAt: null, ...(args.fromUserId ? { userId: args.fromUserId } : {}) },
      data: { endedAt: at },
    });
    await tx.dogOwnership.create({
      data: {
        dogId: args.dogId,
        userId: args.toUserId,
        sharePercent: 100,
        reason: args.reason,
        startedAt: at,
      },
    });
  });
}

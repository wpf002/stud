import type { PedigreeNode } from '@stud/pedigree';
import { buildGraph, type PedigreeGraph } from '@stud/pedigree';
import type { PrismaClient } from '@prisma/client';

/**
 * Load an ancestry subgraph out of Postgres and hand it to @stud/pedigree.
 *
 * Lives in @stud/db rather than in the API so that the API, the seed and any
 * future worker cannot end up with three subtly different ancestry walks —
 * the same reason `verification-service` is here.
 *
 * The engine is pure (invariant 1), so all I/O lives here. The load is a
 * breadth-first sweep by generation: one query per level instead of one per
 * dog, which is the difference between 2 round trips and 62 for a five-
 * generation pedigree.
 */

const ANCESTRY_SELECT = {
  id: true,
  sireId: true,
  damId: true,
  registeredName: true,
  callName: true,
  sex: true,
  breed: true,
  dateOfBirth: true,
} as const;

type AncestryRow = {
  id: string;
  sireId: string | null;
  damId: string | null;
  registeredName: string | null;
  callName: string;
  sex: 'MALE' | 'FEMALE';
  breed: string;
  dateOfBirth: Date | null;
};

function toNode(row: AncestryRow): PedigreeNode {
  return {
    id: row.id,
    sireId: row.sireId,
    damId: row.damId,
    name: row.registeredName ?? row.callName,
    sex: row.sex,
    breed: row.breed,
    birthYear: row.dateOfBirth ? row.dateOfBirth.getUTCFullYear() : null,
  };
}

/**
 * Every ancestor of `rootIds` down to `generations`, as a graph.
 *
 * `generations` bounds the walk. Loading 12 generations of a densely
 * line-bred pedigree is fine — the DAG collapses hard — but the bound stops
 * a pathological record from pulling the whole table.
 */
export async function loadAncestryGraph(
  db: PrismaClient,
  rootIds: readonly string[],
  generations = 8,
): Promise<PedigreeGraph> {
  const collected = new Map<string, PedigreeNode>();
  let frontier = [...new Set(rootIds)].filter(Boolean);

  for (let gen = 0; gen <= generations && frontier.length > 0; gen++) {
    const missing = frontier.filter((id) => !collected.has(id));
    if (missing.length === 0) break;

    const rows = (await db.dog.findMany({
      where: { id: { in: missing } },
      select: ANCESTRY_SELECT,
    })) as AncestryRow[];

    const next: string[] = [];
    for (const row of rows) {
      collected.set(row.id, toNode(row));
      if (row.sireId) next.push(row.sireId);
      if (row.damId) next.push(row.damId);
    }
    frontier = [...new Set(next)];
  }

  return buildGraph([...collected.values()]);
}

/**
 * Would setting `parentId` as a parent of `dogId` create a cycle?
 *
 * A dog cannot be its own ancestor. This is checked before every parent
 * write — the pure engine throws on a cyclic graph, but by then the row is
 * already saved and every pedigree query blows up.
 */
export async function wouldCreateCycle(
  db: PrismaClient,
  dogId: string,
  parentId: string,
): Promise<boolean> {
  if (dogId === parentId) return true;

  // Walk UP from the proposed parent looking for the dog itself.
  const seen = new Set<string>();
  let frontier = [parentId];

  while (frontier.length > 0) {
    const batch = frontier.filter((id) => !seen.has(id));
    if (batch.length === 0) break;
    batch.forEach((id) => seen.add(id));

    const rows = await db.dog.findMany({
      where: { id: { in: batch } },
      select: { id: true, sireId: true, damId: true },
    });

    const next: string[] = [];
    for (const row of rows) {
      if (row.sireId === dogId || row.damId === dogId) return true;
      if (row.sireId) next.push(row.sireId);
      if (row.damId) next.push(row.damId);
    }
    frontier = next;
  }
  return false;
}

/** Descendants of a dog, used by the merge tool and by cache invalidation. */
export async function loadDescendantIds(
  db: PrismaClient,
  dogId: string,
  maxDepth = 10,
): Promise<string[]> {
  const found = new Set<string>();
  let frontier = [dogId];

  for (let depth = 0; depth < maxDepth && frontier.length > 0; depth++) {
    const rows = await db.dog.findMany({
      where: { OR: [{ sireId: { in: frontier } }, { damId: { in: frontier } }] },
      select: { id: true },
    });
    const next = rows.map((r) => r.id).filter((id) => !found.has(id));
    next.forEach((id) => found.add(id));
    frontier = next;
  }
  return [...found];
}

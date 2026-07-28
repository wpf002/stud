import {
  type ParseResult,
  type ParsedDog,
  buildGraph,
  findDuplicates,
  inbreedingCoefficient,
  parseCsvPedigree,
  parseIndentedPedigree,
  scorePair,
} from '@stud/pedigree';
import type { PedigreeNode } from '@stud/pedigree';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { audit } from '../lib/audit.js';
import { badRequest, forbidden, notFound } from '../lib/errors.js';
import { canEditDog } from '../lib/dog-access.js';
import { loadAncestryGraph, loadDescendantIds, wouldCreateCycle } from '../lib/pedigree-loader.js';

const REGISTRY_BODIES = [
  'AKC', 'UKC', 'CKC', 'FCI', 'KC', 'NAVHDA', 'AFTCA', 'ABCA', 'JRTCA', 'CONTINENTAL', 'OTHER',
] as const;
type RegistryBody = (typeof REGISTRY_BODIES)[number];

function toRegistryBody(body: string | null | undefined): RegistryBody {
  const upper = (body ?? '').toUpperCase();
  return (REGISTRY_BODIES as readonly string[]).includes(upper) ? (upper as RegistryBody) : 'OTHER';
}

function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70);
}

async function uniqueSlug(app: FastifyInstance, base: string): Promise<string> {
  const root = slugify(base) || 'dog';
  if (!(await app.db.dog.findUnique({ where: { slug: root } }))) return root;
  for (let i = 0; i < 6; i++) {
    const candidate = `${root}-${Math.random().toString(36).slice(2, 6)}`;
    if (!(await app.db.dog.findUnique({ where: { slug: candidate } }))) return candidate;
  }
  return `${root}-${Date.now().toString(36)}`;
}

export default async function pedigreeRoutes(app: FastifyInstance) {
  // ── Preview ─────────────────────────────────────────────────────────────
  /**
   * Parse without writing. The import flow always previews first: a pedigree
   * import that silently creates 30 duplicate ancestors is how a COI quietly
   * becomes wrong, so the breeder sees the match decisions before we commit.
   */
  app.post('/pedigree/preview', async (req) => {
    await app.requireUser(req);
    const body = z
      .object({
        kind: z.enum(['CSV', 'REGISTRY_TEXT']),
        input: z.string().min(1).max(500_000),
        breed: z.string().max(120).optional(),
      })
      .parse(req.body);

    const parsed: ParseResult =
      body.kind === 'CSV' ? parseCsvPedigree(body.input) : parseIndentedPedigree(body.input);

    if (parsed.dogs.length === 0) {
      return { ...parsed, matches: [], projectedCoi: null };
    }

    // Match each parsed dog against what we already hold, so the breeder can
    // see "this links to your existing Marshland Drake" before committing.
    const regNumbers = parsed.dogs.map((d) => d.registrationNumber).filter(Boolean) as string[];
    const names = parsed.dogs.map((d) => d.registeredName).filter(Boolean) as string[];

    const existing = await app.db.dog.findMany({
      where: {
        supersededByDogId: null,
        OR: [
          ...(regNumbers.length ? [{ registrations: { some: { number: { in: regNumbers } } } }] : []),
          ...(names.length ? [{ registeredName: { in: names, mode: 'insensitive' as const } }] : []),
        ],
      },
      select: {
        id: true, slug: true, registeredName: true, callName: true, sex: true, breed: true,
        microchip: true, dateOfBirth: true,
        registrations: { select: { number: true, body: true } },
      },
      take: 500,
    });

    const matches = parsed.dogs.map((d) => {
      const best = existing
        .map((e) =>
          scorePair(
            {
              id: d.key,
              registeredName: d.registeredName,
              registrationNumber: d.registrationNumber,
              registryBody: d.registryBody,
              sex: d.sex,
              breed: d.breed ?? body.breed ?? null,
              birthYear: d.birthYear,
            },
            {
              id: e.id,
              registeredName: e.registeredName,
              callName: e.callName,
              registrationNumber: e.registrations[0]?.number ?? null,
              registryBody: e.registrations[0]?.body ?? null,
              microchip: e.microchip,
              sex: e.sex,
              breed: e.breed,
              dateOfBirth: e.dateOfBirth,
            },
          ),
        )
        .filter(Boolean)
        .sort((a, b) => b!.score - a!.score)[0];

      return {
        key: d.key,
        existingDogId: best ? best.b : null,
        score: best?.score ?? 0,
        confidence: best?.confidence ?? null,
        reasons: best?.reasons ?? [],
        conflicts: best?.conflicts ?? [],
      };
    });

    // What the COI would be if this pedigree were committed.
    //
    // Critically, this collapses keys that resolve to the SAME existing dog
    // before computing. The same ancestor pasted twice under two keys reads
    // as two unrelated animals and returns a COI of zero — which is the exact
    // failure mode this product exists to prevent, so the preview must not
    // reproduce it. Anything with a `certain` match is treated as identical,
    // matching what the commit step will actually do.
    const subject = parsed.dogs.find((d) => d.key === parsed.subjectKey);
    const canonicalByKey = new Map<string, string>();
    for (const m of matches) {
      if (m.existingDogId && m.confidence === 'certain') canonicalByKey.set(m.key, m.existingDogId);
    }
    const canonical = (key: string | null | undefined): string | null =>
      key ? (canonicalByKey.get(key) ?? key) : null;

    let projectedCoi: number | null = null;
    let collapsedAncestors = 0;
    if (subject) {
      try {
        // Start from what we already hold above every matched dog — a pasted
        // three-generation pedigree can attach to eight generations we
        // already have, and ignoring that understates the COI.
        const matchedIds = [...new Set(canonicalByKey.values())];
        const existingGraph = matchedIds.length
          ? await loadAncestryGraph(app.db, matchedIds, 10)
          : null;

        const nodes = new Map<string, PedigreeNode>();
        if (existingGraph) for (const [id, n] of existingGraph.nodes) nodes.set(id, n);

        // Parsed rows overlay the stored ones: the paste is the newer claim.
        for (const d of parsed.dogs) {
          const id = canonical(d.key)!;
          if (nodes.has(id) && canonicalByKey.has(d.key)) collapsedAncestors++;
          const existing = nodes.get(id);
          nodes.set(id, {
            id,
            sireId: canonical(d.sireKey) ?? existing?.sireId ?? null,
            damId: canonical(d.damKey) ?? existing?.damId ?? null,
            name: d.registeredName ?? existing?.name ?? null,
          });
        }

        projectedCoi = inbreedingCoefficient(buildGraph([...nodes.values()]), canonical(subject.key)!);
      } catch {
        projectedCoi = null;
      }
    }

    return { ...parsed, matches, projectedCoi, collapsedAncestors };
  });

  // ── Commit ──────────────────────────────────────────────────────────────
  app.post('/pedigree/import', async (req, reply) => {
    const user = await app.requireUser(req);
    const body = z
      .object({
        kind: z.enum(['CSV', 'REGISTRY_TEXT', 'MANUAL']),
        input: z.string().max(500_000).optional(),
        fileName: z.string().max(200).optional(),
        kennelId: z.string().optional(),
        breed: z.string().max(120),
        /** Attach the parsed subject's ancestry to this existing dog. */
        rootDogId: z.string().optional(),
        /** key → existing dog id, from the preview step. */
        linkTo: z.record(z.string(), z.string()).default({}),
        /** Keys the breeder chose not to import. */
        skipKeys: z.array(z.string()).default([]),
        /** Supplied directly for MANUAL; otherwise parsed from `input`. */
        dogs: z.array(z.record(z.string(), z.unknown())).optional(),
      })
      .parse(req.body);

    if (body.kennelId) await app.requireKennelAccess(req, body.kennelId, 'HANDLER');

    let parsed: ParseResult;
    if (body.kind === 'MANUAL') {
      if (!body.dogs?.length) throw badRequest('No dogs supplied.');
      parsed = {
        subjectKey: (body.dogs[0] as { key?: string }).key ?? 'p0',
        dogs: body.dogs as unknown as ParsedDog[],
        issues: [],
      };
    } else {
      if (!body.input) throw badRequest('Nothing to import.');
      parsed = body.kind === 'CSV' ? parseCsvPedigree(body.input) : parseIndentedPedigree(body.input);
    }

    const fatal = parsed.issues.filter((i) => i.severity === 'error');
    if (fatal.length > 0 && parsed.dogs.length === 0) {
      throw badRequest(fatal[0]!.message, { issues: parsed.issues });
    }

    const skip = new Set(body.skipKeys);
    const importable = parsed.dogs.filter((d) => !skip.has(d.key));

    // key → real dog id. Seeded with the breeder's link decisions so we
    // never create a second copy of a dog they already told us about.
    const idByKey = new Map<string, string>(Object.entries(body.linkTo));
    if (body.rootDogId && parsed.subjectKey) idByKey.set(parsed.subjectKey, body.rootDogId);

    let created = 0;
    let linked = idByKey.size;

    // Pass 1 — every dog exists before any parent pointer is written.
    for (const d of importable) {
      if (idByKey.has(d.key)) continue;

      // A matching registration number is an identity, not a coincidence.
      if (d.registrationNumber) {
        const hit = await app.db.registration.findFirst({
          where: { number: d.registrationNumber, body: toRegistryBody(d.registryBody) },
          select: { dogId: true },
        });
        if (hit) {
          idByKey.set(d.key, hit.dogId);
          linked++;
          continue;
        }
      }

      const name = d.registeredName ?? d.callName ?? 'Unnamed';
      const dog = await app.db.dog.create({
        data: {
          slug: await uniqueSlug(app, name),
          callName: d.callName ?? name.split(' ').slice(-1)[0] ?? name,
          registeredName: d.registeredName ?? null,
          breed: d.breed ?? body.breed,
          sex: d.sex ?? 'MALE',
          dateOfBirth: d.dateOfBirth ? new Date(d.dateOfBirth) : null,
          kennelId: d.generation === 0 ? (body.kennelId ?? null) : null,
          // Ancestors from an import are stubs: real nodes in the graph, but
          // nobody is maintaining them and nothing about them is verified.
          isAncestorStub: d.generation > 0,
          isPublished: false,
          ...(d.registrationNumber
            ? {
                registrations: {
                  create: {
                    body: toRegistryBody(d.registryBody),
                    number: d.registrationNumber,
                    nameOnRecord: d.registeredName ?? null,
                    isPrimary: true,
                  },
                },
              }
            : {}),
          ...(d.generation === 0
            ? { ownerships: { create: { userId: user.id, reason: 'initial' } } }
            : {}),
        },
      });
      idByKey.set(d.key, dog.id);
      created++;
    }

    // Pass 2 — wire up ancestry, refusing anything that would form a cycle.
    const issues = [...parsed.issues];
    for (const d of importable) {
      const dogId = idByKey.get(d.key);
      if (!dogId) continue;
      const sireId = d.sireKey ? (idByKey.get(d.sireKey) ?? null) : null;
      const damId = d.damKey ? (idByKey.get(d.damKey) ?? null) : null;
      if (!sireId && !damId) continue;

      const safeSire = sireId && !(await wouldCreateCycle(app.db, dogId, sireId)) ? sireId : null;
      const safeDam = damId && !(await wouldCreateCycle(app.db, dogId, damId)) ? damId : null;
      if (sireId && !safeSire) {
        issues.push({ severity: 'error', message: `${d.registeredName}: sire would create a loop and was not linked.` });
      }
      if (damId && !safeDam) {
        issues.push({ severity: 'error', message: `${d.registeredName}: dam would create a loop and was not linked.` });
      }

      await app.db.dog.update({
        where: { id: dogId },
        data: {
          ...(safeSire ? { sireId: safeSire } : {}),
          ...(safeDam ? { damId: safeDam } : {}),
        },
      });
    }

    const rootDogId = parsed.subjectKey ? (idByKey.get(parsed.subjectKey) ?? null) : null;

    // Cached stats for the subject and everything below it are now stale.
    if (rootDogId) {
      const descendants = await loadDescendantIds(app.db, rootDogId);
      await app.db.dogPedigreeStats.deleteMany({
        where: { dogId: { in: [rootDogId, ...descendants] } },
      });
    }

    const record = await app.db.pedigreeImport.create({
      data: {
        kind: body.kind,
        kennelId: body.kennelId ?? null,
        userId: user.id,
        rootDogId,
        rawInput: body.input?.slice(0, 200_000) ?? null,
        fileName: body.fileName ?? null,
        dogsCreated: created,
        dogsLinked: linked,
        dogsSkipped: skip.size,
        issues: issues as never,
      },
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'pedigree.import',
      entityType: 'PedigreeImport',
      entityId: record.id,
      after: { created, linked, skipped: skip.size, rootDogId },
      ipAddress: req.ip,
    });

    let coi: number | null = null;
    if (rootDogId) {
      const graph = await loadAncestryGraph(app.db, [rootDogId], 10);
      coi = inbreedingCoefficient(graph, rootDogId);
    }

    return reply.code(201).send({ import: record, rootDogId, coi, issues });
  });

  app.get('/pedigree/imports', async (req) => {
    const user = await app.requireUser(req);
    const q = z.object({ kennelId: z.string().optional() }).parse(req.query);
    if (q.kennelId) await app.requireKennelAccess(req, q.kennelId, 'VIEWER');

    const imports = await app.db.pedigreeImport.findMany({
      where: q.kennelId ? { kennelId: q.kennelId } : { userId: user.id },
      orderBy: { createdAt: 'desc' },
      take: 50,
      include: { rootDog: { select: { id: true, slug: true, callName: true } } },
    });
    return { imports };
  });

  // ── Duplicate detection ─────────────────────────────────────────────────
  /**
   * Rescan for duplicates. A duplicated ancestor makes two copies look
   * unrelated, which silently LOWERS every COI it appears in — the failure is
   * invisible unless something goes looking.
   */
  app.post('/dogs/duplicates/scan', async (req) => {
    const user = await app.requireUser(req);
    const body = z
      .object({ kennelId: z.string().optional(), breed: z.string().optional() })
      .parse(req.body ?? {});
    if (body.kennelId) await app.requireKennelAccess(req, body.kennelId, 'MANAGER');

    const scope = body.kennelId
      ? { kennelId: body.kennelId }
      : { ownerships: { some: { userId: user.id, endedAt: null } } };

    const owned = await app.db.dog.findMany({
      where: { ...scope, supersededByDogId: null },
      select: { id: true, breed: true },
      take: 2000,
    });
    const graph = await loadAncestryGraph(app.db, owned.map((d) => d.id), 10);

    // Scope is the ancestry closure PLUS every unowned ancestor stub in the
    // same breeds.
    //
    // The closure alone is not enough: a stub created by an import that has
    // not been wired to anything yet is reachable from nobody, so it would
    // never be scanned — and an orphan stub is precisely the duplicate that
    // gets attached to a real pedigree next week and halves its COI.
    const breeds = body.breed
      ? [body.breed]
      : [...new Set(owned.map((d) => d.breed).filter(Boolean))];

    const rows = await app.db.dog.findMany({
      where: {
        supersededByDogId: null,
        ...(body.breed ? { breed: body.breed } : {}),
        OR: [
          { id: { in: [...graph.nodes.keys()] } },
          ...(breeds.length ? [{ isAncestorStub: true, breed: { in: breeds } }] : []),
        ],
      },
      select: {
        id: true, registeredName: true, callName: true, sex: true, breed: true,
        microchip: true, dateOfBirth: true,
        registrations: { select: { number: true, body: true }, take: 1 },
      },
      take: 5000,
    });

    const matches = findDuplicates(
      rows.map((r) => ({
        id: r.id,
        registeredName: r.registeredName,
        callName: r.callName,
        registrationNumber: r.registrations[0]?.number ?? null,
        registryBody: r.registrations[0]?.body ?? null,
        microchip: r.microchip,
        sex: r.sex,
        breed: r.breed,
        dateOfBirth: r.dateOfBirth,
      })),
    );

    let upserted = 0;
    for (const m of matches) {
      // Order the pair so (a,b) and (b,a) can never both exist.
      const [dogAId, dogBId] = m.a < m.b ? [m.a, m.b] : [m.b, m.a];
      await app.db.dogMergeCandidate.upsert({
        where: { dogAId_dogBId: { dogAId, dogBId } },
        create: {
          dogAId, dogBId,
          score: m.score,
          confidence: m.confidence,
          reasons: m.reasons,
          conflicts: m.conflicts,
        },
        // Never resurrect something a human already dismissed.
        update: { score: m.score, confidence: m.confidence, reasons: m.reasons, conflicts: m.conflicts },
      });
      upserted++;
    }

    return { scanned: rows.length, found: matches.length, upserted };
  });

  app.get('/dogs/duplicates', async (req) => {
    await app.requireUser(req);
    const q = z
      .object({
        status: z.enum(['OPEN', 'MERGED', 'DISMISSED']).default('OPEN'),
        take: z.coerce.number().min(1).max(100).default(50),
      })
      .parse(req.query);

    const select = {
      id: true, slug: true, callName: true, registeredName: true, sex: true, breed: true,
      dateOfBirth: true, microchip: true, isAncestorStub: true,
      registrations: { select: { body: true, number: true } },
      _count: { select: { sireOffspring: true, damOffspring: true } },
    };

    const candidates = await app.db.dogMergeCandidate.findMany({
      where: { status: q.status },
      orderBy: [{ score: 'desc' }, { createdAt: 'desc' }],
      take: q.take,
      include: { dogA: { select }, dogB: { select } },
    });
    return { candidates };
  });

  // ── Merge ───────────────────────────────────────────────────────────────
  /**
   * Merge two records. The loser is NOT deleted (invariant 4) — it is marked
   * superseded so every link anyone already holds still resolves, and a
   * DogSupersession row records who did it and when.
   */
  app.post('/dogs/merge', async (req) => {
    const user = await app.requireUser(req);
    const body = z
      .object({
        keepDogId: z.string(),
        mergeDogId: z.string(),
        candidateId: z.string().optional(),
      })
      .parse(req.body);

    if (body.keepDogId === body.mergeDogId) throw badRequest('Those are the same dog.');

    const [keep, merge] = await Promise.all([
      app.db.dog.findUnique({
        where: { id: body.keepDogId },
        include: { registrations: true, ownerships: { where: { endedAt: null } } },
      }),
      app.db.dog.findUnique({
        where: { id: body.mergeDogId },
        include: { registrations: true, media: true },
      }),
    ]);
    if (!keep || !merge) throw notFound('One of those dogs no longer exists.');
    if (merge.supersededByDogId) throw badRequest('That record has already been merged.');

    // You must be able to edit BOTH records. Same rule as every other dog
    // mutation — merging is the most consequential edit there is, so it
    // cannot be the one place with a looser check.
    const [mayKeep, mayMerge] = await Promise.all([
      canEditDog(app.db, user.id, user.roles, body.keepDogId),
      canEditDog(app.db, user.id, user.roles, body.mergeDogId),
    ]);
    if (!mayKeep) throw forbidden('You do not have access to the record you are keeping.');
    if (!mayMerge) throw forbidden('You do not have access to the record you are merging away.');

    // Merging a dog into its own descendant would make it its own ancestor.
    if (await wouldCreateCycle(app.db, body.keepDogId, body.mergeDogId)) {
      throw badRequest('Those two records are in an ancestor/descendant relationship and cannot be merged.');
    }

    const affected = await loadDescendantIds(app.db, body.mergeDogId);

    await app.db.$transaction(async (tx) => {
      // Re-point every child of the loser at the survivor.
      await tx.dog.updateMany({ where: { sireId: body.mergeDogId }, data: { sireId: body.keepDogId } });
      await tx.dog.updateMany({ where: { damId: body.mergeDogId }, data: { damId: body.keepDogId } });

      // Carry across registrations the survivor does not already hold.
      for (const reg of merge.registrations) {
        const clash = keep.registrations.find((r) => r.body === reg.body && r.number === reg.number);
        if (clash) continue;
        await tx.registration
          .update({ where: { id: reg.id }, data: { dogId: body.keepDogId, isPrimary: false } })
          .catch(() => undefined);
      }

      await tx.dogMedia.updateMany({ where: { dogId: body.mergeDogId }, data: { dogId: body.keepDogId } });

      // Fill only the gaps — a merge must never overwrite a maintained field
      // with a stub's placeholder.
      await tx.dog.update({
        where: { id: body.keepDogId },
        data: {
          registeredName: keep.registeredName ?? merge.registeredName,
          dateOfBirth: keep.dateOfBirth ?? merge.dateOfBirth,
          microchip: keep.microchip ?? merge.microchip,
          colorPattern: keep.colorPattern ?? merge.colorPattern,
          markings: keep.markings ?? merge.markings,
          sireId: keep.sireId ?? merge.sireId,
          damId: keep.damId ?? merge.damId,
        },
      });

      await tx.dog.update({
        where: { id: body.mergeDogId },
        data: { supersededByDogId: body.keepDogId, isPublished: false, sireId: null, damId: null },
      });

      await tx.dogSupersession.create({
        data: {
          supersededDogId: body.mergeDogId,
          survivingDogId: body.keepDogId,
          reason: 'merge',
          actorUserId: user.id,
        },
      });

      await tx.dogMergeCandidate.updateMany({
        where: {
          OR: [
            { dogAId: body.mergeDogId },
            { dogBId: body.mergeDogId },
          ],
        },
        data: { status: 'MERGED', resolvedAt: new Date(), resolvedByUserId: user.id, keptDogId: body.keepDogId },
      });

      await tx.dogPedigreeStats.deleteMany({
        where: { dogId: { in: [body.keepDogId, body.mergeDogId, ...affected] } },
      });
    });

    await audit(app.db, {
      actor: { id: user.id },
      action: 'dog.merge',
      entityType: 'Dog',
      entityId: body.keepDogId,
      before: { merged: merge.id, name: merge.registeredName ?? merge.callName },
      after: { kept: keep.id, descendantsRepointed: affected.length },
      metadata: { candidateId: body.candidateId },
      ipAddress: req.ip,
    });

    const dog = await app.db.dog.findUnique({
      where: { id: body.keepDogId },
      include: { registrations: true },
    });
    return { dog, mergedId: body.mergeDogId, descendantsAffected: affected.length };
  });

  app.post('/dogs/duplicates/:id/dismiss', async (req) => {
    const { id } = z.object({ id: z.string() }).parse(req.params);
    const user = await app.requireUser(req);
    const candidate = await app.db.dogMergeCandidate.update({
      where: { id },
      data: { status: 'DISMISSED', resolvedAt: new Date(), resolvedByUserId: user.id },
    });
    return { candidate };
  });
}

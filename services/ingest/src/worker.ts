/**
 * Reconciliation worker.
 *
 * Verification is not a one-time event. A source can amend a result, withdraw
 * a record, or publish a new one for a dog we already hold. A badge that was
 * true in April and never rechecked is a badge that lies by October.
 *
 * Each pass:
 *   1. Age out claims past their freshness window        → STALE
 *   2. Re-query the sources behind those claims          → VERIFIED | CONFLICTED
 *   3. Sweep dogs with registrations but no claims yet   → first-time discovery
 *
 * Everything is bounded and rate-limited. These are public records maintained
 * by non-profits and clubs; we are a guest on their infrastructure.
 */

import { PrismaClient } from '@stud/db';
import { loadRootEnv } from '@stud/db/env';
import { VerificationEngine } from '@stud/verify';
import { markStaleClaims, recomputeSummary, runVerification } from '@stud/db/verification';

loadRootEnv();

const db = new PrismaClient();

const LIVE = process.env.VERIFY_LIVE_SOURCES === 'true' || process.env.VERIFY_LIVE_SOURCES === '1';
const INTERVAL_MS = Number(process.env.INGEST_INTERVAL_MS ?? 15 * 60_000);
/** Dogs re-verified per pass. Deliberately small — politeness over throughput. */
const BATCH_SIZE = Number(process.env.INGEST_BATCH_SIZE ?? 25);

const engine = new VerificationEngine({
  liveSources: LIVE,
  userAgent: process.env.VERIFY_USER_AGENT,
  timeoutMs: Number(process.env.VERIFY_REQUEST_TIMEOUT_MS ?? 8000),
});

export interface PassResult {
  staleMarked: number;
  dogsRechecked: number;
  dogsDiscovered: number;
  conflictsRaised: number;
  errors: number;
  durationMs: number;
}

export async function runPass(): Promise<PassResult> {
  const startedAt = Date.now();
  const result: PassResult = {
    staleMarked: 0,
    dogsRechecked: 0,
    dogsDiscovered: 0,
    conflictsRaised: 0,
    errors: 0,
    durationMs: 0,
  };

  // ── 1. Age out ──────────────────────────────────────────────────────────
  result.staleMarked = await markStaleClaims(db);

  // ── 2. Re-query anything stale or already conflicted ────────────────────
  const staleDogs = await db.verifiedClaim.findMany({
    where: { state: 'STALE' },
    select: { dogId: true },
    distinct: ['dogId'],
    take: BATCH_SIZE,
  });

  for (const { dogId } of staleDogs) {
    try {
      const dog = await db.dog.findUnique({
        where: { id: dogId },
        select: { id: true, registrations: { select: { number: true, body: true } } },
      });
      if (!dog || dog.registrations.length === 0) continue;

      const outcome = await runVerification(db, engine, {
        dogId,
        identifiers: dog.registrations.map((r) => ({ number: r.number, body: r.body })),
        actor: { id: null, type: 'system' },
      });
      result.dogsRechecked++;
      result.conflictsRaised += outcome.conflicts;
    } catch (err) {
      result.errors++;
      console.error(`[ingest] recheck failed for dog ${dogId}:`, err);
    }
  }

  // ── 3. First-time discovery ─────────────────────────────────────────────
  // A dog with a registration number and no claims at all has never been
  // looked up. Sources publish results months after a test, so this sweep is
  // how a breeder gets verified without doing anything.
  const remaining = Math.max(0, BATCH_SIZE - result.dogsRechecked);
  if (remaining > 0) {
    const undiscovered = await db.dog.findMany({
      where: {
        supersededByDogId: null,
        registrations: { some: {} },
        verifiedClaims: { none: {} },
      },
      select: { id: true, registrations: { select: { number: true, body: true } } },
      orderBy: { createdAt: 'asc' },
      take: remaining,
    });

    for (const dog of undiscovered) {
      try {
        const outcome = await runVerification(db, engine, {
          dogId: dog.id,
          identifiers: dog.registrations.map((r) => ({ number: r.number, body: r.body })),
          actor: { id: null, type: 'system' },
        });
        result.dogsDiscovered++;
        result.conflictsRaised += outcome.conflicts;
      } catch (err) {
        result.errors++;
        console.error(`[ingest] discovery failed for dog ${dog.id}:`, err);
      }
    }
  }

  result.durationMs = Date.now() - startedAt;
  return result;
}

/** Rebuild every verification summary. Run after a scoring change. */
export async function rebuildAllSummaries(): Promise<number> {
  const dogs = await db.dog.findMany({ where: { supersededByDogId: null }, select: { id: true } });
  for (const dog of dogs) await recomputeSummary(db, dog.id);
  return dogs.length;
}

async function main() {
  const once = process.argv.includes('--once');
  const rebuild = process.argv.includes('--rebuild-summaries');

  console.info(
    `[ingest] starting · live sources ${LIVE ? 'ON' : 'OFF (fixture adapter)'} · batch ${BATCH_SIZE}`,
  );

  if (rebuild) {
    const n = await rebuildAllSummaries();
    console.info(`[ingest] rebuilt ${n} verification summaries`);
    await db.$disconnect();
    return;
  }

  const pass = async () => {
    try {
      const r = await runPass();
      console.info(
        `[ingest] pass complete in ${r.durationMs}ms — ${r.staleMarked} aged out, ` +
          `${r.dogsRechecked} rechecked, ${r.dogsDiscovered} newly discovered, ` +
          `${r.conflictsRaised} conflicts raised, ${r.errors} errors`,
      );
    } catch (err) {
      console.error('[ingest] pass failed:', err);
    }
  };

  await pass();
  if (once) {
    await db.$disconnect();
    return;
  }

  const timer = setInterval(pass, INTERVAL_MS);
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.on(signal, async () => {
      clearInterval(timer);
      await db.$disconnect();
      process.exit(0);
    });
  }
}

if (process.argv[1]?.includes('worker')) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

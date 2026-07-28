import type {
  ClaimCategory,
  ClaimOutcome,
  PrismaClient,
  VerificationSource,
  VerificationState,
} from '@prisma/client';
import {
  CLAIM_CATEGORY,
  type ClaimType,
  type LookupResult,
  type SourceFinding,
  type VerificationEngine,
  identifiersMatch,
  isStale,
  transition,
  triggerForLookup,
} from '@stud/verify';

/**
 * The persistence half of verification.
 *
 * @stud/verify decides *what* should happen; this decides how it is written.
 * The two are kept apart so the state machine stays pure and testable
 * (invariant 1's sibling), and so every write path goes through the same
 * function — a badge that says "Verified" without a check row and an event row
 * behind it is a bug, and the only way to guarantee that is to have one place
 * that writes all three.
 *
 * It lives in @stud/db rather than in the API because the reconciliation
 * worker needs exactly the same logic. Two copies of this would drift, and the
 * drift would be invisible until a badge disagreed with its own audit log.
 */

export interface VerifyOptions {
  dogId: string;
  /** Registration numbers to look up, with their registry. */
  identifiers: { number: string; body?: string | null }[];
  claimTypes?: ClaimType[];
  actor: { id: string | null; type: 'user' | 'admin' | 'system' };
  /** Narrow to specific sources. Omit for everything relevant. */
  sources?: VerificationSource[];
}

export interface VerifyOutcome {
  checks: { source: string; status: string; findings: number; durationMs: number; error?: string | null }[];
  claimsCreated: number;
  claimsUpdated: number;
  conflicts: number;
  durationMs: number;
}

const SOURCE_FRESHNESS_DAYS: Record<string, number> = {
  OFA: 30, AKC: 30, UKC: 30, CKC: 45, NAVHDA: 60, AFTCA: 60,
  PENNHIP: 90, EMBARK: 365, WISDOM: 365, UC_DAVIS: 365, PAW_PRINT: 365,
  DOCUMENT: 365, FIXTURE: 30,
};

function freshnessFor(source: string): number {
  return SOURCE_FRESHNESS_DAYS[source] ?? 30;
}

function staleAfter(from: Date, source: string): Date {
  return new Date(from.getTime() + freshnessFor(source) * 86_400_000);
}

/**
 * Run a verification pass for one dog and persist everything it produced.
 *
 * Writes, per source, in one transaction:
 *   · a VerificationCheck — including for NOT_FOUND and UNAVAILABLE, because
 *     "we asked and could not get an answer" is evidence too
 *   · a VerifiedClaim upsert per finding
 *   · a VerificationEvent per state transition
 */
export async function runVerification(
  db: PrismaClient,
  engine: VerificationEngine,
  opts: VerifyOptions,
): Promise<VerifyOutcome> {
  const startedAt = Date.now();
  const outcome: VerifyOutcome = {
    checks: [],
    claimsCreated: 0,
    claimsUpdated: 0,
    conflicts: 0,
    durationMs: 0,
  };

  const existing = await db.verifiedClaim.findMany({ where: { dogId: opts.dogId } });
  const existingByKey = new Map(
    existing.map((c) => [`${c.claimType}::${c.markerName ?? ''}::${c.source}`, c]),
  );

  for (const identifier of opts.identifiers) {
    const results: LookupResult[] = await engine.lookupAll({
      identifier: identifier.number,
      registryBody: identifier.body ?? null,
      claimTypes: opts.claimTypes,
    });

    for (const result of results) {
      if (opts.sources && !opts.sources.includes(result.source as VerificationSource)) continue;

      const check = await db.verificationCheck.create({
        data: {
          dogId: opts.dogId,
          source: result.source as VerificationSource,
          identifier: identifier.number,
          status: result.status,
          findingCount: result.findings.length,
          durationMs: result.durationMs,
          error: result.error ?? null,
          raw: (result.raw ?? undefined) as never,
          actorType: opts.actor.type,
          actorUserId: opts.actor.id,
        },
      });

      outcome.checks.push({
        source: result.source,
        status: result.status,
        findings: result.findings.length,
        durationMs: result.durationMs,
        error: result.error ?? null,
      });

      // A source that could not answer must not touch existing claims. This
      // is the single most important line in the file: without it, an OFA
      // outage would quietly unverify every dog on the platform.
      if (result.status === 'UNAVAILABLE' || result.status === 'DISABLED' || result.status === 'UNSUPPORTED_IDENTIFIER') {
        continue;
      }

      const seenKeys = new Set<string>();

      for (const finding of result.findings) {
        const key = `${finding.claimType}::${finding.markerName ?? ''}::${result.source}`;
        seenKeys.add(key);
        const prior = existingByKey.get(key) ?? null;

        const trigger = triggerForLookup({
          status: 'FOUND',
          previous: prior ? { rawResult: prior.rawResult, outcome: prior.outcome as ClaimOutcome | null } : null,
          observed: { rawResult: finding.rawResult, outcome: finding.outcome },
        });

        const fromState = (prior?.state ?? 'UNVERIFIED') as VerificationState;
        const decision = transition({
          from: fromState,
          trigger,
          source: result.source,
          actor: opts.actor,
          at: result.checkedAt,
          previous: prior ? { rawResult: prior.rawResult, outcome: prior.outcome as ClaimOutcome | null } : null,
          observed: { rawResult: finding.rawResult, outcome: finding.outcome },
        });

        const claim = await upsertClaim(db, {
          dogId: opts.dogId,
          source: result.source as VerificationSource,
          finding,
          state: decision.to as VerificationState,
          checkedAt: result.checkedAt,
          matchedIdentifier: result.matchedIdentifier ?? identifier.number,
          prior,
          diverged: decision.to === 'CONFLICTED',
        });

        if (prior) outcome.claimsUpdated++;
        else outcome.claimsCreated++;
        if (decision.to === 'CONFLICTED') outcome.conflicts++;

        if (decision.changed || !prior) {
          await db.verificationEvent.create({
            data: {
              claimId: claim.id,
              fromState,
              toState: decision.to as VerificationState,
              trigger,
              reason: decision.reason,
              source: result.source as VerificationSource,
              previousRawResult: prior?.rawResult ?? null,
              observedRawResult: finding.rawResult,
              actorType: opts.actor.type,
              actorUserId: opts.actor.id,
            },
          });
        }

        await db.verificationCheck.update({ where: { id: check.id }, data: { claimId: claim.id } });
        existingByKey.set(key, claim);
      }

      // A claim we previously verified from this source that the source no
      // longer lists. That is a CONFLICT, not an absence — something changed
      // upstream and a human needs to look at it.
      //
      // Scoped to the IDENTIFIER that produced the claim, not merely to the
      // source. A dog commonly holds several registration numbers (an AKC
      // number and a NAVHDA number, say); looking up the second one returns
      // nothing for the first one's claims, and treating that as a
      // disappearance would conflict every claim the first lookup just made.
      if (result.status === 'FOUND' || result.status === 'NOT_FOUND') {
        for (const [key, prior] of existingByKey) {
          if (!key.endsWith(`::${result.source}`)) continue;
          if (seenKeys.has(key)) continue;
          if (prior.state !== 'VERIFIED' && prior.state !== 'STALE') continue;
          // Only this identifier's own claims are in scope.
          if (!identifiersMatch(prior.matchedIdentifier ?? '', identifier.number)) continue;

          const decision = transition({
            from: prior.state as VerificationState,
            trigger: 'SOURCE_EMPTY',
            source: result.source,
            actor: opts.actor,
            at: result.checkedAt,
            previous: { rawResult: prior.rawResult, outcome: prior.outcome as ClaimOutcome | null },
          });

          await db.verifiedClaim.update({
            where: { id: prior.id },
            data: {
              state: decision.to as VerificationState,
              conflictNote: decision.reason,
              conflictedAt: decision.to === 'CONFLICTED' ? result.checkedAt : null,
              lastCheckedAt: result.checkedAt,
            },
          });
          await db.verificationEvent.create({
            data: {
              claimId: prior.id,
              fromState: prior.state,
              toState: decision.to as VerificationState,
              trigger: 'SOURCE_EMPTY',
              reason: decision.reason,
              source: result.source as VerificationSource,
              previousRawResult: prior.rawResult,
              actorType: opts.actor.type,
              actorUserId: opts.actor.id,
            },
          });
          if (decision.to === 'CONFLICTED') outcome.conflicts++;
        }
      }
    }
  }

  await recomputeSummary(db, opts.dogId);
  outcome.durationMs = Date.now() - startedAt;
  return outcome;
}

async function upsertClaim(
  db: PrismaClient,
  args: {
    dogId: string;
    source: VerificationSource;
    finding: SourceFinding;
    state: VerificationState;
    checkedAt: Date;
    matchedIdentifier: string;
    prior: { id: string; rawResult: string | null; outcome: ClaimOutcome | null } | null;
    diverged: boolean;
  },
) {
  const { finding } = args;
  const category = CLAIM_CATEGORY[finding.claimType] as ClaimCategory;

  // On divergence the HELD value stays in place and the source's new value
  // goes into the conflict columns. Overwriting would erase the very thing a
  // reviewer needs to compare — and would silently change a result a buyer
  // may already have seen.
  const base = {
    category,
    state: args.state,
    lastCheckedAt: args.checkedAt,
    staleAfter: staleAfter(args.checkedAt, args.source),
    matchedIdentifier: args.matchedIdentifier,
    sourceRecordId: finding.sourceRecordId ?? null,
    sourceUrl: finding.sourceUrl ?? null,
  };

  const divergentData = args.diverged
    ? {
        conflictRawResult: finding.rawResult,
        conflictOutcome: finding.outcome as ClaimOutcome,
        conflictedAt: args.checkedAt,
      }
    : {
        rawResult: finding.rawResult,
        outcome: finding.outcome as ClaimOutcome,
        testedAt: finding.testedAt ?? null,
        detail: finding.detail ?? null,
        conflictRawResult: null,
        conflictOutcome: null,
        conflictedAt: null,
        conflictNote: null,
      };

  return db.verifiedClaim.upsert({
    where: {
      dogId_claimType_markerName_source: {
        dogId: args.dogId,
        claimType: finding.claimType,
        markerName: finding.markerName ?? '',
        source: args.source,
      },
    },
    create: {
      dogId: args.dogId,
      claimType: finding.claimType,
      markerName: finding.markerName ?? '',
      source: args.source,
      rawResult: finding.rawResult,
      outcome: finding.outcome as ClaimOutcome,
      testedAt: finding.testedAt ?? null,
      detail: finding.detail ?? null,
      ...base,
    },
    update: { ...base, ...divergentData },
  });
}

/**
 * Sweep for claims that have aged past their freshness window.
 * Called by the reconciliation worker before it re-queries anything.
 */
export async function markStaleClaims(db: PrismaClient, now = new Date()): Promise<number> {
  const candidates = await db.verifiedClaim.findMany({
    where: { state: 'VERIFIED', staleAfter: { lt: now } },
    select: { id: true, state: true, source: true, lastCheckedAt: true, rawResult: true },
    take: 1000,
  });

  let updated = 0;
  for (const claim of candidates) {
    if (!isStale(claim.lastCheckedAt, freshnessFor(claim.source), now)) continue;
    const decision = transition({
      from: 'VERIFIED',
      trigger: 'AGED_OUT',
      source: claim.source,
      actor: { id: null, type: 'system' },
      at: now,
    });
    await db.$transaction([
      db.verifiedClaim.update({ where: { id: claim.id }, data: { state: decision.to as VerificationState } }),
      db.verificationEvent.create({
        data: {
          claimId: claim.id,
          fromState: 'VERIFIED',
          toState: decision.to as VerificationState,
          trigger: 'AGED_OUT',
          reason: decision.reason,
          source: claim.source,
          previousRawResult: claim.rawResult,
          actorType: 'system',
        },
      }),
    ]);
    updated++;
  }
  return updated;
}

/** Recompute the denormalised verification density for one dog. */
export async function recomputeSummary(db: PrismaClient, dogId: string): Promise<void> {
  const [claims, reportedCount] = await Promise.all([
    db.verifiedClaim.findMany({
      where: { dogId },
      select: { state: true, outcome: true, claimType: true, category: true },
    }),
    db.reportedClaim.count({ where: { dogId } }),
  ]);

  const verified = claims.filter((c) => c.state === 'VERIFIED');
  const stale = claims.filter((c) => c.state === 'STALE');
  const conflicted = claims.filter((c) => c.state === 'CONFLICTED');
  const unverified = claims.filter((c) => c.state === 'UNVERIFIED' || c.state === 'PENDING');

  const healthNormalCount = verified.filter(
    (c) => (c.category === 'HEALTH' || c.category === 'GENETIC') && c.outcome === 'NORMAL',
  ).length;

  // Concerning findings are counted, never hidden. A platform that quietly
  // drops abnormal results from its own summary is worse than one that never
  // verified anything.
  const concerningCount = claims.filter(
    (c) => c.outcome === 'AT_RISK' || c.outcome === 'ABNORMAL',
  ).length;

  const verifiedTitleCount = verified.filter(
    (c) => c.category === 'TITLE' || c.category === 'PERFORMANCE',
  ).length;

  // Conflicted claims count in the DENOMINATOR but not the numerator.
  //
  // Leaving them out of both produced a dog showing "100% verified" with an
  // open conflict on the same screen — misleading in exactly the direction
  // that flatters the dog. A claim under review is a claim we hold and cannot
  // currently stand behind, so it must drag the number down.
  const denominator =
    verified.length + stale.length + conflicted.length + reportedCount + unverified.length;
  const density = denominator === 0 ? 0 : verified.length / denominator;

  const data = {
    verifiedCount: verified.length,
    reportedCount,
    unverifiedCount: unverified.length,
    staleCount: stale.length,
    conflictedCount: conflicted.length,
    healthNormalCount,
    concerningCount,
    verifiedTitleCount,
    hasChic: verified.some((c) => c.claimType === 'CHIC'),
    density,
    computedAt: new Date(),
  };

  await db.dogVerificationSummary.upsert({
    where: { dogId },
    create: { dogId, ...data },
    update: data,
  });
}

/** Resolve a conflict. Admin-only; the state machine enforces the legal moves. */
export async function resolveConflict(
  db: PrismaClient,
  args: {
    claimId: string;
    action: 'ACCEPT_SOURCE' | 'KEEP_RECORD' | 'REVOKE';
    actorUserId: string;
    note?: string | null;
  },
) {
  const claim = await db.verifiedClaim.findUnique({ where: { id: args.claimId } });
  if (!claim) throw new Error('Claim not found');

  const trigger =
    args.action === 'ACCEPT_SOURCE'
      ? ('ADMIN_ACCEPTED_SOURCE' as const)
      : args.action === 'KEEP_RECORD'
        ? ('ADMIN_KEPT_RECORD' as const)
        : ('ADMIN_REVOKED' as const);

  const decision = transition({
    from: claim.state as VerificationState,
    trigger,
    source: claim.source,
    actor: { id: args.actorUserId, type: 'admin' },
    at: new Date(),
    previous: { rawResult: claim.rawResult, outcome: claim.outcome as ClaimOutcome | null },
    observed: { rawResult: claim.conflictRawResult, outcome: claim.conflictOutcome as ClaimOutcome | null },
    note: args.note,
  });

  const accepted = args.action === 'ACCEPT_SOURCE';
  const updated = await db.$transaction(async (tx) => {
    const next = await tx.verifiedClaim.update({
      where: { id: claim.id },
      data: {
        state: decision.to as VerificationState,
        ...(accepted
          ? { rawResult: claim.conflictRawResult, outcome: claim.conflictOutcome }
          : {}),
        conflictRawResult: null,
        conflictOutcome: null,
        conflictedAt: null,
        conflictNote: null,
      },
    });
    await tx.verificationEvent.create({
      data: {
        claimId: claim.id,
        fromState: claim.state,
        toState: decision.to as VerificationState,
        trigger,
        reason: decision.reason,
        source: claim.source,
        previousRawResult: claim.rawResult,
        observedRawResult: claim.conflictRawResult,
        actorType: 'admin',
        actorUserId: args.actorUserId,
      },
    });
    return next;
  });

  await recomputeSummary(db, claim.dogId);
  return { claim: updated, decision };
}

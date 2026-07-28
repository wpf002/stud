/**
 * The verification engine.
 *
 * Holds the adapter set and dispatches a lookup across every source that can
 * speak to the identifier. Pure orchestration — it does no persistence, so it
 * stays testable and the DB layer keeps its own transaction boundaries.
 */

import { createDocumentAdapter } from './adapters/document.js';
import { createFixtureAdapter } from './adapters/fixture.js';
import { createOfaAdapter } from './adapters/ofa.js';
import { createPerformanceAdapter } from './adapters/performance.js';
import { createRegistryAdapter } from './adapters/registry.js';
import {
  type ClaimType,
  type LookupInput,
  type LookupResult,
  type SourceAdapter,
  type SourceFinding,
  type SourceId,
} from './types.js';

export interface EngineOptions {
  /**
   * Contact real third-party sites. Default FALSE.
   *
   * The gate is deliberate: see docs/verification-sources.md. With it off, the
   * fixture adapter serves the same contract offline, so nothing downstream is
   * stubbed or untested.
   */
  liveSources?: boolean;
  /** Replace the whole set. Tests use this. */
  adapters?: SourceAdapter[];
  userAgent?: string;
  timeoutMs?: number;
  /** Ceiling on a whole multi-source lookup. Keeps the < 5s gate honest. */
  overallTimeoutMs?: number;
}

export class VerificationEngine {
  private readonly adapters: Map<SourceId, SourceAdapter>;
  private readonly overallTimeoutMs: number;

  constructor(opts: EngineOptions = {}) {
    const live = opts.liveSources ?? false;
    const list =
      opts.adapters ??
      [
        createOfaAdapter({ enabled: live, timeoutMs: opts.timeoutMs, userAgent: opts.userAgent }),
        createRegistryAdapter({ body: 'AKC', enabled: live }),
        createRegistryAdapter({ body: 'UKC', enabled: live }),
        createRegistryAdapter({ body: 'CKC', enabled: live }),
        createPerformanceAdapter({ source: 'NAVHDA', enabled: live }),
        createPerformanceAdapter({ source: 'AFTCA', enabled: live }),
        createDocumentAdapter(),
        // Always present. With live sources off it is the only one that
        // answers, which is exactly what we want in development and CI.
        createFixtureAdapter(),
      ];

    this.adapters = new Map(list.map((a) => [a.meta.id, a]));
    this.overallTimeoutMs = opts.overallTimeoutMs ?? 12_000;
  }

  get(sourceId: SourceId): SourceAdapter | null {
    return this.adapters.get(sourceId) ?? null;
  }

  list(): SourceAdapter[] {
    return [...this.adapters.values()];
  }

  /** Sources that can speak to a given claim type. */
  sourcesFor(claimType: ClaimType): SourceAdapter[] {
    return this.list().filter((a) => a.meta.claimTypes.includes(claimType));
  }

  /**
   * Query every relevant source in parallel.
   *
   * One slow or broken source must not sink the others, so each is wrapped:
   * a rejection becomes an UNAVAILABLE result rather than an exception. The
   * caller always gets one entry per source it asked for.
   */
  async lookupAll(
    input: LookupInput,
    opts: { sources?: readonly SourceId[]; includeDocument?: boolean } = {},
  ): Promise<LookupResult[]> {
    const wanted = opts.sources
      ? this.list().filter((a) => opts.sources!.includes(a.meta.id))
      : this.list().filter(
          (a) =>
            // The document source keys on a submission id, not a registration
            // number, so it is opt-in rather than part of a broad sweep.
            (a.meta.id !== 'DOCUMENT' || opts.includeDocument) &&
            (!input.claimTypes || input.claimTypes.some((c) => a.meta.claimTypes.includes(c))),
        );

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.overallTimeoutMs);
    const signal = input.signal ?? controller.signal;

    try {
      return await Promise.all(
        wanted.map(async (adapter) => {
          const startedAt = Date.now();
          try {
            return await adapter.lookup({ ...input, signal });
          } catch (err) {
            return {
              source: adapter.meta.id,
              status: 'UNAVAILABLE' as const,
              findings: [],
              checkedAt: new Date(),
              durationMs: Date.now() - startedAt,
              error: err instanceof Error ? err.message : String(err),
            };
          }
        }),
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Collapse multi-source results into one finding per claim.
   *
   * When two sources disagree the more authoritative one wins, but the loser
   * is retained in `alternates` — a disagreement between OFA and a registry is
   * itself a signal, and discarding it would hide the thing worth seeing.
   */
  reconcile(results: readonly LookupResult[]): ReconciledFinding[] {
    const byClaim = new Map<string, ReconciledFinding>();

    for (const result of results) {
      if (result.status !== 'FOUND') continue;
      for (const finding of result.findings) {
        // Genetic markers are per-marker, not per-claim-type.
        const key = `${finding.claimType}::${finding.markerName ?? ''}`;
        const existing = byClaim.get(key);
        const rank = SOURCE_AUTHORITY[result.source] ?? 0;

        if (!existing) {
          byClaim.set(key, {
            claimType: finding.claimType,
            markerName: finding.markerName ?? null,
            finding,
            source: result.source,
            checkedAt: result.checkedAt,
            authority: rank,
            alternates: [],
          });
          continue;
        }

        if (rank > existing.authority) {
          existing.alternates.push({ source: existing.source, finding: existing.finding });
          existing.finding = finding;
          existing.source = result.source;
          existing.checkedAt = result.checkedAt;
          existing.authority = rank;
        } else {
          existing.alternates.push({ source: result.source, finding });
        }
      }
    }

    return [...byClaim.values()];
  }
}

export interface ReconciledFinding {
  claimType: ClaimType;
  markerName: string | null;
  finding: SourceFinding;
  source: SourceId;
  checkedAt: Date;
  authority: number;
  alternates: { source: SourceId; finding: SourceFinding }[];
}

/**
 * Which source wins a disagreement.
 *
 * OFA is the authority on phenotypic health results — it is the body that
 * issues them. Registries are the authority on registration and titles. A
 * human-reviewed document outranks nothing automatically; it fills gaps the
 * machine sources cannot reach.
 */
const SOURCE_AUTHORITY: Record<SourceId, number> = {
  OFA: 100,
  AKC: 90,
  UKC: 85,
  CKC: 85,
  NAVHDA: 80,
  AFTCA: 80,
  PENNHIP: 75,
  UC_DAVIS: 70,
  EMBARK: 65,
  PAW_PRINT: 65,
  WISDOM: 60,
  DOCUMENT: 50,
  FIXTURE: 10,
};

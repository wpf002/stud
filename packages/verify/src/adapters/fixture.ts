/**
 * Fixture adapter — a real source, offline.
 *
 * This is not a mock in the usual sense. It implements the full `SourceAdapter`
 * contract and returns the same shapes the live adapters do, including
 * NOT_FOUND, UNAVAILABLE and — crucially — *divergence over time*, so the
 * CONFLICTED path gets exercised without waiting for OFA to change a record.
 *
 * It is what runs in development and in CI, which means every layer above the
 * network boundary is tested for real rather than stubbed.
 */

import { normalizeResult } from '../normalize.js';
import {
  type ClaimType,
  type LookupInput,
  type LookupResult,
  type SourceAdapter,
  type SourceFinding,
  type SourceMeta,
} from '../types.js';

export const FIXTURE_META: SourceMeta = {
  id: 'FIXTURE',
  label: 'Fixture source',
  homepage: 'https://stud.dog/verification',
  claimTypes: [
    'HIP', 'ELBOW', 'CARDIAC', 'EYE_CAER', 'THYROID', 'PATELLA', 'CHIC',
    'DNA_MARKER', 'REGISTRATION',
    'TITLE_CONFORMATION', 'TITLE_FIELD', 'TITLE_HUNT_TEST',
    'NAVHDA_NA', 'NAVHDA_UT',
  ],
  freshnessDays: 30,
  mode: 'machine',
};

export interface FixtureFinding {
  claimType: ClaimType;
  rawResult: string;
  testedAt?: string | null;
  markerName?: string | null;
  detail?: string | null;
}

export interface FixtureRecord {
  registeredName: string;
  findings: FixtureFinding[];
  /**
   * Simulate a source that changed. On lookups after `divergesAfter`, these
   * findings replace the ones above — which drives VERIFIED → CONFLICTED.
   */
  divergesAfter?: Date;
  divergedFindings?: FixtureFinding[];
}

/**
 * The seeded fixture dataset.
 *
 * Keyed on registration number, matching how the real sources are indexed.
 * Deliberately includes the awkward cases: a dog with a conflict waiting to
 * happen, a dog with a carrier result, a dog with nothing on file at all.
 */
export const FIXTURE_DATA: Record<string, FixtureRecord> = {
  // Ranger — a fully-panelled sire. The showcase record.
  SR91234501: {
    registeredName: "Blackwater's Ranger Of The Marsh",
    findings: [
      { claimType: 'HIP', rawResult: 'Excellent', testedAt: '2023-04-18' },
      { claimType: 'ELBOW', rawResult: 'Normal', testedAt: '2023-04-18' },
      { claimType: 'CARDIAC', rawResult: 'Normal - Advanced', testedAt: '2023-09-02' },
      { claimType: 'EYE_CAER', rawResult: 'Normal', testedAt: '2024-01-15' },
      { claimType: 'CHIC', rawResult: '187432', detail: 'Breed panel complete' },
      {
        claimType: 'DNA_MARKER',
        rawResult: 'Clear',
        markerName: 'Cone Degeneration (CD)',
        testedAt: '2023-02-01',
      },
      { claimType: 'TITLE_HUNT_TEST', rawResult: 'MH', testedAt: '2024-10-12' },
      { claimType: 'NAVHDA_UT', rawResult: 'Prize I — 204/204', testedAt: '2024-06-08' },
    ],
  },

  // Juniper — a dam with a real carrier result. Carrier is NOT a failure, and
  // the UI has to prove it treats it that way.
  SR88451102: {
    registeredName: "Blackwater's Juniper Wind",
    findings: [
      { claimType: 'HIP', rawResult: 'Good', testedAt: '2023-06-20' },
      { claimType: 'ELBOW', rawResult: 'Normal', testedAt: '2023-06-20' },
      { claimType: 'EYE_CAER', rawResult: 'Normal', testedAt: '2024-02-11' },
      {
        claimType: 'DNA_MARKER',
        rawResult: 'Carrier',
        markerName: 'Cone Degeneration (CD)',
        testedAt: '2023-03-14',
      },
    ],
  },

  // Atlas — the conflict case. OFA-style amendments do happen: a re-read, a
  // correction, a resubmission under a different film. Seeded so the
  // CONFLICTED path is demonstrable rather than theoretical.
  SS12009944: {
    registeredName: "Cedar Run's Atlas Unbound",
    findings: [
      { claimType: 'HIP', rawResult: 'Good', testedAt: '2022-11-04' },
      { claimType: 'ELBOW', rawResult: 'Normal', testedAt: '2022-11-04' },
      { claimType: 'CARDIAC', rawResult: 'Normal - Basic', testedAt: '2023-01-20' },
    ],
    divergesAfter: new Date('2000-01-01'),
    divergedFindings: [
      // The re-read came back a grade lower. This is the exact scenario that
      // must never silently overwrite a "Good" a buyer already saw.
      { claimType: 'HIP', rawResult: 'Fair', testedAt: '2022-11-04', detail: 'Amended after re-read' },
      { claimType: 'ELBOW', rawResult: 'Normal', testedAt: '2022-11-04' },
      { claimType: 'CARDIAC', rawResult: 'Normal - Basic', testedAt: '2023-01-20' },
    ],
  },

  // Marigold — a dam with partial testing. Some claims verify, others stay
  // honestly unverified.
  SS14883201: {
    registeredName: "Cedar Run's Marigold",
    findings: [{ claimType: 'HIP', rawResult: 'Fair', testedAt: '2023-08-30' }],
  },

  // Jack — the stud owner's dog. Titles but no health panel yet, which is a
  // very common real shape and a good test of "verified titles, unverified health".
  SR94002218: {
    registeredName: "Lindqvist's Jack Of Tulsa",
    findings: [
      { claimType: 'TITLE_HUNT_TEST', rawResult: 'SH', testedAt: '2023-11-05' },
      { claimType: 'NAVHDA_NA', rawResult: 'Prize I — 110/112', testedAt: '2022-09-17' },
    ],
  },
};

export interface FixtureAdapterOptions {
  data?: Record<string, FixtureRecord>;
  /** Identifiers that should behave as if the source were unreachable. */
  unavailableFor?: readonly string[];
  /** Injected clock, so divergence is testable without waiting. */
  now?: () => Date;
  /** Simulated latency, to keep the "under 5 seconds" gate honest. */
  latencyMs?: number;
}

function toFinding(f: FixtureFinding, identifier: string): SourceFinding {
  return {
    claimType: f.claimType,
    rawResult: f.rawResult,
    outcome: normalizeResult(f.claimType, f.rawResult),
    testedAt: f.testedAt ? new Date(f.testedAt) : null,
    sourceRecordId: `${identifier}-${f.claimType}${f.markerName ? `-${f.markerName}` : ''}`,
    sourceUrl: `https://stud.dog/verification#fixture-${identifier}`,
    markerName: f.markerName ?? null,
    detail: f.detail ?? null,
  };
}

export function createFixtureAdapter(opts: FixtureAdapterOptions = {}): SourceAdapter {
  const data = opts.data ?? FIXTURE_DATA;
  const now = opts.now ?? (() => new Date());
  const unavailable = new Set((opts.unavailableFor ?? []).map((s) => s.toUpperCase()));

  return {
    meta: FIXTURE_META,
    async lookup(input: LookupInput): Promise<LookupResult> {
      const startedAt = Date.now();
      if (opts.latencyMs) await new Promise((r) => setTimeout(r, opts.latencyMs));

      const identifier = input.identifier.trim().toUpperCase().replace(/\s+/g, '');
      const base = { source: 'FIXTURE' as const, checkedAt: now(), matchedIdentifier: identifier };

      if (unavailable.has(identifier)) {
        return {
          ...base,
          status: 'UNAVAILABLE',
          findings: [],
          durationMs: Date.now() - startedAt,
          error: 'Fixture configured to simulate an unreachable source.',
        };
      }

      const record = data[identifier];
      if (!record) {
        return { ...base, status: 'NOT_FOUND', findings: [], durationMs: Date.now() - startedAt };
      }

      const diverged =
        record.divergesAfter && record.divergedFindings && now() > record.divergesAfter;
      const source = diverged ? record.divergedFindings! : record.findings;

      const wanted = input.claimTypes ? new Set(input.claimTypes) : null;
      const findings = source
        .filter((f) => !wanted || wanted.has(f.claimType))
        .map((f) => toFinding(f, identifier));

      return {
        ...base,
        status: findings.length > 0 ? 'FOUND' : 'NOT_FOUND',
        findings,
        matchedName: record.registeredName,
        durationMs: Date.now() - startedAt,
        raw: source,
      };
    },
  };
}

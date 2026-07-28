/**
 * Performance adapter — NAVHDA, field trials, hunt tests.
 *
 * This is the sire-side wedge. A GSP owner's entire case is "he runs" — and
 * nobody in the category verifies that today. NAVHDA publishes test results
 * with scores and prize classifications; AFTCA publishes field trial placements.
 *
 * These bodies are smaller than OFA and their sites are correspondingly more
 * fragile, so the parsing here is deliberately narrow: recognise the shapes we
 * are sure of, return nothing for the rest. A missing title is a visible
 * "Not verified"; a wrongly parsed one is a lie.
 *
 * Live lookups are gated. See docs/verification-sources.md.
 */

import { normalizeIdentifier } from '../normalize.js';
import {
  type ClaimType,
  type LookupInput,
  type LookupResult,
  type SourceAdapter,
  type SourceFinding,
  type SourceMeta,
} from '../types.js';

export const NAVHDA_META: SourceMeta = {
  id: 'NAVHDA',
  label: 'NAVHDA',
  homepage: 'https://www.navhda.org',
  claimTypes: ['NAVHDA_NA', 'NAVHDA_UT', 'NAVHDA_INVITATIONAL'],
  freshnessDays: 60,
  mode: 'machine',
};

export const AFTCA_META: SourceMeta = {
  id: 'AFTCA',
  label: 'AFTCA',
  homepage: 'https://www.aftca.org',
  claimTypes: ['TITLE_FIELD'],
  freshnessDays: 60,
  mode: 'machine',
};

/** A NAVHDA test result as published. */
export interface NavhdaResult {
  /** "Natural Ability", "Utility Preparatory", "Utility", "Invitational" */
  testType: string;
  /** Prize I / II / III, or "No Prize". */
  prize: string;
  /** Numeric score — NA is out of 112, UT out of 204. */
  score?: number | null;
  testDate?: string | null;
  chapter?: string | null;
  dogName?: string | null;
  registration?: string | null;
}

function navhdaClaimType(testType: string): ClaimType | null {
  const v = testType.trim().toLowerCase();
  if (v.includes('invitational')) return 'NAVHDA_INVITATIONAL';
  if (v.includes('utility')) return 'NAVHDA_UT';
  if (v.includes('natural ability')) return 'NAVHDA_NA';
  return null;
}

/**
 * A prize is an award, not a pass/fail — Prize III is a real qualification.
 * "No Prize" is a genuine result and is recorded as such rather than hidden,
 * because a stud's full record is more informative than his highlights.
 */
export function parseNavhdaResults(results: readonly NavhdaResult[]): SourceFinding[] {
  const findings: SourceFinding[] = [];
  for (const r of results) {
    const claimType = navhdaClaimType(r.testType);
    if (!claimType) continue;

    const maxScore = claimType === 'NAVHDA_UT' ? 204 : claimType === 'NAVHDA_NA' ? 112 : null;
    const scoreText = r.score != null ? ` — ${r.score}${maxScore ? `/${maxScore}` : ''}` : '';

    findings.push({
      claimType,
      rawResult: `${r.prize}${scoreText}`.trim(),
      outcome: 'INFORMATIONAL',
      testedAt: r.testDate ? new Date(r.testDate) : null,
      sourceUrl: 'https://www.navhda.org/test-results/',
      detail: [r.testType, r.chapter ? `${r.chapter} chapter` : null].filter(Boolean).join(' · '),
    });
  }
  return findings;
}

export interface PerformanceAdapterOptions {
  source: 'NAVHDA' | 'AFTCA';
  enabled?: boolean;
  fetchResults?: (input: LookupInput) => Promise<NavhdaResult[]>;
}

export function createPerformanceAdapter(opts: PerformanceAdapterOptions): SourceAdapter {
  const meta = opts.source === 'NAVHDA' ? NAVHDA_META : AFTCA_META;
  const enabled = opts.enabled ?? false;

  return {
    meta,
    async lookup(input: LookupInput): Promise<LookupResult> {
      const startedAt = Date.now();
      const identifier = normalizeIdentifier(input.identifier);
      const base = { source: meta.id, checkedAt: new Date(), matchedIdentifier: identifier };

      if (!enabled && !opts.fetchResults) {
        return {
          ...base,
          status: 'DISABLED',
          findings: [],
          durationMs: Date.now() - startedAt,
          error: `Live ${opts.source} lookups are switched off pending the source review in docs/verification-sources.md.`,
        };
      }

      try {
        const results = opts.fetchResults ? await opts.fetchResults(input) : [];
        const findings = parseNavhdaResults(results);
        return {
          ...base,
          status: findings.length > 0 ? 'FOUND' : 'NOT_FOUND',
          findings,
          matchedName: results.find((r) => r.dogName)?.dogName ?? null,
          durationMs: Date.now() - startedAt,
          raw: results,
        };
      } catch (err) {
        return {
          ...base,
          status: 'UNAVAILABLE',
          findings: [],
          durationMs: Date.now() - startedAt,
          error: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

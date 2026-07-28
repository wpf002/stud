/**
 * OFA / CHIC adapter.
 *
 * The Orthopedic Foundation for Animals publishes hip, elbow, eye, cardiac,
 * patella and thyroid results, plus breed-specific panels and CHIC numbers,
 * searchable by registration number. This is the single richest public health
 * source for American dogs and the primary reason "verified" can mean anything
 * on this platform.
 *
 * ── A deliberate gate ─────────────────────────────────────────────────────
 * `enabled` defaults to FALSE. The parser and transport are complete, but the
 * adapter will not contact ofa.org until someone sets `VERIFY_LIVE_SOURCES=true`
 * *and* the terms-of-use question in docs/verification-sources.md is settled.
 *
 * That is not timidity — it is the same standard we hold breeders to. A
 * platform whose entire pitch is "we check the receipts" cannot start by
 * quietly hammering a non-profit's search endpoint. When it is switched on it
 * goes through `fetchText`, which is rate-limited and identifies itself.
 *
 * Until then `FixtureAdapter` serves the same shape offline, so every layer
 * above this one is exercised for real.
 */

import { fetchText } from '../http.js';
import { normalizeIdentifier, normalizeResult } from '../normalize.js';
import {
  type ClaimType,
  type LookupInput,
  type LookupResult,
  type SourceAdapter,
  type SourceFinding,
  type SourceMeta,
} from '../types.js';

const OFA_CLAIM_TYPES: readonly ClaimType[] = [
  'HIP', 'ELBOW', 'PATELLA', 'SHOULDER', 'LEGG_CALVE_PERTHES',
  'CARDIAC', 'EYE_CAER', 'THYROID', 'DENTITION', 'TRACHEA', 'HEARING_BAER',
  'DNA_MARKER', 'CHIC',
];

export const OFA_META: SourceMeta = {
  id: 'OFA',
  label: 'OFA',
  homepage: 'https://ofa.org',
  claimTypes: OFA_CLAIM_TYPES,
  freshnessDays: 30,
  mode: 'machine',
};

/** OFA's own application names, mapped onto our claim vocabulary. */
const APPLICATION_TO_CLAIM: Record<string, ClaimType> = {
  hip: 'HIP',
  hips: 'HIP',
  elbow: 'ELBOW',
  elbows: 'ELBOW',
  patella: 'PATELLA',
  patellar: 'PATELLA',
  patellas: 'PATELLA',
  shoulder: 'SHOULDER',
  shoulders: 'SHOULDER',
  'legg-calve-perthes': 'LEGG_CALVE_PERTHES',
  cardiac: 'CARDIAC',
  'advanced cardiac': 'CARDIAC',
  'basic cardiac': 'CARDIAC',
  'congenital cardiac': 'CARDIAC',
  eyes: 'EYE_CAER',
  eye: 'EYE_CAER',
  caer: 'EYE_CAER',
  cerf: 'EYE_CAER',
  thyroid: 'THYROID',
  'autoimmune thyroiditis': 'THYROID',
  dentition: 'DENTITION',
  trachea: 'TRACHEA',
  'congenital deafness': 'HEARING_BAER',
  baer: 'HEARING_BAER',
  hearing: 'HEARING_BAER',
};

export function mapApplicationToClaim(application: string): ClaimType | null {
  const key = application.trim().toLowerCase();
  if (APPLICATION_TO_CLAIM[key]) return APPLICATION_TO_CLAIM[key]!;
  // Breed-specific DNA panels appear under many names ("DM", "PRA-prcd",
  // "vWD"). Anything we do not recognise as a phenotypic exam is treated as a
  // genetic marker and carries its own label.
  if (/\b(dna|prcd|pra|dm|vwd|ic|nce|cea|mdr1|jhc|hnpk)\b/i.test(application)) return 'DNA_MARKER';
  return null;
}

/**
 * One row of OFA's public record, already extracted from whatever transport
 * shape the site currently uses. Kept separate from the fetching so the parser
 * is testable against captured fixtures without a network.
 */
export interface OfaRow {
  application: string;
  result: string;
  registration?: string | null;
  registeredName?: string | null;
  ofaNumber?: string | null;
  reportDate?: string | null;
  ageAtTestMonths?: number | null;
  /** Present on a CHIC-certified dog. */
  chicNumber?: string | null;
}

function parseDate(raw: string | null | undefined): Date | null {
  if (!raw) return null;
  const cleaned = raw.trim();
  // OFA dates appear as "04/2023", "2023-04-18" and "April 2023".
  const monthYear = /^(\d{1,2})\/(\d{4})$/.exec(cleaned);
  if (monthYear) return new Date(Date.UTC(Number(monthYear[2]), Number(monthYear[1]) - 1, 1));
  const d = new Date(cleaned);
  return Number.isNaN(d.getTime()) ? null : d;
}

/**
 * Turn OFA rows into findings.
 *
 * Exported and pure so a parser fix can be replayed against every stored raw
 * payload without re-querying OFA — which is both faster and politer.
 */
export function parseOfaRows(rows: readonly OfaRow[], identifier: string): SourceFinding[] {
  const findings: SourceFinding[] = [];
  const seenChic = new Set<string>();

  for (const row of rows) {
    const claimType = mapApplicationToClaim(row.application);
    if (!claimType) continue;

    findings.push({
      claimType,
      rawResult: row.result.trim(),
      outcome: normalizeResult(claimType, row.result),
      testedAt: parseDate(row.reportDate),
      sourceRecordId: row.ofaNumber ?? null,
      sourceUrl: row.ofaNumber
        ? `https://ofa.org/advanced-search/?f=${encodeURIComponent(row.ofaNumber)}`
        : `https://ofa.org/advanced-search/?f=${encodeURIComponent(identifier)}`,
      markerName: claimType === 'DNA_MARKER' ? row.application.trim() : null,
      ageAtTestMonths: row.ageAtTestMonths ?? null,
      detail: row.registeredName ? `Recorded as ${row.registeredName}` : null,
    });

    // A CHIC number is a meaningful separate claim: it means the dog has
    // completed the full panel its parent club requires, which is a stronger
    // statement than any individual result.
    if (row.chicNumber && !seenChic.has(row.chicNumber)) {
      seenChic.add(row.chicNumber);
      findings.push({
        claimType: 'CHIC',
        rawResult: row.chicNumber,
        outcome: 'INFORMATIONAL',
        sourceRecordId: row.chicNumber,
        sourceUrl: `https://ofa.org/advanced-search/?f=${encodeURIComponent(row.chicNumber)}`,
        detail: 'Completed the breed-specific panel required by the parent club.',
      });
    }
  }
  return findings;
}

export interface OfaAdapterOptions {
  /** Off by default. See the note at the top of this file. */
  enabled?: boolean;
  timeoutMs?: number;
  userAgent?: string;
  /** Override the transport. Tests and replays use this. */
  fetchRows?: (identifier: string, signal?: AbortSignal) => Promise<OfaRow[]>;
}

export function createOfaAdapter(opts: OfaAdapterOptions = {}): SourceAdapter {
  const enabled = opts.enabled ?? false;

  return {
    meta: OFA_META,

    async lookup(input: LookupInput): Promise<LookupResult> {
      const startedAt = Date.now();
      const identifier = normalizeIdentifier(input.identifier);
      const base = {
        source: 'OFA' as const,
        checkedAt: new Date(),
        matchedIdentifier: identifier,
      };

      if (!identifier) {
        return {
          ...base,
          status: 'UNSUPPORTED_IDENTIFIER',
          findings: [],
          durationMs: Date.now() - startedAt,
          error: 'No identifier supplied.',
        };
      }

      if (!enabled && !opts.fetchRows) {
        return {
          ...base,
          status: 'DISABLED',
          findings: [],
          durationMs: Date.now() - startedAt,
          error:
            'Live OFA lookups are switched off. Set VERIFY_LIVE_SOURCES=true once the terms-of-use review in docs/verification-sources.md is complete.',
        };
      }

      try {
        const rows = opts.fetchRows
          ? await opts.fetchRows(identifier, input.signal)
          : await fetchOfaRows(identifier, { timeoutMs: opts.timeoutMs, userAgent: opts.userAgent, signal: input.signal });

        const findings = parseOfaRows(rows, identifier);
        return {
          ...base,
          status: findings.length > 0 ? 'FOUND' : 'NOT_FOUND',
          findings,
          matchedName: rows.find((r) => r.registeredName)?.registeredName ?? null,
          durationMs: Date.now() - startedAt,
          raw: rows,
        };
      } catch (err) {
        // Could not ask ≠ the answer is no. This distinction is the whole
        // reason UNAVAILABLE exists as a separate status.
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

/**
 * Live transport.
 *
 * OFA's public search is a server-rendered table. The extraction below is
 * intentionally forgiving — it looks for the data it needs and ignores layout
 * — because a markup change should degrade to NOT_FOUND, never to a wrong
 * result silently parsed out of the wrong column.
 */
async function fetchOfaRows(
  identifier: string,
  opts: { timeoutMs?: number; userAgent?: string; signal?: AbortSignal },
): Promise<OfaRow[]> {
  const url = `https://ofa.org/advanced-search/?f=${encodeURIComponent(identifier)}`;
  const res = await fetchText(url, {
    signal: opts.signal,
    config: { timeoutMs: opts.timeoutMs ?? 8000, userAgent: opts.userAgent ?? undefined },
  });
  if (!res.ok) return [];
  return extractOfaRows(res.body);
}

/**
 * Pull rows out of an OFA results page.
 *
 * Exported for replay against captured HTML. If the structure is not what we
 * expect, this returns an empty array — which surfaces as NOT_FOUND and a
 * reconciliation flag, rather than as a confidently wrong finding.
 */
export function extractOfaRows(html: string): OfaRow[] {
  const rows: OfaRow[] = [];
  const tableRows = html.match(/<tr[^>]*>[\s\S]*?<\/tr>/gi) ?? [];

  for (const tr of tableRows) {
    const cells = (tr.match(/<td[^>]*>[\s\S]*?<\/td>/gi) ?? []).map((td) =>
      td
        .replace(/<[^>]+>/g, ' ')
        .replace(/&nbsp;/g, ' ')
        .replace(/&amp;/g, '&')
        .replace(/\s+/g, ' ')
        .trim(),
    );
    // Below four columns is a header or a layout row, not a result.
    if (cells.length < 4) continue;

    const [registration, registeredName, application, result, reportDate, ofaNumber] = cells;
    if (!application || !result) continue;
    if (!mapApplicationToClaim(application)) continue;

    rows.push({
      application,
      result,
      registration: registration || null,
      registeredName: registeredName || null,
      reportDate: reportDate || null,
      ofaNumber: ofaNumber || null,
      chicNumber: /CHIC\s*#?\s*(\d+)/i.exec(tr)?.[1] ?? null,
    });
  }
  return rows;
}

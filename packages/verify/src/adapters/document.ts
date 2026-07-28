/**
 * Document adapter — human review of uploaded certificates.
 *
 * Genetic panels (Embark, Wisdom, UC Davis, Paw Print) have no public lookup:
 * the results belong to the owner and arrive as a PDF. So this "source" is a
 * person, and the adapter's job is to pre-fill what OCR can read and then get
 * out of the way.
 *
 * The pre-fill NEVER becomes a verified claim on its own. `lookup()` returns
 * PENDING-shaped output with `mode: 'human'`; a reviewer confirms or corrects
 * every field before anything reaches the verified table. An OCR mis-read that
 * turned "Carrier" into "Clear" and auto-published would be exactly the failure
 * this platform exists to prevent.
 */

import { normalizeResult } from '../normalize.js';
import {
  type ClaimOutcome,
  type ClaimType,
  type LookupInput,
  type LookupResult,
  type SourceAdapter,
  type SourceFinding,
  type SourceMeta,
} from '../types.js';

export const DOCUMENT_META: SourceMeta = {
  id: 'DOCUMENT',
  label: 'Uploaded document',
  homepage: '',
  claimTypes: ['DNA_PANEL', 'DNA_MARKER', 'GENETIC_COI', 'HIP', 'ELBOW', 'CARDIAC', 'EYE_CAER', 'THYROID'],
  // A human-reviewed certificate does not go stale the way a database lookup
  // does — the paper says what it says. Re-review yearly to catch amendments.
  freshnessDays: 365,
  mode: 'human',
};

export type LabProvider = 'EMBARK' | 'WISDOM' | 'UC_DAVIS' | 'PAW_PRINT' | 'OTHER';

export const LAB_LABEL: Record<LabProvider, string> = {
  EMBARK: 'Embark',
  WISDOM: 'Wisdom Panel',
  UC_DAVIS: 'UC Davis VGL',
  PAW_PRINT: 'Paw Print Genetics',
  OTHER: 'Other laboratory',
};

/** Detect which lab produced a certificate, from its OCR text. */
export function detectLab(text: string): LabProvider {
  const v = text.toLowerCase();
  if (/embark/.test(v)) return 'EMBARK';
  if (/wisdom\s*panel|wisdomhealth/.test(v)) return 'WISDOM';
  if (/uc\s*davis|veterinary genetics lab|vgl/.test(v)) return 'UC_DAVIS';
  if (/paw\s*print\s*genetics/.test(v)) return 'PAW_PRINT';
  return 'OTHER';
}

export interface OcrSuggestion {
  claimType: ClaimType;
  markerName: string | null;
  rawResult: string;
  outcome: ClaimOutcome;
  /** 0–1. Below `AUTO_FILL_THRESHOLD` the field is left blank for the reviewer. */
  confidence: number;
  /** The line the suggestion came from, so a reviewer can check it in context. */
  sourceLine: string;
}

/** Below this, we show the line but do not pre-fill a value. */
export const AUTO_FILL_THRESHOLD = 0.6;

const RESULT_WORDS = [
  { re: /\bclear\b|\bnormal\b|\bn\/n\b|homozygous\s+normal/i, weight: 0.9 },
  { re: /\bcarrier\b|\bn\/m\b|heterozygous/i, weight: 0.9 },
  { re: /at[- ]risk|\baffected\b|\bm\/m\b|homozygous\s+(?:mutant|affected)/i, weight: 0.9 },
  { re: /inconclusive|indeterminate|no\s*call/i, weight: 0.7 },
];

/**
 * Pull candidate findings out of OCR text.
 *
 * Line-oriented and deliberately conservative. Every suggestion carries the
 * line it came from and a confidence score; the reviewer sees both. This
 * function's job is to save typing, not to make decisions.
 */
export function suggestFromOcr(text: string): { lab: LabProvider; suggestions: OcrSuggestion[] } {
  const lab = detectLab(text);
  const suggestions: OcrSuggestion[] = [];

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (line.length < 4 || line.length > 200) continue;

    const hit = RESULT_WORDS.find((w) => w.re.test(line));
    if (!hit) continue;

    // The marker is whatever precedes the result on the line — labs format as
    // "Progressive Retinal Atrophy (prcd-PRA) .......... Clear".
    const beforeResult = line.split(hit.re)[0] ?? '';
    const markerName = beforeResult
      .replace(/[.·:\-–—_]{2,}/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    const resultMatch = hit.re.exec(line);
    const rawResult = resultMatch?.[0]?.trim() ?? '';
    if (!rawResult) continue;

    // A line with no marker name is almost certainly a legend or a heading.
    const confidence = markerName.length >= 3 ? hit.weight : hit.weight * 0.5;

    suggestions.push({
      claimType: 'DNA_MARKER',
      markerName: markerName.length >= 3 ? markerName : null,
      rawResult,
      outcome: normalizeResult('DNA_MARKER', rawResult),
      confidence,
      sourceLine: line,
    });
  }

  return { lab, suggestions };
}

export interface ReviewedFinding {
  claimType: ClaimType;
  markerName?: string | null;
  rawResult: string;
  testedAt?: Date | null;
  detail?: string | null;
}

/**
 * Turn a reviewer's confirmed findings into source findings.
 * Called only after a human has signed off — never straight from OCR.
 */
export function findingsFromReview(
  reviewed: readonly ReviewedFinding[],
  lab: LabProvider,
  documentUrl: string | null,
): SourceFinding[] {
  return reviewed.map((r) => ({
    claimType: r.claimType,
    rawResult: r.rawResult,
    outcome: normalizeResult(r.claimType, r.rawResult),
    testedAt: r.testedAt ?? null,
    sourceUrl: documentUrl,
    markerName: r.markerName ?? null,
    detail: [LAB_LABEL[lab], r.detail].filter(Boolean).join(' · ') || null,
  }));
}

export interface DocumentAdapterOptions {
  /** Fetch a review that a human has already completed, if one exists. */
  loadReview?: (
    submissionId: string,
  ) => Promise<{ lab: LabProvider; documentUrl: string | null; findings: ReviewedFinding[] } | null>;
}

/**
 * The document "source".
 *
 * `identifier` here is a submission id, not a registration number. A submission
 * with no completed review returns NOT_FOUND — meaning "no verified findings
 * yet", which is the honest answer while it sits in the queue.
 */
export function createDocumentAdapter(opts: DocumentAdapterOptions = {}): SourceAdapter {
  return {
    meta: DOCUMENT_META,
    async lookup(input: LookupInput): Promise<LookupResult> {
      const startedAt = Date.now();
      const base = { source: 'DOCUMENT' as const, checkedAt: new Date(), matchedIdentifier: input.identifier };

      if (!opts.loadReview) {
        return {
          ...base,
          status: 'UNAVAILABLE',
          findings: [],
          durationMs: Date.now() - startedAt,
          error: 'No review loader configured.',
        };
      }

      try {
        const review = await opts.loadReview(input.identifier);
        if (!review || review.findings.length === 0) {
          return { ...base, status: 'NOT_FOUND', findings: [], durationMs: Date.now() - startedAt };
        }
        return {
          ...base,
          status: 'FOUND',
          findings: findingsFromReview(review.findings, review.lab, review.documentUrl),
          durationMs: Date.now() - startedAt,
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

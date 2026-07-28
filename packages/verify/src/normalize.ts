/**
 * Result normalisation.
 *
 * Every source phrases its findings differently. OFA grades hips
 * Excellent/Good/Fair; PennHIP gives a distraction index; BVA gives a numeric
 * hip score out of 106. A buyer filtering for "verified normal hips" needs all
 * three to answer the same question.
 *
 * Two rules govern this file:
 *
 *   1. The verbatim result is ALWAYS retained alongside the normalised one.
 *      Normalisation is a convenience for filtering, never a replacement for
 *      what the source actually said.
 *   2. When in doubt, INCONCLUSIVE. Guessing NORMAL is the failure that
 *      matters — it is the one that sells a dog.
 */

import { type ClaimOutcome, type ClaimType } from './types.js';

const clean = (s: string) => s.trim().toLowerCase().replace(/\s+/g, ' ');

// ── OFA hips ────────────────────────────────────────────────────────────────
// Excellent / Good / Fair are all normal phenotypes and all breedable.
// Borderline means "come back in six months". Mild/Moderate/Severe are dysplastic.
function normalizeHip(raw: string): ClaimOutcome {
  const v = clean(raw);
  if (/\b(excellent|good|fair)\b/.test(v)) return 'NORMAL';
  if (/\bborderline\b/.test(v)) return 'INCONCLUSIVE';
  if (/\b(mild|moderate|severe)\b/.test(v)) return 'ABNORMAL';
  if (/\bnormal\b/.test(v)) return 'NORMAL';
  // PennHIP reports a distraction index; lower is tighter. There is no
  // universal cutoff — it is breed-relative — so we refuse to grade it.
  if (/\bdi\b|distraction/.test(v)) return 'INFORMATIONAL';
  // BVA/KC total hip score out of 106. Breed median is the reference point,
  // which we do not hold here.
  if (/^\d{1,3}\s*\/\s*\d{1,3}$/.test(v) || /hip score/.test(v)) return 'INFORMATIONAL';
  return 'INCONCLUSIVE';
}

// ── OFA elbows ──────────────────────────────────────────────────────────────
function normalizeElbow(raw: string): ClaimOutcome {
  const v = clean(raw);
  if (/\bnormal\b/.test(v)) return 'NORMAL';
  if (/grade\s*(i{1,3}|1|2|3)\b/.test(v)) return 'ABNORMAL';
  if (/\bdjd\b|dysplas/.test(v)) return 'ABNORMAL';
  return 'INCONCLUSIVE';
}

// ── Cardiac ─────────────────────────────────────────────────────────────────
// OFA cardiac comes in Basic, Advanced and Congenital tiers. "Equivocal" is a
// real result and is not a pass.
function normalizeCardiac(raw: string): ClaimOutcome {
  const v = clean(raw);
  if (/\bequivocal\b/.test(v)) return 'INCONCLUSIVE';
  if (/\bnormal\b/.test(v)) return 'NORMAL';
  if (/\babnormal\b|murmur|stenosis|cardiomyopathy/.test(v)) return 'ABNORMAL';
  return 'INCONCLUSIVE';
}

// ── Eyes (CAER) ─────────────────────────────────────────────────────────────
function normalizeEye(raw: string): ClaimOutcome {
  const v = clean(raw);
  // Breeder-option findings are noted on an otherwise clear exam. They are
  // real findings, so they are not NORMAL — but they are not disqualifying
  // either. INFORMATIONAL keeps them visible without grading them.
  if (/breeder option/.test(v)) return 'INFORMATIONAL';
  if (/\bnormal\b|\bclear\b|no (?:significant )?(?:ocular )?(?:findings|abnormalities)/.test(v)) {
    return 'NORMAL';
  }
  if (/\babnormal\b|cataract|pra|retinal|distichia|entropion|ectropion/.test(v)) return 'ABNORMAL';
  return 'INCONCLUSIVE';
}

// ── Patella / shoulder / LCP ────────────────────────────────────────────────
function normalizeGradedOrthopedic(raw: string): ClaimOutcome {
  const v = clean(raw);
  if (/\bnormal\b/.test(v)) return 'NORMAL';
  if (/grade\s*(i{1,4}|[1-4])\b/.test(v) || /luxat/.test(v)) return 'ABNORMAL';
  return 'INCONCLUSIVE';
}

// ── Thyroid ─────────────────────────────────────────────────────────────────
function normalizeThyroid(raw: string): ClaimOutcome {
  const v = clean(raw);
  if (/\bnormal\b/.test(v)) return 'NORMAL';
  if (/equivocal|idiopathic/.test(v)) return 'INCONCLUSIVE';
  if (/thyroiditis|autoimmune|hypothyroid/.test(v)) return 'ABNORMAL';
  return 'INCONCLUSIVE';
}

// ── Hearing (BAER) ──────────────────────────────────────────────────────────
function normalizeHearing(raw: string): ClaimOutcome {
  const v = clean(raw);
  if (/bilateral(?:ly)? (?:normal|hearing)/.test(v) || /^normal/.test(v)) return 'NORMAL';
  if (/unilateral/.test(v)) return 'ABNORMAL';
  if (/bilateral(?:ly)? deaf|\bdeaf\b/.test(v)) return 'ABNORMAL';
  return 'INCONCLUSIVE';
}

// ── Genetic markers ─────────────────────────────────────────────────────────
// Carrier status is NOT a failure. A carrier bred to a clear dog produces no
// affected puppies, and treating carriers as disqualifying is how breeds lose
// genetic diversity. So `CARRIER` is its own outcome, not a flavour of
// ABNORMAL — and the UI must never colour it like one.
function normalizeGenetic(raw: string): ClaimOutcome {
  const v = clean(raw);
  if (/\bclear\b|\bnormal\b|homozygous normal|n\/n\b|not? at risk/.test(v)) return 'NORMAL';
  if (/\bcarrier\b|heterozygous|n\/m\b/.test(v)) return 'CARRIER';
  if (/at risk|\baffected\b|homozygous (?:mutant|affected)|m\/m\b/.test(v)) return 'AT_RISK';
  if (/inconclusive|indeterminate|no call/.test(v)) return 'INCONCLUSIVE';
  return 'INCONCLUSIVE';
}

// ── Titles and registration ─────────────────────────────────────────────────
// A title is a fact of record, not a grade. It is INFORMATIONAL by definition.
function normalizeTitle(): ClaimOutcome {
  return 'INFORMATIONAL';
}

function normalizeRegistration(raw: string): ClaimOutcome {
  const v = clean(raw);
  if (/\b(active|valid|registered|current)\b/.test(v)) return 'NORMAL';
  if (/\b(revoked|suspended|invalid|cancelled|canceled)\b/.test(v)) return 'ABNORMAL';
  return 'INFORMATIONAL';
}

const NORMALIZERS: Partial<Record<ClaimType, (raw: string) => ClaimOutcome>> = {
  HIP: normalizeHip,
  ELBOW: normalizeElbow,
  CARDIAC: normalizeCardiac,
  EYE_CAER: normalizeEye,
  PATELLA: normalizeGradedOrthopedic,
  SHOULDER: normalizeGradedOrthopedic,
  LEGG_CALVE_PERTHES: normalizeGradedOrthopedic,
  THYROID: normalizeThyroid,
  HEARING_BAER: normalizeHearing,
  DENTITION: normalizeGradedOrthopedic,
  TRACHEA: normalizeGradedOrthopedic,
  DNA_PANEL: normalizeGenetic,
  DNA_MARKER: normalizeGenetic,
  REGISTRATION: normalizeRegistration,
};

/**
 * Map a source's verbatim result to a comparable outcome.
 * The verbatim string is always kept; this is only for filtering and colour.
 */
export function normalizeResult(claimType: ClaimType, rawResult: string): ClaimOutcome {
  if (!rawResult?.trim()) return 'INCONCLUSIVE';
  const fn = NORMALIZERS[claimType];
  if (fn) return fn(rawResult);
  if (claimType.startsWith('TITLE_') || claimType.startsWith('NAVHDA_')) return normalizeTitle();
  if (claimType === 'CHIC' || claimType === 'DNA_PROFILE' || claimType === 'GENETIC_COI') {
    return 'INFORMATIONAL';
  }
  return 'INCONCLUSIVE';
}

/**
 * Is this outcome a reason to look harder before breeding?
 * Used for at-risk flagging in trial pairings (Phase 4). Carrier status
 * deliberately does NOT count — see `normalizeGenetic`.
 */
export function isConcerning(outcome: ClaimOutcome): boolean {
  return outcome === 'ABNORMAL' || outcome === 'AT_RISK';
}

/** OFA numbers look like `GR-1234G24M-VPI` or `SR12345601`. Normalise loosely. */
export function normalizeIdentifier(raw: string): string {
  return raw.trim().toUpperCase().replace(/\s+/g, '');
}

/** Two identifiers are the same if they match ignoring punctuation and case. */
export function identifiersMatch(a: string, b: string): boolean {
  const strip = (s: string) => s.toUpperCase().replace(/[^A-Z0-9]/g, '');
  return strip(a) === strip(b);
}

/**
 * Genetic risk for a proposed pairing.
 *
 * This is the feature that justifies having built the verification engine
 * first. Once both dogs' genetic panels are verified claims rather than
 * someone's recollection, the Mendelian arithmetic is trivial — and it answers
 * the one question that actually prevents affected puppies:
 *
 *   **Are these two both carriers of the same recessive?**
 *
 * A carrier bred to a clear dog produces no affected puppies. Two carriers
 * produce 25% affected. That single distinction is why `CARRIER` is its own
 * outcome throughout this codebase and why it is never coloured like a
 * failure — the goal is to stop carrier × carrier matings, not to drive
 * carriers out of the gene pool.
 *
 * Pure module. No I/O.
 */

import { type ClaimOutcome } from './types.js';

export type ZygosityStatus = 'CLEAR' | 'CARRIER' | 'AFFECTED' | 'UNKNOWN';

/**
 * Map a verified claim outcome to a genotype.
 *
 * Anything we cannot read confidently becomes UNKNOWN, which produces a
 * "cannot rule out" result rather than a clean bill of health. Silence is not
 * a clear result.
 */
export function zygosityFromOutcome(outcome: ClaimOutcome | null | undefined): ZygosityStatus {
  switch (outcome) {
    case 'NORMAL':
      return 'CLEAR';
    case 'CARRIER':
      return 'CARRIER';
    case 'AT_RISK':
    case 'ABNORMAL':
      return 'AFFECTED';
    default:
      return 'UNKNOWN';
  }
}

export type InheritanceMode = 'AUTOSOMAL_RECESSIVE' | 'AUTOSOMAL_DOMINANT' | 'X_LINKED' | 'UNKNOWN';

export interface MendelianOutcome {
  /** Probability a given puppy is affected, 0–1. */
  affected: number;
  /** Probability a given puppy is a carrier (recessive modes only). */
  carrier: number;
  /** Probability a given puppy is clear. */
  clear: number;
}

/**
 * Punnett arithmetic for an autosomal recessive.
 *
 * The classic table. Written out rather than computed so it can be read and
 * checked against a textbook by someone who is not a programmer.
 */
function recessiveOutcome(sire: ZygosityStatus, dam: ZygosityStatus): MendelianOutcome | null {
  const key = `${sire}×${dam}`;
  const table: Record<string, MendelianOutcome> = {
    'CLEAR×CLEAR': { affected: 0, carrier: 0, clear: 1 },
    'CLEAR×CARRIER': { affected: 0, carrier: 0.5, clear: 0.5 },
    'CARRIER×CLEAR': { affected: 0, carrier: 0.5, clear: 0.5 },
    'CLEAR×AFFECTED': { affected: 0, carrier: 1, clear: 0 },
    'AFFECTED×CLEAR': { affected: 0, carrier: 1, clear: 0 },
    // The one that matters.
    'CARRIER×CARRIER': { affected: 0.25, carrier: 0.5, clear: 0.25 },
    'CARRIER×AFFECTED': { affected: 0.5, carrier: 0.5, clear: 0 },
    'AFFECTED×CARRIER': { affected: 0.5, carrier: 0.5, clear: 0 },
    'AFFECTED×AFFECTED': { affected: 1, carrier: 0, clear: 0 },
  };
  return table[key] ?? null;
}

/**
 * Dominant conditions: one copy is enough. A dog carrying a dominant is
 * affected by definition, so "carrier" is not a meaningful state.
 */
function dominantOutcome(sire: ZygosityStatus, dam: ZygosityStatus): MendelianOutcome | null {
  const affectedParents = [sire, dam].filter((s) => s === 'AFFECTED' || s === 'CARRIER').length;
  if (sire === 'UNKNOWN' || dam === 'UNKNOWN') return null;
  if (affectedParents === 0) return { affected: 0, carrier: 0, clear: 1 };
  // Heterozygous × clear → 50%. Both heterozygous → 75%.
  if (affectedParents === 1) return { affected: 0.5, carrier: 0, clear: 0.5 };
  return { affected: 0.75, carrier: 0, clear: 0.25 };
}

export type RiskLevel = 'NONE' | 'CARRIERS_PRODUCED' | 'AT_RISK' | 'UNKNOWN';

export interface MarkerRisk {
  markerName: string;
  claimType: string;
  mode: InheritanceMode;
  sireStatus: ZygosityStatus;
  damStatus: ZygosityStatus;
  /** Null when either side is unknown. */
  outcome: MendelianOutcome | null;
  level: RiskLevel;
  /** Plain-language explanation. Shown verbatim; no further interpretation. */
  message: string;
  /** Which side needs testing, when that is the gap. */
  untestedSide: 'SIRE' | 'DAM' | 'BOTH' | null;
}

export interface GeneticClaimInput {
  claimType: string;
  markerName: string;
  outcome: ClaimOutcome | null;
  /** Only VERIFIED claims should be passed in. Reported ones are not evidence. */
  state?: string;
}

export interface PairingRiskResult {
  markers: MarkerRisk[];
  /** Markers where both parents are carriers — the ones that matter. */
  atRisk: MarkerRisk[];
  /** Markers where a clear result on one side means no affected puppies. */
  safe: MarkerRisk[];
  /** Markers tested on one side only, or on neither. */
  unknown: MarkerRisk[];
  /** Highest risk level present. */
  worst: RiskLevel;
  summary: string;
}

/**
 * Inheritance mode by marker.
 *
 * The overwhelming majority of tested canine conditions are autosomal
 * recessive, which is why that is the default. Known exceptions are listed;
 * anything unrecognised is treated as recessive AND flagged as an assumption
 * in the message, rather than silently assumed.
 */
const KNOWN_DOMINANT = [/\bmdr1\b/i, /degenerative myelopathy exon/i];
const KNOWN_X_LINKED = [/\bhemophilia\b/i, /x-linked/i];

export function inheritanceModeFor(markerName: string): InheritanceMode {
  if (KNOWN_X_LINKED.some((re) => re.test(markerName))) return 'X_LINKED';
  if (KNOWN_DOMINANT.some((re) => re.test(markerName))) return 'AUTOSOMAL_DOMINANT';
  return 'AUTOSOMAL_RECESSIVE';
}

function normaliseMarker(name: string): string {
  return name.trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

/**
 * Evaluate a proposed pairing against both dogs' verified genetic claims.
 *
 * Only VERIFIED claims count. A reported "he's clear" is not evidence, and
 * treating it as such would let the one feature that prevents affected puppies
 * be defeated by a sentence someone typed into a form.
 */
export function assessPairingRisk(
  sireClaims: readonly GeneticClaimInput[],
  damClaims: readonly GeneticClaimInput[],
): PairingRiskResult {
  const verified = (claims: readonly GeneticClaimInput[]) =>
    claims.filter((c) => !c.state || c.state === 'VERIFIED' || c.state === 'STALE');

  const sireBy = new Map(verified(sireClaims).map((c) => [normaliseMarker(c.markerName), c]));
  const damBy = new Map(verified(damClaims).map((c) => [normaliseMarker(c.markerName), c]));

  const allMarkers = new Set([...sireBy.keys(), ...damBy.keys()]);
  const markers: MarkerRisk[] = [];

  for (const key of allMarkers) {
    const sireClaim = sireBy.get(key);
    const damClaim = damBy.get(key);
    const markerName = sireClaim?.markerName ?? damClaim?.markerName ?? key;
    const mode = inheritanceModeFor(markerName);

    const sireStatus = sireClaim ? zygosityFromOutcome(sireClaim.outcome) : 'UNKNOWN';
    const damStatus = damClaim ? zygosityFromOutcome(damClaim.outcome) : 'UNKNOWN';

    const outcome =
      mode === 'AUTOSOMAL_DOMINANT'
        ? dominantOutcome(sireStatus, damStatus)
        : recessiveOutcome(sireStatus, damStatus);

    const untestedSide =
      sireStatus === 'UNKNOWN' && damStatus === 'UNKNOWN'
        ? ('BOTH' as const)
        : sireStatus === 'UNKNOWN'
          ? ('SIRE' as const)
          : damStatus === 'UNKNOWN'
            ? ('DAM' as const)
            : null;

    let level: RiskLevel;
    let message: string;

    if (!outcome) {
      level = 'UNKNOWN';
      message =
        untestedSide === 'BOTH'
          ? `Neither dog has a verified result for ${markerName}. This pairing cannot be cleared for it.`
          : `Only the ${untestedSide === 'SIRE' ? 'dam' : 'sire'} has a verified result for ${markerName}. Test the ${untestedSide === 'SIRE' ? 'sire' : 'dam'} before breeding to rule it out.`;
    } else if (outcome.affected > 0) {
      level = 'AT_RISK';
      message =
        sireStatus === 'CARRIER' && damStatus === 'CARRIER'
          ? `Both dogs are carriers of ${markerName}. Around ${Math.round(outcome.affected * 100)}% of puppies would be affected and ${Math.round(outcome.carrier * 100)}% carriers.`
          : `${Math.round(outcome.affected * 100)}% of puppies would be affected by ${markerName} (${sireStatus.toLowerCase()} sire × ${damStatus.toLowerCase()} dam).`;
    } else if (outcome.carrier > 0) {
      level = 'CARRIERS_PRODUCED';
      message = `No affected puppies from this pairing for ${markerName}, but around ${Math.round(outcome.carrier * 100)}% would be carriers. Worth disclosing to buyers who may breed on.`;
    } else {
      level = 'NONE';
      message = `Both dogs are clear of ${markerName}. No affected puppies and no carriers.`;
    }

    if (mode === 'AUTOSOMAL_RECESSIVE' && !KNOWN_DOMINANT.some((re) => re.test(markerName))) {
      // Say when we are assuming, rather than assuming silently.
      if (!/pra|prcd|dm|cea|ic|vwd|cd\b/i.test(markerName)) {
        message += ' Assumed autosomal recessive — confirm the inheritance mode for this marker.';
      }
    }

    markers.push({
      markerName,
      claimType: sireClaim?.claimType ?? damClaim?.claimType ?? 'DNA_MARKER',
      mode,
      sireStatus,
      damStatus,
      outcome,
      level,
      message,
      untestedSide,
    });
  }

  const order: RiskLevel[] = ['AT_RISK', 'UNKNOWN', 'CARRIERS_PRODUCED', 'NONE'];
  markers.sort((a, b) => order.indexOf(a.level) - order.indexOf(b.level) || a.markerName.localeCompare(b.markerName));

  const atRisk = markers.filter((m) => m.level === 'AT_RISK');
  const unknown = markers.filter((m) => m.level === 'UNKNOWN');
  const safe = markers.filter((m) => m.level === 'NONE' || m.level === 'CARRIERS_PRODUCED');

  const worst: RiskLevel =
    atRisk.length > 0 ? 'AT_RISK' : unknown.length > 0 ? 'UNKNOWN' : markers.length > 0 ? 'NONE' : 'UNKNOWN';

  const summary =
    markers.length === 0
      ? 'Neither dog has verified genetic results, so nothing can be ruled in or out.'
      : atRisk.length > 0
        ? `${atRisk.length} marker${atRisk.length === 1 ? '' : 's'} would produce affected puppies. This is the finding that matters — everything else on this page is secondary to it.`
        : unknown.length > 0
          ? `Nothing at risk among the ${safe.length} marker${safe.length === 1 ? '' : 's'} both dogs have been tested for, but ${unknown.length} could not be checked.`
          : `Both dogs are tested and clear across all ${markers.length} shared marker${markers.length === 1 ? '' : 's'}.`;

  return { markers, atRisk, safe, unknown, worst, summary };
}

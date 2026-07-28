/**
 * Trial pairing — evaluate a mating that does not exist yet.
 *
 * This is the feature nobody else in the category has, so it is worth being
 * careful about what it claims. It answers three questions and refuses to
 * answer a fourth:
 *
 *   · How inbred would the litter be?           (projected COI)
 *   · Which ancestors are causing that?         (path contributions)
 *   · How much should we trust those numbers?   (pedigree completeness)
 *
 * It does NOT say whether the pairing is a good idea. That is a breeder's
 * judgement, informed by health testing, type, temperament and a hundred
 * things not in a pedigree graph.
 *
 * Pure module. (Invariant 1.)
 */

import {
  type AncestorContribution,
  type CompletenessResult,
  completeness,
  inbreedingCoefficient,
  kinship,
  pathContributions,
  projectedLitterCoi,
  relatedness,
} from './coi.js';
import { type DogId, type PedigreeGraph, isAncestorOf } from './graph.js';

/**
 * Bands for presenting a COI. These are conventions, not law — different
 * breeds and different registries draw the lines differently — so the copy
 * that goes with them must never read as a verdict.
 */
export type CoiBand = 'MINIMAL' | 'LOW' | 'MODERATE' | 'HIGH' | 'VERY_HIGH';

export function coiBand(coi: number): CoiBand {
  if (coi < 0.0325) return 'MINIMAL'; // below ~half-cousin
  if (coi < 0.0625) return 'LOW'; // below first cousins
  if (coi < 0.125) return 'MODERATE'; // below half-siblings
  if (coi < 0.25) return 'HIGH'; // below full siblings
  return 'VERY_HIGH'; // full-sib / parent-offspring and closer
}

export const COI_BAND_COPY: Record<CoiBand, { label: string; detail: string }> = {
  MINIMAL: {
    label: 'Minimal',
    detail: 'Below the equivalent of a half-cousin mating.',
  },
  LOW: {
    label: 'Low',
    detail: 'Below the equivalent of a first-cousin mating.',
  },
  MODERATE: {
    label: 'Moderate',
    detail: 'Between a first-cousin and a half-sibling mating. Common in closed breeds.',
  },
  HIGH: {
    label: 'High',
    detail: 'Between a half-sibling and a full-sibling mating.',
  },
  VERY_HIGH: {
    label: 'Very high',
    detail: 'At or above a full-sibling mating. Worth a hard look before proceeding.',
  },
};

/** How close the two animals are, in words a breeder would use. */
export type RelationshipKind =
  | 'UNRELATED'
  | 'DISTANT'
  | 'COUSINS'
  | 'HALF_SIBLINGS'
  | 'FULL_SIBLINGS'
  | 'PARENT_OFFSPRING'
  | 'GRANDPARENT_GRANDOFFSPRING';

export interface TrialPairing {
  sireId: DogId;
  damId: DogId;

  /** F of a hypothetical offspring. The headline number. */
  projectedCoi: number;
  coiBand: CoiBand;

  /** How much genome the two parents already share. */
  relatedness: number;
  relationship: RelationshipKind;

  /** Each parent's own inbreeding — context for the projected figure. */
  sireCoi: number;
  damCoi: number;

  /** Which ancestors drive the projected COI, largest first. */
  contributions: AncestorContribution[];
  /** Set when the path search was bounded; the COI itself is still exact. */
  contributionsTruncated: boolean;

  /** Trust context. Never render `projectedCoi` without these. */
  sireCompleteness: CompletenessResult;
  damCompleteness: CompletenessResult;
  /**
   * The binding constraint on how much the COI means. A 12% COI computed from
   * a 40%-complete pedigree is a floor, not a measurement.
   */
  confidence: 'HIGH' | 'MODERATE' | 'LOW' | 'INSUFFICIENT';
  confidenceNote: string;

  /** Generations the calculation actually walked. */
  generations: number;
}

function classifyRelationship(
  graph: PedigreeGraph,
  a: DogId,
  b: DogId,
  r: number,
): RelationshipKind {
  if (isAncestorOf(graph, a, b) || isAncestorOf(graph, b, a)) {
    const { nodes } = graph;
    const aNode = nodes.get(a);
    const bNode = nodes.get(b);
    const isParent =
      bNode?.sireId === a || bNode?.damId === a || aNode?.sireId === b || aNode?.damId === b;
    return isParent ? 'PARENT_OFFSPRING' : 'GRANDPARENT_GRANDOFFSPRING';
  }
  if (r >= 0.45) return 'FULL_SIBLINGS';
  if (r >= 0.2) return 'HALF_SIBLINGS';
  if (r >= 0.08) return 'COUSINS';
  if (r > 0.001) return 'DISTANT';
  return 'UNRELATED';
}

export const RELATIONSHIP_COPY: Record<RelationshipKind, string> = {
  UNRELATED: 'No shared ancestors in the pedigree we hold',
  DISTANT: 'Distantly related',
  COUSINS: 'Cousin-level relationship',
  HALF_SIBLINGS: 'Half-sibling level relationship',
  FULL_SIBLINGS: 'Full-sibling level relationship',
  PARENT_OFFSPRING: 'Parent and offspring',
  GRANDPARENT_GRANDOFFSPRING: 'One is an ancestor of the other',
};

/**
 * Confidence is driven by the WORSE of the two pedigrees. A perfect sire
 * pedigree does not rescue a dam with two unknown grandparents — the shared
 * ancestry you cannot see is exactly the ancestry that matters.
 */
function assessConfidence(
  sire: CompletenessResult,
  dam: CompletenessResult,
): { confidence: TrialPairing['confidence']; note: string } {
  const worstEquivalent = Math.min(sire.generationEquivalent, dam.generationEquivalent);
  const worstRatio = Math.min(sire.ratio, dam.ratio);

  if (worstEquivalent < 1.5) {
    return {
      confidence: 'INSUFFICIENT',
      note: 'Not enough pedigree to compute a meaningful COI. Fewer than two complete generations are on file for at least one of these dogs — a result of 0% here means "unknown", not "unrelated".',
    };
  }
  if (worstEquivalent < 3 || worstRatio < 0.5) {
    return {
      confidence: 'LOW',
      note: 'Shallow pedigree on at least one side. Treat this figure as a floor: shared ancestry above the known generations cannot be counted.',
    };
  }
  if (worstEquivalent < 4.5 || worstRatio < 0.8) {
    return {
      confidence: 'MODERATE',
      note: 'Reasonable depth, with gaps. Filling the missing ancestors can only move this number up, never down.',
    };
  }
  return {
    confidence: 'HIGH',
    note: 'Both pedigrees are deep and near-complete over the generations used.',
  };
}

export function evaluatePairing(
  graph: PedigreeGraph,
  sireId: DogId,
  damId: DogId,
  opts: { generations?: number; maxPathsPerAncestor?: number } = {},
): TrialPairing {
  const generations = opts.generations ?? 8;
  const cache = new Map<string, number>();

  const projectedCoi = projectedLitterCoi(graph, sireId, damId, cache);
  const r = relatedness(graph, sireId, damId, cache);
  const paths = pathContributions(graph, sireId, damId, {
    maxGenerations: generations,
    maxPathsPerAncestor: opts.maxPathsPerAncestor,
  });

  const sireCompleteness = completeness(graph, sireId, generations);
  const damCompleteness = completeness(graph, damId, generations);
  const { confidence, note } = assessConfidence(sireCompleteness, damCompleteness);

  return {
    sireId,
    damId,
    projectedCoi,
    coiBand: coiBand(projectedCoi),
    relatedness: r,
    relationship: classifyRelationship(graph, sireId, damId, r),
    sireCoi: inbreedingCoefficient(graph, sireId, cache),
    damCoi: inbreedingCoefficient(graph, damId, cache),
    contributions: paths.contributions,
    contributionsTruncated: paths.truncated,
    sireCompleteness,
    damCompleteness,
    confidence,
    confidenceNote: note,
    generations,
  };
}

/**
 * Rank several prospective sires against one dam, lowest projected COI first.
 * Used by the stud shortlist in Phase 4.
 */
export function rankSires(
  graph: PedigreeGraph,
  damId: DogId,
  sireIds: readonly DogId[],
  opts: { generations?: number } = {},
): { sireId: DogId; projectedCoi: number; band: CoiBand; sharedAncestors: number }[] {
  const cache = new Map<string, number>();
  const generations = opts.generations ?? 8;
  return sireIds
    .map((sireId) => {
      const coi = kinship(graph, sireId, damId, cache);
      const shared = pathContributions(graph, sireId, damId, {
        maxGenerations: generations,
        maxPathsPerAncestor: 500,
      });
      return {
        sireId,
        projectedCoi: coi,
        band: coiBand(coi),
        sharedAncestors: shared.contributions.length,
      };
    })
    .sort((a, b) => a.projectedCoi - b.projectedCoi || a.sireId.localeCompare(b.sireId));
}

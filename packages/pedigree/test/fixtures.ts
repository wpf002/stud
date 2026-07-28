import { type PedigreeNode } from '../src/graph.js';

/**
 * Hand-checkable pedigrees. Every expected COI below is derivable with a pen
 * from Wright's formula — that is the point. If a refactor breaks one of
 * these, the maths is wrong, not the test.
 */

export const d = (id: string, sireId?: string, damId?: string, sex?: 'MALE' | 'FEMALE'): PedigreeNode => ({
  id,
  sireId: sireId ?? null,
  damId: damId ?? null,
  name: id,
  sex: sex ?? null,
});

/** Two unrelated founders, one offspring. F = 0. */
export const unrelated: PedigreeNode[] = [d('A'), d('B'), d('X', 'A', 'B')];

/**
 * Full-sibling mating. S and D share both parents (A, B).
 * F_X = (½)^3 [via A] + (½)^3 [via B] = 0.25
 */
export const fullSibMating: PedigreeNode[] = [
  d('A', undefined, undefined, 'MALE'),
  d('B', undefined, undefined, 'FEMALE'),
  d('S', 'A', 'B', 'MALE'),
  d('D', 'A', 'B', 'FEMALE'),
  d('X', 'S', 'D'),
];

/**
 * Half-sibling mating. S and D share only sire A.
 * F_X = (½)^3 = 0.125
 */
export const halfSibMating: PedigreeNode[] = [
  d('A', undefined, undefined, 'MALE'),
  d('B1', undefined, undefined, 'FEMALE'),
  d('B2', undefined, undefined, 'FEMALE'),
  d('S', 'A', 'B1', 'MALE'),
  d('D', 'A', 'B2', 'FEMALE'),
  d('X', 'S', 'D'),
];

/**
 * Father × daughter. D's sire is S.
 * Path: S (length 0) to S, D→S (length 1). F_X = (½)^(0+1+1) = 0.25
 */
export const parentOffspring: PedigreeNode[] = [
  d('S', undefined, undefined, 'MALE'),
  d('M', undefined, undefined, 'FEMALE'),
  d('D', 'S', 'M', 'FEMALE'),
  d('X', 'S', 'D'),
];

/**
 * First cousins. S and D have one shared grandparent pair (GS, GD) via
 * different parents.
 * F_X = 2 × (½)^(2+2+1) = 2 × 1/32 = 0.0625
 */
export const firstCousins: PedigreeNode[] = [
  d('GS', undefined, undefined, 'MALE'),
  d('GD', undefined, undefined, 'FEMALE'),
  d('P1', 'GS', 'GD', 'MALE'), // S's sire
  d('P2', 'GS', 'GD', 'FEMALE'), // D's dam
  d('O1', undefined, undefined, 'FEMALE'), // S's dam, unrelated
  d('O2', undefined, undefined, 'MALE'), // D's sire, unrelated
  d('S', 'P1', 'O1', 'MALE'),
  d('D', 'O2', 'P2', 'FEMALE'),
  d('X', 'S', 'D'),
];

/**
 * Half-first-cousins: S and D share exactly one grandparent, GS.
 * F_X = (½)^(2+2+1) = 0.03125
 */
export const halfFirstCousins: PedigreeNode[] = [
  d('GS', undefined, undefined, 'MALE'),
  d('GD1', undefined, undefined, 'FEMALE'),
  d('GD2', undefined, undefined, 'FEMALE'),
  d('P1', 'GS', 'GD1', 'MALE'),
  d('P2', 'GS', 'GD2', 'FEMALE'),
  d('O1', undefined, undefined, 'FEMALE'),
  d('O2', undefined, undefined, 'MALE'),
  d('S', 'P1', 'O1', 'MALE'),
  d('D', 'O2', 'P2', 'FEMALE'),
  d('X', 'S', 'D'),
];

/**
 * An INBRED common ancestor. A is itself a full-sib product (F_A = 0.25),
 * and X is the product of a half-sib mating through A.
 * F_X = (½)^3 × (1 + F_A) = 0.125 × 1.25 = 0.15625
 *
 * This is the case that catches implementations which forget the (1 + F_A)
 * term — they return 0.125 and look plausible.
 */
export const inbredCommonAncestor: PedigreeNode[] = [
  d('GG1', undefined, undefined, 'MALE'),
  d('GG2', undefined, undefined, 'FEMALE'),
  d('AF', 'GG1', 'GG2', 'MALE'), // A's sire
  d('AM', 'GG1', 'GG2', 'FEMALE'), // A's dam — full sibs
  d('A', 'AF', 'AM', 'MALE'), // F_A = 0.25
  d('B1', undefined, undefined, 'FEMALE'),
  d('B2', undefined, undefined, 'FEMALE'),
  d('S', 'A', 'B1', 'MALE'),
  d('D', 'A', 'B2', 'FEMALE'),
  d('X', 'S', 'D'),
];

/**
 * Two generations of full-sib mating.
 * Gen 1: S1 × D1 (full sibs) → F = 0.25 for both S2 and D2.
 * S2 and D2 are themselves full sibs out of the same parents.
 * F_X = ½(1 + F_parent) ... via the coancestry route:
 *   f(S2,D2) = ½·f(S1,S1) ... worked through in the test.
 * Expected: 0.375
 */
export const doubledFullSib: PedigreeNode[] = [
  d('A', undefined, undefined, 'MALE'),
  d('B', undefined, undefined, 'FEMALE'),
  d('S1', 'A', 'B', 'MALE'),
  d('D1', 'A', 'B', 'FEMALE'),
  d('S2', 'S1', 'D1', 'MALE'),
  d('D2', 'S1', 'D1', 'FEMALE'),
  d('X', 'S2', 'D2'),
];

/**
 * A realistic five-generation GSP pedigree with two line-bred ancestors.
 * Used for the Phase 1 gate: import five generations, render, compute a COI.
 *
 * Structure: `MARSHKING` appears at generation 4 on both sides, and
 * `WILLOW` appears twice on the sire side.
 */
export function fiveGenerationGsp(): PedigreeNode[] {
  const nodes: PedigreeNode[] = [];
  const add = (id: string, sire?: string, dam?: string, sex?: 'MALE' | 'FEMALE') => {
    nodes.push(d(id, sire, dam, sex));
  };

  // Gen 5 founders
  for (const id of ['F1', 'F2', 'F3', 'F4', 'F5', 'F6', 'F7', 'F8', 'F9', 'F10']) {
    add(id, undefined, undefined, id.endsWith('1') || Number(id.slice(1)) % 2 === 1 ? 'MALE' : 'FEMALE');
  }
  add('MARSHKING', 'F1', 'F2', 'MALE');
  add('WILLOW', 'F3', 'F4', 'FEMALE');

  // Gen 4 → 3
  add('G3A', 'MARSHKING', 'WILLOW', 'MALE');
  add('G3B', 'F5', 'WILLOW', 'FEMALE'); // WILLOW repeats
  add('G3C', 'MARSHKING', 'F6', 'MALE'); // MARSHKING repeats
  add('G3D', 'F7', 'F8', 'FEMALE');

  // Gen 2
  add('GRANDSIRE_S', 'G3A', 'G3B', 'MALE');
  add('GRANDDAM_S', 'F9', 'F10', 'FEMALE');
  add('GRANDSIRE_D', 'G3C', 'G3D', 'MALE');
  add('GRANDDAM_D', 'F5', 'F6', 'FEMALE');

  // Gen 1
  add('SIRE', 'GRANDSIRE_S', 'GRANDDAM_S', 'MALE');
  add('DAM', 'GRANDSIRE_D', 'GRANDDAM_D', 'FEMALE');

  // Subject
  add('RANGER', 'SIRE', 'DAM', 'MALE');
  return nodes;
}

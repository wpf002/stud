/**
 * @stud/pedigree — ancestry graph, inbreeding, relatedness.
 *
 * PURE. No network, no database, no clock, no side effects. It takes a graph
 * and returns numbers. (Invariant 1 — see docs/decisions.md D1.)
 *
 * Zero runtime dependencies, by design.
 */

export * from './graph.js';
export * from './coi.js';
export * from './pairing.js';
export * from './layout.js';
export * from './parse.js';
export * from './dedupe.js';

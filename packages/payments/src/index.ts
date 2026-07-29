/**
 * @stud/payments — money modelling for a vertical no processor has approved yet.
 *
 * Integer cents throughout (invariant 2). Double-entry, append-only ledger.
 * Escrow release derived from the contract's machine-readable clause effects,
 * never from its prose.
 *
 * The provider boundary is the point: everything above it is real, tested and
 * shippable; below it sits a mock, and will keep sitting there until a
 * processor has approved live animal sales in writing. See
 * docs/payments-diligence.md.
 */

export * from './ledger.js';
export * from './schedule.js';
export * from './provider.js';
export * from './pipeline.js';

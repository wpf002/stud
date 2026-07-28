/**
 * @stud/contracts — contract composition, rendering and signature.
 *
 * PURE. No I/O, no clock, no crypto dependency. The caller supplies the time
 * and the request context; this package decides what a document says, whether
 * it is valid, what its hash is, and whether a signature may be taken.
 *
 * The organising idea: a contract is an ordered list of versioned clause
 * instances with bound values, never a blob of edited text. A blob cannot be
 * diffed, cannot be reasoned about by the refund logic, and cannot tell you
 * what changed between the version a party read and the version they signed.
 */

export * from './clauses.js';
export * from './render.js';
export * from './templates.js';
export * from './signature.js';

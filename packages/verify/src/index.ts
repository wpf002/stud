/**
 * @stud/verify — the moat.
 *
 * "Verified" on this platform means a machine checked a claim against the body
 * that issued it, and we recorded which source, what it said, and when we
 * asked. This package is what makes that sentence true.
 *
 * Structure:
 *   types.ts         the vocabulary — states, claim types, outcomes
 *   normalize.ts     source-specific results → comparable outcomes
 *   state-machine.ts pure transition logic, exhaustively enumerated
 *   engine.ts        adapter set, parallel dispatch, cross-source reconciliation
 *   adapters/        one per source, all behind the same interface
 *
 * No persistence lives here. The caller writes the claim and its audit row
 * together, which is what makes the log worth trusting.
 */

export * from './types.js';
export * from './normalize.js';
export * from './state-machine.js';
export * from './pairing-risk.js';
export * from './breed-requirements.js';
export * from './brucellosis.js';
export * from './titles.js';
export * from './engine.js';
export * from './adapters/ofa.js';
export * from './adapters/registry.js';
export * from './adapters/performance.js';
export * from './adapters/document.js';
export * from './adapters/fixture.js';
export { DEFAULT_HTTP_CONFIG, type HttpConfig } from './http.js';
export * from './funnel.js';

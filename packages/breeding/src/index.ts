/**
 * @stud/breeding — the date and weight arithmetic a breeding program runs on.
 *
 * PURE, like @stud/pedigree. No network, no database, no clock — every
 * function that needs the current time takes it as an argument, so every
 * prediction is reproducible and every test is deterministic.
 *
 * The rule that governs this package: a prediction always carries its
 * confidence and its basis. A whelp date derived from a breeding date and one
 * derived from a confirmed ovulation are ten days apart in accuracy, and
 * software that renders them identically is lying to someone who is about to
 * sit up all night.
 */

export * from './dates.js';
export * from './heat.js';
export * from './growth.js';
export * from './health-schedule.js';

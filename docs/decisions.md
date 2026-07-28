# Decisions

Short log. One entry per decision that would otherwise get re-argued.

## D1 — `@stud/pedigree` is a pure package (Phase 0)

**Decision.** The pedigree engine takes a plain graph and returns numbers. No
network, no Prisma import, no `Date.now()` in the calculation path.

**Why.** COI is a number people make breeding decisions on. It has to be
testable against hand-checked cases, reproducible, and auditable. Coupling it to
the database makes all three harder. It also leaves the door open to porting the
hot path if traversal over deep pedigrees becomes a bottleneck.

**Consequence.** Callers are responsible for loading the ancestry graph and
handing it over. `packages/pedigree` has zero runtime dependencies.

## D2 — Money is integer cents (Phase 0)

**Decision.** Every monetary value in the schema, the API and the UI is an
integer number of cents.

**Why.** Floats and money are a known-bad pairing, and this product moves real
deposits against signed contracts. `Decimal` would work but invites
inconsistency at boundaries (JSON, form inputs, third-party SDKs).

**Consequence.** `packages/db/src/money.ts` owns all conversion and formatting.
`splitCents` exists so payment schedules never lose or invent a penny.

## D3 — Verification is a state machine (Phase 0)

**Decision.** `UNVERIFIED | PENDING | VERIFIED | STALE | CONFLICTED`, plus
`REPORTED` for self-attested claims. Never a boolean, never a nullable date.

**Why.** The states we actually need to express are not binary. "It was verified
in 2024 and the source has since changed" is a materially different thing from
"it was never verified", and both are different from "the owner says so".
Collapsing them is how a trust product becomes a marketing product.

**Consequence.** Every transition writes an audit row with source, timestamp and
actor. The UI has a distinct treatment for each state, including absence.

## D4 — The dog record is append-only (Phase 0)

**Decision.** Corrections to verifiable facts create a new row that supersedes
the old one. Nothing verifiable is destructively updated.

**Why.** The record has to survive an ownership transfer and remain
trustworthy. If a breeder can silently edit a health result before a sale, the
record is worth nothing to the buyer who receives it.

**Consequence.** Ownership is a ledger (`DogOwnership` with `startedAt`/`endedAt`).
Verified claims supersede rather than update. Mutable convenience fields
(call name, photos, notes) are exempt — they are not claims.

## D5 — Self-reported and verified data are separate columns (Phase 0)

**Decision.** A claim's owner-entered value and its verified value never occupy
the same field, at any layer.

**Why.** The single most valuable thing we have is that "verified" means
something. The moment a verified value can be overwritten by, or fall back to, a
self-reported one, the badge is a decoration.

**Consequence.** Some UI shows both side by side, and that is correct — a
mismatch between what an owner claims and what the source says is exactly the
signal a buyer wants.

## D6 — Fastify API separate from the Next.js apps (Phase 0)

**Decision.** Business logic lives in a standalone Fastify service. The Next.js
apps are presentation layers that call it.

**Why.** Three clients (web, studio, mobile) need the same logic, and the Expo
app cannot use Next.js server actions. A single API also gives one place for
rate limiting, webhooks and the ingest workers to share.

**Consequence.** Session auth is cookie-based and shared across subdomains via
`COOKIE_DOMAIN`. The Next.js layer holds no auth state of its own.

## D7 — Tailwind v3 with a shared preset, not v4 (Phase 0)

**Decision.** Tailwind 3.4 with `packages/config/tailwind/preset.js`.

**Why.** A JS preset is consumable by both Next.js apps *and* exportable as
plain token values for Expo, chart libraries, PDF export and OG image
generation. v4's CSS-first config does not travel as well across those
non-CSS consumers.

**Consequence.** `packages/ui/src/tokens.ts` mirrors the preset for non-Tailwind
consumers and must be kept in sync.

## D8 — Brand palette borrowed from the two category leaders (Phase 0)

**Decision.** Primary accent is `#0057DE` — Good Dog's blue, taken from their
live stylesheet. Secondary is `#D85C44` — Breedera's terracotta red, likewise.
Ground stays warm (`#FAF7F2`); ink goes cool (`#040416`).

**Why.** Both marks are already doing the work of signalling their category to
exactly the audiences we want. Good Dog's blue reads as consumer trust to
puppy buyers; Breedera's terracotta reads as calm, tactile software to
breeders. Using both puts the two surfaces in one family without inventing a
third visual language nobody recognises.

**Consequence.** There is no green in the system. The verified badge uses the
brand blue rather than a success green — verification is the brand promise, so
the badge and the mark share a colour. Generic `success` maps to the same blue;
`warning` stays amber, `danger` a deeper red than `clay` so the two never read
as the same signal.

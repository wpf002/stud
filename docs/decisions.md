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

## D9 — Ancestry is self-relations on Dog, not an edge table (Phase 1)

**Decision.** `Dog.sireId` and `Dog.damId`, both nullable self-references.

**Why.** The roadmap called for "a proper DAG, not a nested JSON blob", and a
pair of self-references *is* the proper DAG here. Biology gives every dog
exactly one sire and one dam, so the schema can enforce that. An edge table
would permit three sires and require a join for every traversal.

**Consequence.** Cycles are the one thing the shape cannot prevent, so they are
checked before every parent write (`wouldCreateCycle`) and again in
`buildGraph`, which throws `PedigreeCycleError` rather than looping forever.

## D10 — Two independent COI implementations that check each other (Phase 1)

**Decision.** `kinship()` (recursive coancestry) computes the number we report.
`pathContributions()` (Wright's original path method) computes the per-ancestor
breakdown. The test suite asserts they agree on every fixture.

**Why.** COI is the number breeders make decisions on, and a wrong one looks
exactly like a right one. Hand-checked constants catch obvious errors; two
independent algorithms agreeing catches subtle ones. The path method also
answers the question a breeder actually asks — *which* ancestor is doing this —
which the tabular method cannot.

**Consequence.** The path method is exponential in the worst case and is
therefore bounded. When it truncates, the UI says so explicitly: the reported
COI is still exact, only the breakdown is partial.

## D11 — A COI is never rendered without its pedigree completeness (Phase 1)

**Decision.** `CoiReadout` takes both, in one component. There is no way to
ship the number on its own.

**Why.** 0% COI on two known parents and nothing else is not a low COI, it is
no information. Presenting it as a measurement is the single most misleading
thing this product could do — and it would be misleading in the direction that
sells more dogs, which is exactly why it needs a structural guard rather than a
guideline.

**Consequence.** Confidence bands (`HIGH | MODERATE | LOW | INSUFFICIENT`) are
driven by Maignel's complete generation equivalent, and by the *weaker* of the
two pedigrees in a pairing. Empty ancestor slots render in the chart rather
than collapsing.

## D12 — Merged records are superseded, never deleted (Phase 1)

**Decision.** A merge re-points descendants, moves registrations and media,
fills gaps on the survivor, then marks the loser `supersededByDogId` and writes
a `DogSupersession` row.

**Why.** Invariant 4. Someone may already hold a link to the losing record —
in a contract, an email, a printed pedigree. Deleting it breaks that link
silently.

**Consequence.** Every list query filters `supersededByDogId: null`; the detail
route deliberately does not, so an old link still resolves and explains itself.

## D13 — Verified and reported claims are separate TABLES (Phase 2)

**Decision.** `verified_claims` and `reported_claims` are different tables with
different shapes. `ReportedClaim` has no `source`, no `outcome` and no `state`.
There is no code path from one to the other.

**Why.** Invariant 5 said "never share a field". Two nullable columns on one
table would have satisfied the letter of that and failed it in practice — the
first time someone wrote a `COALESCE(verified_result, reported_result)` the
badge would start lying. Separate tables make the wrong thing impossible rather
than merely discouraged.

**Consequence.** The API returns two arrays, never a merged list. `ClaimPanel`
renders them in separate blocks. Promoting a reported claim requires a fresh
source lookup that creates a verified claim of its own.

## D14 — "Could not ask" is not "the answer is no" (Phase 2)

**Decision.** `LookupStatus` distinguishes `NOT_FOUND` from `UNAVAILABLE`,
`DISABLED` and `UNSUPPORTED_IDENTIFIER`. Only `NOT_FOUND` is a negative result.

**Why.** Collapsing them is the single most dangerous shortcut available here.
An OFA outage would demote every verified claim on the platform to unverified,
and it would look exactly like a data-quality improvement.

**Consequence.** `runVerification` returns early on any non-answer without
touching existing claims. Every check is written to `verification_checks`
regardless of status, because "we asked and could not get an answer" is
evidence worth keeping.

## D15 — A conflict does not clear itself (Phase 2)

**Decision.** From `CONFLICTED`, a `SOURCE_CONFIRMED` trigger returns
`CONFLICTED`. Only an explicit admin action closes it.

**Why.** Sources flap. If a later agreeing check silently resolved a conflict,
a discrepancy could appear and vanish without any human ever seeing it — which
is indistinguishable from never having detected it.

**Consequence.** The conflict queue can only shrink through deliberate action,
and every resolution is written to the claim's permanent history with the
admin's name on it. On divergence the HELD value stays in `rawResult` and the
source's new value goes into `conflictRawResult`; overwriting would erase the
comparison the reviewer needs.

## D16 — Live source lookups are off by default (Phase 2)

**Decision.** `VERIFY_LIVE_SOURCES=false`. Adapters are complete but will not
contact third-party sites until the per-source review in
`docs/verification-sources.md` is done.

**Why.** These are public records maintained by non-profits and breed clubs. A
platform whose entire argument is "we check the receipts" does not get to start
by scraping a charity's search endpoint without reading its terms. The standard
we hold breeders to is the standard we hold ourselves to.

**Consequence.** The fixture adapter implements the full contract offline, so
development and CI exercise every layer for real. Switching a source on is a
per-source decision, not a global flag flip.

## D17 — Conflicted claims count against verification density (Phase 2)

**Decision.** `density = verified / (verified + stale + conflicted + reported +
unverified)`.

**Why.** Excluding conflicts from the denominator produced a dog showing "100%
verified" with an open conflict banner on the same screen. The error flattered
the dog, which is the direction errors must never run in a trust product.

**Consequence.** A claim under review drags the number down until a human
resolves it. Concerning outcomes (`AT_RISK`, `ABNORMAL`) are counted in the
summary and displayed, never suppressed.

## D18 — `@stud/breeding` is pure, like `@stud/pedigree` (Phase 3)

**Decision.** All heat prediction, gestation forecasting, progesterone
interpretation, growth assessment and care-schedule generation lives in a pure
package. No clock — every function that needs "now" takes it as an argument.

**Why.** These are the numbers a breeder plans a season around. They have to be
reproducible and testable against hand-worked cases, and a hidden `Date.now()`
makes both impossible. It also means the same functions run in the API, in the
seed, and eventually in a mobile app without a network round trip.

**Consequence.** 52 tests, all deterministic. The route layer never computes a
date itself; it loads records, calls the pure function, and returns the
prediction with its confidence attached.

## D19 — Every prediction carries its basis and confidence (Phase 3)

**Decision.** `forecastWhelp` returns `basis: OVULATION | LH_SURGE |
BREEDING_DATE | NONE` alongside the date, and the UI never renders one without
the other.

**Why.** Gestation is 63 ± 1 days from ovulation and 58–68 days from a breeding
date. Those are the same feature with a tenfold difference in accuracy.
Rendering them identically would be lying to someone who is about to sit up all
night, and it would quietly devalue the progesterone testing that earns the
better number.

**Consequence.** Heat predictions widen their window to two standard deviations
of the bitch's own intervals, floored at a week — no bitch is regular enough to
deserve a three-day promise. A single logged cycle gets a 90-day window and
says so.

## D20 — Progesterone interpolation errs LATE (Phase 3)

**Decision.** When a progesterone series crosses a threshold between two tests,
the crossing is estimated by **log-linear** interpolation and **rounded up**.

**Why.** Two compounding reasons. Progesterone rises roughly exponentially
through this phase, so linear interpolation systematically places the crossing
earlier than it happened. And of the two ways to be wrong, early is far more
expensive: the frozen-semen window is ovulation + 3 to + 4 days, and semen that
survives hours rather than days does not forgive a day of error. Breeding a day
late still catches viable oocytes; a day early misses them entirely.

**Consequence.** A test caught this — the naive implementation returned a day
earlier and looked perfectly reasonable.

## D21 — Growth is assessed against the litter, not a breed curve (Phase 3)

**Decision.** The reference band is a multiple of *this litter's* median birth
weight, and sibling comparison is a first-class output.

**Why.** Relative early growth is remarkably consistent across breeds — a
Chihuahua and a Great Dane both roughly double birth weight by day ten — so an
absolute per-breed curve would need maintaining forever and would still be
wrong for every crossbreed. Meanwhile the litter is its own perfect control
group: same dam, same milk, same day.

**Consequence.** Flags fire on trajectory, not on size. Small is not a problem;
falling off your own line is. Every flag is phrased as an observation rather
than a diagnosis — the software says what it sees, the breeder and their vet
decide what it means.

## D22 — A single non-null `dedupeKey`, not a compound unique over nullables (Phase 3)

**Decision.** `CareTask.dedupeKey String @unique`, generated as
`"<scope>:<scopeId>:<protocolKey>"`.

**Why.** The obvious `@@unique([litterId, puppyId, generatedKey])` does not
work: Postgres treats NULLs as distinct inside a unique index, so litter-scoped
tasks (with a null `puppyId`) would not have been constrained at all. A breeder
correcting a whelp date by one day would have ended up with two of every
vaccination. This is the *second* time this pattern bit — the same mistake was
in the Phase 2 verification schema.

**Consequence.** Regeneration is genuinely idempotent, and manual tasks get a
random key so they are unconstrained.

## D23 — Breeder mobile deferred to Phase 5, with the workspace built mobile-first (Phase 3)

**Decision.** No Expo app in Phase 3. The studio is built for phone use
instead: 44px tap-target floor, bottom tab bar, one-handed forms, and a
whelping flow whose only required field is sex.

**Why.** The roadmap leaned toward shipping mobile with Phase 3 because
whelping logging is inherently mobile — and that reasoning is right. But a
native app is a second client to keep in step with an API that is still
changing every phase, and the actual 3am requirement is *big targets and few
required fields*, which a responsive web app delivers now.

**Consequence.** Revisit at Phase 5, when the API has settled. If offline
logging in a barn with no signal turns out to matter, that is the argument for
native — and it is a better argument than "the roadmap said so".

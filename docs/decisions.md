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

## D24 — Only VERIFIED claims count as genetic evidence (Phase 4)

**Decision.** `assessPairingRisk` accepts `VERIFIED` and `STALE` claims and
ignores `REPORTED` ones entirely. An untested marker produces `UNKNOWN`, never
"probably clear".

**Why.** This is the one screen in the product that can prevent a litter of
affected puppies. If a sentence someone typed into a form could satisfy it, the
feature is decorative. `STALE` is accepted because the underlying lab result
has not changed — only our freshness window has lapsed.

**Consequence.** A pairing where one dog is untested reads as "cannot be
cleared", with the specific instruction to test the other side. That is a
worse-feeling result than a green tick and a more useful one.

## D25 — Carrier status is never rendered as a failure (Phase 4)

**Decision.** `CARRIER` gets a neutral chip everywhere — the directory, the
claim panel, the risk table. Only `AT_RISK` and `ABNORMAL` get the danger
treatment.

**Why.** A carrier bred to a clear dog produces zero affected puppies. The goal
is to stop carrier × carrier matings, not to drive carriers out of the gene
pool. A platform with reach that coloured carriers red would push breeders to
cull healthy dogs from breeding programmes, and at scale that would do more
harm to breed genetic diversity than the affected puppies this feature exists
to prevent.

**Consequence.** `isConcerning()` excludes `CARRIER`. The Punnett bar shows the
carrier fraction in a neutral tone between the affected red and the clear blue.

## D26 — Genetic risk outranks COI in the pairing layout (Phase 4)

**Decision.** The genetic risk panel sits above the COI readout, full width.

**Why.** A 3% COI on a pairing that would produce 25% affected puppies is not
the headline. Laying the page out as though the COI were the answer would be a
design decision with veterinary consequences, and the fact that COI is the
prettier number is not a reason to lead with it.

**Consequence.** Directory cards apply the same rule: an at-risk marker
overrides the fee, the distance and the verification density on the card.

## D27 — Search filters read from verified claims only (Phase 4)

**Decision.** "Verified normal hips" filters on
`verifiedClaims.some({ claimType: 'HIP', outcome: 'NORMAL' })`. There is no
filter that reads a self-reported value.

**Why.** This is the entire competitive argument in one query. A classified
board cannot offer this filter because it does not know whether the hips are
normal. The consequence is a smaller directory than a board with the same
number of dogs — which the empty state says out loud rather than hiding.

**Consequence.** Multiple health filters are AND, not OR. A breeder asking for
verified hips *and* elbows means both, and quietly widening that to either
would be the kind of helpfulness that returns the wrong dog.

## D28 — Typecheck no longer reads Next's generated route types (Phase 4)

**Decision.** `apps/*/tsconfig.json` excludes `.next`.

**Why.** `.next/types/validator.ts` is generated by `next build` and goes stale
the moment a route is added, producing a `typecheck` failure that a rebuild
fixes and that means nothing. It failed twice for exactly this reason during
Phases 3 and 4.

**Consequence.** Route validation still happens — `next build` does it, and
build runs in CI.

## D29 — Money decisions read clause effects, never contract prose (Phase 5)

**Decision.** A clause carries a machine-readable `effects` object —
`definesBalanceTrigger`, `definesNoLitterRemedy`, `grantsRepeatBreeding`. The
payment schedule, the escrow assessment and the repeat-breeding right are all
derived from those, and never from the rendered sentence.

**Why.** A refund decision that depends on parsing English is a refund decision
that will eventually be wrong, and it will be wrong about somebody's $2,000 in
front of somebody's lawyer. Prose is for the parties; effects are for the code.

**Consequence.** Editing a clause's wording cannot change what the money does,
and changing what the money does requires an explicit effect change that shows
up in review. A clause without effects simply has no financial consequence,
which is the correct default.

## D30 — When the contract is silent, Stud refuses to decide (Phase 5)

**Decision.** `assessEscrow` returns `NEEDS_REVIEW` with `requiresHuman: true`
when a breeding produced no litter and no clause defines a remedy.

**Why.** A platform that invents a refund position the contract did not state
is making a decision it has no authority to make. Guessing "refund" robs the
stud owner of a service they performed; guessing "no refund" robs the bitch
owner. Both guesses are worse than saying so.

**Consequence.** Some contracts land in a state that needs a human, and that is
the honest outcome rather than a gap. The UI says it plainly: "Stud will not
decide this one. The parties or an admin have to."

## D31 — The platform fee is taken at release, not at capture (Phase 5)

**Decision.** `releaseFromEscrow` takes the fee; `captureToEscrow` does not.

**Why.** A refunded breeding refunds in full, and the platform earns nothing on
a breeding that did not happen. Taking the fee at capture would mean the buyer
gets back less than they paid on a service they never received.

**Consequence.** Revenue recognises later than it would otherwise, which is the
correct trade for not having to explain a partial refund.

## D32 — CHOICE options separate value, label and document text (Phase 5)

**Decision.** `ClauseOption` has three fields: `value` (what the logic reads),
`label` (the drafter's picker text, never printed), and `text` (what appears in
the document, defaulting to `value`).

**Why.** Two of the three were originally collapsed, and the renderer printed
the picker label. The contract read "the service shall be by ai — chilled",
"borne by bitch owner", and ended a remedy clause with the fragment "not
refundable". Those are three different jobs and the type now says so.

**Consequence.** `balanceTrigger` keeps machine values (`ON_WHELP`) because
`extractScheduleTerms` switches on them, and carries its own wording. A test
sweeps the whole library asserting no picker label reaches the page.

## D33 — An omitted optional field leaves no trace (Phase 5)

**Decision.** A blank *required* variable renders as `[Label]`; a blank
*optional* one renders as nothing, and the empty paragraph is collapsed.

**Why.** The visible placeholder exists so drafting holes get filled. An
optional field left blank is not a hole — it is a term that is not part of this
agreement. Printing "[Additional detail]" into a signed document reads as a
mistake, because it is one.

**Consequence.** Clause bodies can carry optional paragraphs without the author
having to write conditional templates.

## D34 — An escrow assessment accounts for what has already been paid out (Phase 5)

**Decision.** `assessEscrow` takes `alreadyReleasedCents` and nets it against
the deposit tranche.

**Why.** Without it, settling twice on a confirmed pregnancy re-read "the
deposit is releasable" and released it a second time — out of the balance that
exists to protect the bitch owner until there are puppies on the ground. Every
assessment is a statement about the whole agreement, not about the current
escrow balance in isolation.

**Consequence.** A second settlement on the same state returns `HOLD` with
"The deposit has already been released." The same netting keeps a
`REFUND_BALANCE` contract from under-refunding the payer.

## D35 — Both parties need an account before a contract exists (Phase 5)

**Decision.** `POST /contracts` refuses a counterparty email with no Stud
account.

**Why.** A signature is only worth something if it is tied to an authenticated
identity. A typed name against an email address nobody proved they control is a
checkbox with extra steps.

**Consequence.** There is friction at exactly the point where friction is
right, and the error says why rather than just refusing.

## D36 — A listing is separate from a litter (Phase 6)

**Decision.** `LitterListing` is its own table with its own slug, price and
publication date. `Litter` stays a breeding record.

**Why.** A litter exists whether or not anyone is selling anything. Merging the
two would mean a breeder cannot record a whelp without also publishing it, and
the first thing that gets skipped under pressure is the record.

**Consequence.** A litter can be tracked from day one and published on day
forty, or never. Unpublishing hides the page without touching a single
breeding fact.

## D37 — The public page reads everything live; only search is denormalised (Phase 6)

**Decision.** The litter page reads parent health, titles, registrations, COI
and pedigree completeness from the dog records at request time. A handful of
`cached*` columns exist on the listing purely so search can filter and sort.

**Why.** This is the phase gate — zero re-entry. A breeder who has done the
work of getting their dogs verified must never retype a hip score into a
marketing form, because that is exactly how the number on the listing drifts
from the number on the certificate.

**Consequence.** The cached columns are never authored by a human and never
rendered to one. If one drifts, a listing is mis-*sorted*; it cannot display a
wrong health result, because it is not the source of any displayed result.
`refreshListingCache` lives in `@stud/db` so the API, the seed and any future
worker cannot grow three different versions of it.

## D38 — Reserving a puppy updates the marketplace immediately (Phase 6)

**Decision.** `PATCH /puppies/:id` recomputes the listing cache whenever
`status` or `isPublic` changes.

**Why.** The cache was originally recomputed only when a breeder re-saved the
listing. A browse page still advertising a puppy that sold last week is the
fastest way to lose a buyer's trust and the breeder's.

**Consequence.** One extra query on a status change, which is a rare write.

## D39 — Health filters mean BOTH parents (Phase 6)

**Decision.** `verifiedNormal=HIP` on the litter search requires a verified
normal hip result on the sire **and** the dam. Selecting two claim types means
both types, on both parents.

**Why.** A buyer filtering for verified hips is asking about the puppy they
take home. One clear parent does not make a clear puppy, and quietly widening
this to "either" would return the wrong litter to someone who asked a precise
question.

**Consequence.** Far fewer results than a classified board would return, which
the page states out loud rather than hiding. A `CONFLICTED` result does not
count as verified either — an open conflict is not evidence.

## D40 — A first publication date is never cleared (Phase 6)

**Decision.** `publishedAt` records the first time a listing went public and is
never nulled. Visibility is `availability`.

**Why.** The original code nulled it on unpublish, so a breeder who hid a
litter for a week and put it back lost its age. A page that has been up for two
years is a genuinely different thing from one posted this morning, both to a
search engine and to a buyer reading a program's history.

**Consequence.** Every public query filters on `availability` as well as
`publishedAt`. Both conditions, everywhere — the browse list, the detail page,
the enquiry endpoint, the kennel profile and the sitemap.

## D41 — A sold-out litter stays published (Phase 6)

**Decision.** `FULLY_RESERVED` and `PAST` are public, indexed states.

**Why.** A sold-out litter is the best evidence a breeder has, and taking the
page down throws away the accumulated ranking along with the proof. It is also
what a buyer researching a program actually wants to read.

**Consequence.** The sitemap gives past litters a lower priority than current
ones, because they are still worth indexing but are not what somebody
searching today is looking for.

## D42 — Eight weeks is refused, not warned (Phase 6)

**Decision.** A go-home date less than 56 days after whelping is a 400.

**Why.** It is a statutory minimum in most states and a welfare minimum
everywhere. This is the one field on a marketing form where being agreeable
would do real harm to an animal.

**Consequence.** The only hard refusal in the publish path. Everything else
about a listing is the breeder's business.

## D43 — The ancestry loader moved into @stud/db (Phase 6)

**Decision.** `loadAncestryGraph` and friends live in `@stud/db/pedigree-loader`
rather than in the API.

**Why.** The listing cache needs a projected COI, and it is used by the API and
by the seed. Duplicating the ancestry walk would have produced two subtly
different pedigrees, and the first symptom would be a COI on a public page that
disagreed with the one in the workspace. Same reasoning as
`verification-service` in Phase 2.

**Consequence.** `@stud/db` now depends on `@stud/pedigree`. Both are still
pure of each other's concerns — the engine does no I/O and the loader does no
arithmetic.

## D44 — Money never moves before approval (Phase 7)

**Decision.** `canAdvance` is a data table of legal stage transitions, and
every stage change in the pipeline goes through it. `APPROVED` is the only
stage a deposit may be taken from.

**Why.** A deposit from an applicant the breeder has not accepted is a deposit
that has to go back, and the platform holding it in the meantime is the
platform's problem. Writing the ordering as data rather than as a check inside
each route means a new route cannot forget it.

**Consequence.** The refusal explains itself rather than returning a bare 400:
*"Approve it first — money that arrives from someone you have not accepted has
to go back."*

## D45 — The pick order is set by deposit time, not application time (Phase 7)

**Decision.** `buildPickOrder` sorts on a breeder's hand-set position first,
then when the deposit landed, then when the application was submitted.

**Why.** Deposit time is the point at which somebody actually committed, and it
is the only one of the three dates both parties can see. Application time
rewards whoever refreshed the page fastest on the day the litter was announced.

**Consequence.** A breeder who promised somebody first pick sets it explicitly,
and the reason shows on the application. Applicants without a deposit are not
in the queue at all — being approved is not the same as holding a place.

## D46 — Out-of-turn matching is allowed and recorded (Phase 7)

**Decision.** A breeder may match a puppy to a buyer who is not next. The
event log records that it happened.

**Why.** There are good reasons — the buyer ahead wanted a female and this is
the only male left. Blocking it would make the software wrong about the
situation. Doing it silently would be worse, because the buyer who was skipped
has a right to know.

**Consequence.** The match dialog warns before it happens rather than after.

## D47 — A breeder who withdraws always refunds in full (Phase 7)

**Decision.** `assessDepositRefund` returns the whole deposit when
`breederWithdrew`, whatever the contract says.

**Why.** A "non-refundable" deposit is consideration for the **buyer's**
commitment. It cannot also be a fee for the breeder changing their mind — a
term that let a breeder keep it would be unconscionable and, in most states,
unenforceable.

**Consequence.** The only term the platform overrides. Everything else about a
deposit comes from the contract's clause effect.

## D48 — With no signed contract, a deposit is fully refundable (Phase 7)

**Decision.** A null deposit term means refund in full.

**Why.** The platform will not keep a buyer's money against terms nobody
agreed to. This is the same principle as Phase 5's `NEEDS_REVIEW`: where there
is no agreement, Stud does not invent one — it just does the thing that cannot
be unfair.

**Consequence.** A breeder who wants a non-refundable deposit has to get the
contract signed before taking it, which is the right order anyway.

## D49 — Pickup readiness reads the ledger, not instalment rows (Phase 7)

**Decision.** `computeReadiness` sums `ESCROW` ledger entries for the
application and compares against the contract total.

**Why.** The deposit is taken against the *application*, before any contract
exists. Summing instalment statuses would count the contract's still-PENDING
deposit row as outstanding and block a buyer at the door for money they paid
weeks ago. Phase 5's rule again: the ledger is the record.

**Consequence.** The deposit instalment is reconciled to PAID when the balance
is taken, so the contract's own schedule stops disagreeing with the ledger.

## D50 — Eight weeks blocks a handover; missing paperwork only warns (Phase 7)

**Decision.** Age under 56 days, an outstanding balance and an unsigned
contract are blockers. A missing microchip, vaccination or vet record is a
warning.

**Why.** The age floor is statutory in most states and a welfare minimum
everywhere — the same rule the listing enforces, applied at the door. But a
breeder who genuinely did the vaccinations and did not log them should not be
stopped by their own paperwork on the day a family arrives.

**Consequence.** Blockers can be overridden with a written reason, which goes
into the append-only application history. Readiness is shown from the moment a
puppy is matched, not on collection day — a blocker learned about at the door
is one nobody can do anything about.

## D51 — An application is not an enquiry (Phase 7)

**Decision.** `PuppyApplication` is a separate model from Phase 6's
`LitterInquiry`, which stays exactly what it was.

**Why.** Most buyers start with a question, not a form. Making the first
contact a twenty-field application loses the buyer who was only half sure;
making the considered one a free-text message loses the breeder who has twenty
to triage.

**Consequence.** An application can link back to the enquiry it grew out of, so
the thread is not lost. One live application per person per litter — a second
is almost always somebody who thought the first did not send.

## D52 — A puppy becomes a Dog at handover, automatically (Phase 8)

**Decision.** Recording the handover mints a `Dog` row with the pedigree,
microchip and parentage already attached, and a `DogOwnership` for the buyer.

**Why.** The phase gate is that the record is complete when the buyer opens it
— not complete once somebody remembers to press another button. Everything
above Phase 1 speaks Dog, so a puppy that stayed a Puppy would be invisible to
pedigrees, verification and the directory at exactly the point it starts to
matter.

**Consequence.** `transferPuppyToOwner` is idempotent, because handovers get
recorded twice more often than you would think and the second one must not
mint a second animal. It runs outside the handover transaction: a failure to
create the dog record must not roll back a collection that physically
happened.

## D53 — The new dog is not attached to the breeder's kennel (Phase 8)

**Decision.** `kennelId` is null on a placed dog.

**Why.** It belongs to the owner. Leaving it on the kennel would put somebody
else's dog in the breeder's list and, worse, on their public profile.

**Consequence.** The breeder still reaches it through `Puppy.dogId`, which is
how the placed-dogs view and the health guarantee both work.

## D54 — The growth history stays on the puppy row (Phase 8)

**Decision.** Weights are read through `Puppy.dogId` rather than copied onto
the dog.

**Why.** Copying would create a second source of truth for the same eight
weeks, and the first correction to either would make them disagree.

**Consequence.** One join, and the whelping-box chart on the owner's page is
literally the breeder's data rather than a snapshot of it.

## D55 — A contract is shown as dated obligations, not as a document (Phase 8)

**Decision.** `deriveObligations` turns clause effects and variables into
dated, party-attributed obligations. The portal renders those.

**Why.** A puppy contract is read once at the kitchen table and filed. Six
months later nobody remembers the spay deadline was tied to eighteen months
rather than six, or that the health guarantee needed a vet visit in the first
72 hours. A PDF nobody opens is not a term anybody meets.

**Consequence.** Half the obligations belong to the **breeder** — the
registration paperwork, the guarantee — and are labelled that way. An owner who
can see what they are owed is an owner who can ask for it.

## D56 — An unparseable duration produces no deadline (Phase 8)

**Decision.** `parseWindowDays` handles hours, days, weeks and months, rounds
up, and returns null on anything else. A null becomes an obligation with no
date.

**Why.** These come from a TEXT field a breeder typed, so this genuinely does
read prose — confined to durations. Guessing would put a date in front of an
owner that their contract does not support, which is worse than no date.

**Consequence.** "Within 72 hours" works; "as soon as practicable" produces an
obligation with no deadline, which is exactly what the contract says.

## D57 — Stud states the take-back clause; it does not enforce it (Phase 8)

**Decision.** `checkTransfer` returns `allowed: true` even when the contract
requires the dog to go back to the breeder. It returns the term, the portal
shows it at the moment of deciding, and the breeder is notified when the
transfer is proposed rather than when it completes.

**Why.** Stud cannot enforce a private contract between two other people, and
refusing would push the whole thing off-platform where nobody can see it at
all. A breeder who finds out a week after the dog left has lost the chance to
take it back.

**Consequence.** The transfer records `contractRequiresReturn` and
`breederNotifiedAt`, so a dog rehomed outside its contract leaves a trace the
breeder can actually find.

## D58 — Ownership is ended, never deleted (Phase 8)

**Decision.** `completeOwnershipTransfer` sets `endedAt` on the outgoing
ownership and inserts a new one.

**Why.** Who owned a dog and when is exactly the kind of thing that is obvious
at the time and impossible to reconstruct three owners later. It is also the
record that answers "was this dog ever returned to its breeder?".

## D59 — Owner health events are shared with the breeder by default (Phase 8)

**Decision.** `HealthEvent.sharedWithBreeder` defaults true, and the reason is
given in the form rather than assumed.

**Why.** A breeding program only improves if what happened to the puppies comes
back to it, and a health guarantee depends on the owner telling the breeder
anyway. An owner can turn it off for anything — it is their dog and their vet
bills — and turning it off is one click, not buried in settings.

**Consequence.** The breeder's view says plainly that what they see is the
owner's account of what happened, because that is what it is. Nothing an owner
writes can become a verified claim (invariant 5) — that still requires the
Phase 2 engine checking it against the issuing source.

## D60 — The relationship label describes a level, not a parentage (Phase 8)

**Decision.** The public litter page renders `RELATIONSHIP_COPY`, not the raw
`RelationshipKind` enum.

**Why.** The classifier works from the relatedness *coefficient*. Two dogs with
four different parents can be as related as half-siblings through a doubled-up
grandparent — which is exactly what the seeded pairing is. Rendering the enum
printed "these two are half siblings" on a public page, which is a false
statement of fact about somebody's breeding program.

**Consequence.** A test asserts that for a pair who provably share no parent,
the copy for whatever band they land in describes a *level* of relatedness.

## D61 — Next resolves workspace `.js` imports via extensionAlias (Phase 8)

**Decision.** Both Next apps set `resolve.extensionAlias` mapping `.js` to
`['.ts', '.tsx', '.js']`.

**Why.** Workspace packages are TypeScript source importing with ESM `.js`
extensions — `./graph.js` meaning `./graph.ts`. tsc understands that; webpack
does not. `@stud/pedigree` had been in `transpilePackages` since Phase 0 but
was never actually imported at runtime from a Next app, so the gap only
surfaced when Phase 8 imported it — with typecheck passing and the build
failing.

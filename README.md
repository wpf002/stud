# Stud

**Verified breeding records, from stud selection to the day a puppy goes home.**

Stud is a marketplace and vertical SaaS for dog breeding. It connects three
groups that today use three unconnected sets of tools:

- **Stud dog owners** who have a good male and no idea where to advertise him,
  what to charge, or how to vet the breeder asking.
- **Breeders** who need to evaluate whether two dogs are actually an appropriate
  match — not just find a listing.
- **Puppy buyers** who want to know what is real about a litter before they send
  a deposit.

The thesis: **one continuous record that follows a dog** from stud selection
through breeding, whelp, sale, and into the new owner's hands — with third-party
verification as the spine instead of self-attestation.

---

## The wedge: verification

Every competitor in this market takes the breeder's word for it. Health testing
is self-reported; titles are a line in a bio paragraph. The underlying records
are *public* — OFA publishes results, registries publish titles, NAVHDA
publishes scores — and nobody reads them.

We do. On a schedule. And we show the receipts.

> **Verified** on this platform means a machine checked it against the issuing
> source, and we recorded which source, what it said, and when we asked.

Self-reported claims still appear — labelled **Reported**, styled differently,
in a different database column. Absence renders as **Not verified**, never as
whitespace. See [`/verification`](apps/web/src/app/verification/page.tsx) for the
public standard.

---

## Architecture

```
stud/
├── apps/
│   ├── web            Next.js — the whole site:
│   │                    (site)/  buyer marketplace (public, SEO-critical)
│   │                    studio/  breeder workspace (authed, noindex)
│   ├── mobile         Expo — breeder logging companion
│   └── api            Fastify — REST + webhooks
├── packages/
│   ├── db             Prisma schema + migrations + seed
│   ├── pedigree       PURE: ancestry graph, COI, relatedness. No I/O.
│   ├── breeding       PURE: heat prediction, gestation, growth, schedules.
│   ├── verify         Source adapters + verification state machine
│   ├── contracts      Contract templates, e-sign orchestration
│   ├── payments       Escrow, deposits, payouts, refund logic
│   ├── ui             Design system, shared components
│   └── config         tsconfig, eslint, tailwind presets
└── services/
    └── ingest         Queue workers: registry/OFA/title ingest + reconciliation
```

### Locked invariants

Decided once in Phase 0. Not revisited.

1. **`@stud/pedigree` is pure.** No network, no database, no side effects. It
   takes a graph and returns numbers. This is what makes COI auditable and
   testable, and leaves the door open to porting it if it becomes a bottleneck.
2. **Money is integer cents.** Always. Stud fees, deposits, balances, refunds.
   See [`packages/db/src/money.ts`](packages/db/src/money.ts).
3. **Verification is a state machine, never a boolean.**
   `UNVERIFIED → PENDING → VERIFIED → STALE → CONFLICTED`. Every transition is
   logged with source, timestamp and actor.
4. **A dog record is append-only.** Corrections are new facts with supersession
   pointers, not overwrites. This is what makes the record trustworthy across
   ownership transfers.
5. **Self-reported and verified data never share a field.** Separate columns,
   separate UI treatment.

---

## Getting started

Requires **Node ≥ 20.11**, **pnpm 9**, and **Docker** (for local Postgres).

```bash
git clone https://github.com/wpf002/stud.git
cd stud
pnpm bootstrap
```

`pnpm bootstrap` is idempotent. It checks the toolchain, writes a `.env` with a
freshly generated `AUTH_SECRET`, starts Postgres 16 on the first free port from `:5438`, installs the
workspace, generates the Prisma client, applies migrations and seeds.

```bash
pnpm dev
```

| Surface | URL | What it is |
|---|---|---|
| `web` | http://localhost:3000 | Buyer marketplace |
| `web` | http://localhost:3000/studio | Breeder workspace |
| `api` | http://localhost:4000 | Fastify REST API |

Seeded accounts (password `studdev1234`):

| Email | Roles |
|---|---|
| `breeder@stud.dev` | BREEDER, OWNER — Blackwater Kennels |
| `studowner@stud.dev` | OWNER — one dog, no kennel |
| `buyer@stud.dev` | BUYER |
| `admin@stud.dev` | ADMIN |

### Common commands

```bash
pnpm dev              # all surfaces in parallel
pnpm typecheck        # tsc across the workspace
pnpm lint
pnpm test
pnpm build

pnpm db:migrate       # create + apply a migration
pnpm db:seed
pnpm db:studio        # Prisma Studio
pnpm db:reset         # drop, re-migrate, re-seed
```

---

## Design direction

Two surfaces, one design system ([`packages/config/tailwind/preset.js`](packages/config/tailwind/preset.js)).

**Buyer surface** — warm off-white ground (`bone-100`, `#FAF7F2`), cool
near-black ink (`ink-950`, `#040416`), editorial photography, generous
whitespace, Fraunces display over Inter body, and a single confident accent:
`brand-600` `#0057DE`. Slow, calm, expensive-feeling. This surface sells
confidence, not features.

**Palette provenance.** The primary blue is Good Dog's own accent, read
straight off their live stylesheet. The secondary red — `clay-500` `#D85C44` —
is Breedera's accent, likewise. Warm paper ground, cool ink, saturated blue,
terracotta for emphasis. The verified badge uses the brand blue deliberately:
verification *is* the brand promise, so the badge and the mark are the same
colour.

**Breeder surface** — the same tokens, densified. Large tap targets (`h-tap`,
44px floor), one-handed logging, progressive disclosure, charts as the primary
data display. On desktop it becomes a real dashboard without becoming a wall of
fields.

**The verification badge is the core design object.**
[`packages/ui/src/verification-badge.tsx`](packages/ui/src/verification-badge.tsx)

**The pedigree chart is the second one.**
[`packages/ui/src/pedigree-chart.tsx`](packages/ui/src/pedigree-chart.tsx) — the
layout conventions every breeder already knows, plus the things paper cannot
do: repeated ancestors colour-linked, COI contributors ranked in place, and
empty slots rendered rather than hidden.

---

## The pedigree engine

[`packages/pedigree`](packages/pedigree) is pure — zero runtime dependencies,
no I/O, no clock. It takes a graph and returns numbers.

Two independent implementations of the same maths live there on purpose:

- **`kinship()`** — recursive coancestry. Exact on arbitrarily deep and densely
  looped pedigrees. This is what `inbreedingCoefficient()` reports.
- **`pathContributions()`** — Wright's original path method, which answers the
  question a breeder actually asks: *which ancestor is causing this?*

Wright's theorem says they agree. The test suite asserts exactly that on every
fixture, which is a far stronger check than either alone. Alongside it are
hand-checkable constants a human can verify with a pen:

| Pairing | Expected F |
|---|---|
| Unrelated parents | 0 |
| Half siblings | 0.125 |
| First cousins | 0.0625 |
| Full siblings | 0.25 |
| Parent × offspring | 0.25 |
| Half sibs through a full-sib-bred ancestor | 0.15625 — *not* 0.125 |

That last row is the one that catches implementations which drop the `(1 + F_A)`
term. They return 0.125 and look completely plausible.

**A COI is never rendered without its pedigree completeness.** `CoiReadout`
takes both in one component, because 0% on two known parents and nothing else
is not a low COI — it is no information.

---

## The verification engine

[`packages/verify`](packages/verify) is the moat. It turns "verified" into a
sentence that is actually true: *a machine checked this against the body that
issued it, and we recorded which source, what it said, and when we asked.*

**Verification is a state machine** — `UNVERIFIED → PENDING → VERIFIED →
STALE → CONFLICTED` — with every transition enumerated as data, every
transition logged with its reason, and illegal transitions **thrown** rather
than silently coerced. Falling through to "keep the current state" would hide
a bug behind a badge that still reads *Verified*.

Three distinctions the code refuses to blur:

| | |
|---|---|
| **`NOT_FOUND` vs `UNAVAILABLE`** | "The source has no record" vs "we could not reach the source". Collapsing these would let one OFA outage unverify the entire platform. |
| **Verified vs Reported** | Separate tables, separate shapes, no code path between them. Promotion requires a fresh source lookup. |
| **Carrier vs At risk** | A carrier bred to a clear dog produces no affected puppies. `CARRIER` renders neutrally and is excluded from concern flags — colouring it like a failure would push breeders to cull genetic diversity for nothing. |

A conflict never clears itself. Sources flap; if an agreeing recheck silently
resolved a discrepancy, it could appear and vanish with no human ever seeing
it. Only an admin closes a conflict, and the held value is preserved beside the
source's new one so there is something to compare.

**Live lookups are off by default.** The adapters are complete and tested; they
will not contact ofa.org or any registry until the per-source review in
[`docs/verification-sources.md`](docs/verification-sources.md) is done. These
are public records maintained by non-profits, and a platform arguing that
receipts matter does not get to skip reading the terms. Offline, a fixture
adapter implements the same contract, so CI exercises every layer for real.

---

## Phases

| Phase | Scope | Gate |
|---|---|---|
| **0** ✅ | Foundations | `pnpm dev` boots web + api against a seeded Postgres |
| **1** ✅ | Dog record & pedigree graph | Import a 5-generation pedigree, render it, compute Wright's COI against a hand-checked case |
| **2** ✅ | Verification engine | Paste a registration number, get real OFA results with source attribution in < 5s |
| **3** ✅ | Breeder workspace | Run an entire litter from heat to eight weeks without a spreadsheet |
| **4** ✅ | Stud directory & match | Search, open a profile, run a trial pairing, see a COI for a litter that doesn't exist yet |
| **5** ✅ | Breeding transaction | Stud contract from template → signed → paid → litter-linked, in-app |
| **6** ✅ | Litter & puppy marketplace | A public litter page ranks, loads fast, shows verified parent data with zero re-entry |
| **7** ✅ | Buyer pipeline & payments | Application → approval → deposit → balance → pickup, fully tracked |
| **8** ✅ | Owner portal & record transfer | A buyer opens their dog's record on pickup day and it's already complete |
| **9** ✅ | Trust, discovery & growth | Organic traffic is the primary channel; the verified tier converts measurably better |
| **10** | Seed at realistic scale | `/puppies` and `/studs` filter and paginate against ~280 dogs, and no dog carries a title its breed does not compete for |
| **11** | Booking & availability | A dam owner requests a five-day window, the stud owner accepts, a deposit is taken, and the listing reads "booked through" with no manual status edit |
| **12** | Structured credentials & breed-aware health | A GSP shows its own CHIC expectations while a Poodle shows a different set; a 45-day-old brucellosis test blocks a booking |
| **13** | Stripe Connect | Test mode: a held deposit refunds with no payout, and a second transfers to a connected account on completion |

Phases 10–13 are specified in [docs/roadmap-10-13.md](docs/roadmap-10-13.md).

Phases 1–3 ship a product that is useful with **zero network effect** — a
breeder with one dog gets value from the pedigree tool, verification and litter
management on day one. That is the cold-start answer: the software is the bait,
the marketplace is the hook.

**The marketplace does not open until verification is real.** Launching an
unverified marketplace makes us the fourth-best stud classified site, and the
positioning never recovers.

---

## Business model

- **Breeder workspace** — free tier + paid tier at $19–39/mo. Priced above
  Breedera and BreederCloudPro (both under $10/mo); verification and marketplace
  access justify it. Don't race cheap competitors to the bottom on a product
  that costs more to run.
- **Stud transactions** — flat platform fee on contracted stud services. Small
  revenue, high strategic value.
- **Puppy transactions** — take rate on deposits and balances. The revenue engine.
- **Verification** — included, never a paid add-on. Behind a paywall it stops
  being a trust signal.

---

## Notes on growth

Meta's ad standards prohibit ads promoting peer-to-peer sales of live animals,
and Google restricts live animal advertising. **Paid social and paid search are
effectively closed to this category.** Acquisition has to come from SEO at scale
(the per-dog verified record page is a page type nobody else can produce), breed
club and field trial partnerships, breeder-side referral, and content. Budget a
24-month ramp and model it that way from the start.

See [`docs/`](docs/) for the payments diligence note and architecture decisions.

---

## License

Proprietary. All rights reserved.


---

## The breeding engine

[`packages/breeding`](packages/breeding) is pure, like `@stud/pedigree`. No
clock — every function that needs "now" takes it as an argument, so every
prediction is reproducible and every test deterministic.

**Every prediction carries its basis and its confidence.** Gestation is 63 ± 1
days from a confirmed ovulation and 58–68 days from a breeding date; those are
the same feature with a tenfold difference in accuracy. `forecastWhelp` returns
which one it used, and the UI never renders the date without it.

| | |
|---|---|
| **Heat prediction** | Uses the bitch's own intervals once two cycles are logged. The window is two standard deviations wide, floored at a week — no bitch is regular enough to deserve a three-day promise. One cycle gets a 90-day window and says so. |
| **Progesterone** | Identifies the LH surge and ovulation, then gives a breeding window per semen type. Frozen gets the tightest and latest, because semen that survives hours does not forgive a day. |
| **Growth** | Assessed against the litter's own median birth weight and against its littermates — same dam, same milk, same day, which beats any generic curve. Flags fire on trajectory, not on size. |
| **Care schedule** | The standard protocol, dated from the whelp date, generated automatically and fully editable. Reference protocols, not veterinary instruction. |

One decision worth knowing about: when a progesterone series crosses a
threshold between two tests, the crossing is estimated **log-linearly and
rounded up**. Progesterone rises exponentially, so linear interpolation lands
early — and of the two ways to be wrong, early is the expensive one.


---

## Genetic risk

The feature that justifies having built verification before the marketplace.
Once both dogs' panels are *verified claims* rather than recollections, the
Mendelian arithmetic answers the one question that actually prevents affected
puppies: **are these two both carriers of the same recessive?**

| Sire × Dam | Affected | Carriers |
|---|---|---|
| clear × clear | 0% | 0% |
| clear × carrier | **0%** | 50% |
| carrier × carrier | **25%** | 50% |
| carrier × affected | 50% | 50% |

Three rules govern how this is presented:

1. **Only verified claims count.** A reported "he's clear" is not evidence. The
   one feature that prevents affected puppies must not be defeated by a
   sentence typed into a form.
2. **Untested is never "probably clear."** A marker tested on one side reads as
   *cannot be cleared*, and names which dog to test.
3. **Carrier is not a failure.** A carrier bred to a clear dog produces no
   affected puppies. Colouring carriers red would push breeders to cull healthy
   dogs, and at scale that would harm breed diversity more than it helps.

The risk panel sits **above** the COI on the pairing page. A 3% COI on a
pairing that would produce 25% affected puppies is not the headline.


---

## The breeding transaction

Two pure packages carry it. [`packages/contracts`](packages/contracts) decides
what a document says, whether it is valid, what its hash is, and whether a
signature may be taken. [`packages/payments`](packages/payments) models the
money. Neither does any I/O.

**A contract is an ordered list of versioned clause instances, never a blob of
edited text.** A blob cannot be diffed, cannot be reasoned about by the refund
logic, and cannot tell you what changed between the version a party read and
the version they signed.

Each clause carries an `effects` object — `definesBalanceTrigger`,
`definesNoLitterRemedy`, `grantsRepeatBreeding`. **The payment schedule and the
escrow decision are derived from those, never from the prose.** A refund
decision that depends on parsing English is a refund decision that will
eventually be wrong.

| | |
|---|---|
| **Freeze on send** | Sending renders the document, hashes it (FNV-1a 128-bit) and locks the clauses. Editing after a signature is refused; an amendment supersedes instead. |
| **Signature** | Requires an authenticated account, an affirmed consent statement, a typed name matching the account, and the hash the signer was shown. A document that changed mid-read is refused, not silently signed. |
| **Health schedule** | Attached from the verified record at drafting time and frozen with the document, each line marked verified-with-source or reported. A later verification change cannot rewrite what the parties saw. |
| **Ledger** | Double-entry, append-only, integer cents. A correction is a reversal pair, never an edit — when two parties disagree about who paid what, the answer has to be reconstructible. |
| **Escrow** | Deposit releases on confirmed pregnancy; the balance waits for the whelp. The platform fee is taken at release, so a breeding that did not happen refunds in full and earns us nothing. |

**When the contract is silent about what happens if there is no litter, Stud
refuses to decide.** `assessEscrow` returns `NEEDS_REVIEW` rather than guessing.
Inventing a refund position the parties did not agree to is a decision the
platform has no authority to make.

**No money moves.** `MockProvider` is the only implementation and
`PAYMENTS_PROVIDER=mock` the only accepted value. Live animal sales are a
high-risk vertical — large tickets, an 8–16 week gap between deposit and
fulfilment, emotionally charged disputes — and a processor that has not
approved it in writing will close the account at the worst possible moment. So
every layer above the provider boundary is real and tested, and the one thing
that must not exist before a signed processor agreement does not exist. See
[`docs/payments-diligence.md`](docs/payments-diligence.md).


---

## The marketplace

The phase gate was one sentence: **a public litter page ranks, loads fast, and
shows verified parent data with zero re-entry.** Each third of that shaped
something.

**Zero re-entry.** A breeder publishing a litter writes a headline, a
paragraph, a price and a go-home date. That is the entire form. Parent health,
titles, registration numbers, projected COI, pedigree completeness and the
Mendelian risk for the pairing are all read from the dog records when the page
renders. Nobody retypes a hip score into a marketing form, so what a buyer
reads cannot drift from what the certificate says.

**Loads fast.** One API round trip builds the whole page — 10–18 ms and ~24 kB
for a six-puppy litter — cached at the data layer and server-rendered. The only
client component is the enquiry form; the page ships 2.7 kB of its own
JavaScript.

**Ranks.** Server-rendered HTML, canonical URLs, a stable slug that is built
once and never regenerated, `Product` + `AggregateOffer` + `Organization` +
`BreadcrumbList` structured data, a sitemap, and filtered views excluded from
the crawl so they cannot dilute the page they duplicate. The structured data
carries the verified results with their provenance, which is the part no
classified listing can reproduce.

### What the page says that a classified board cannot

| | |
|---|---|
| **What is missing** | A parent with no hip result reads *not tested*, not silence. A board cannot do this, because it never knew what was supposed to be there. |
| **What cannot be ruled out** | A marker tested on one side only is shown as unresolvable, naming which dog to test. Untested never renders as probably clear. |
| **How related the parents are** | The projected COI, its band, the relationship in words (*half siblings*), and how complete the pedigree behind the number is. |
| **What was lost** | Stillbirths and neonatal deaths appear in the litter's arithmetic. A litter's real history is worth more than a flattering one. |
| **What is already gone** | Reserving a puppy updates the availability count on the browse page immediately, not when the breeder next edits the listing. |

Search filters read the same verified tables. `verifiedNormal=HIP,ELBOW`
requires both results on **both** parents, and an open `CONFLICTED` result does
not count as verified. The consequence is a much smaller directory than a
classified board with the same number of breeders — which the empty state says
out loud, because it is the trade the whole product is making.


---

## The buyer pipeline

Application → approval → deposit → balance → pickup, in one record that both
sides can read.

**Money never moves before approval.** The legal stage transitions are a data
table in `@stud/payments`, and every route goes through it — so a deposit
cannot be taken from somebody the breeder has not accepted, and no future route
can forget the rule. The refusal says why rather than returning a bare error.

**The pick order turns on deposit time.** Not application time, which rewards
whoever refreshed the page fastest on announcement day. A breeder can set a
position by hand — a promise of first pick is a promise already made — and the
reason shows on the application. Matching out of turn is allowed, because
sometimes there is a good reason, and recorded, because the buyer who was
skipped has a right to know.

**A buyer sees where they stand.** Their own position and the size of the
queue; never who else is in it. That single number is what stops the anxious
weekly email, and no marketplace currently shows it.

| | |
|---|---|
| **The application** | Home, hours alone, children, other pets, previous dogs — *including the ones they no longer have* — their vet, and what the dog's life will look like. Long on purpose. |
| **No payment on the form** | Said in a banner, because every buyer who has been burned by a fake listing is watching for exactly that. |
| **The contract** | Drawn from the record: the puppy, both parents, every verified health result, frozen with the document. The breeder sets the money and nothing else. |
| **Refunds** | From the contract's clause effect, never its prose. No signed contract means fully refundable — Stud will not keep a buyer's money against terms nobody agreed to. |
| **A breeder who withdraws** | Always refunds in full, whatever the contract says. A non-refundable deposit is consideration for the *buyer's* commitment; it cannot also be a fee for the breeder changing their mind. |
| **The handover** | A record of what actually left with the dog — chip, papers, health certificate, vaccination and worming records — not a status flag. Phase 8 builds the owner's copy on top of it. |

Eight weeks blocks a handover; a missing vaccination record only warns. The
age floor is statutory in most states and a welfare minimum everywhere, applied
at the door as well as on the listing. But a breeder who did the work and did
not log it should not be stopped by their own paperwork with a family standing
in the driveway — so warnings are warnings, blockers can be overridden with a
written reason, and that reason goes into the append-only history.

Readiness is shown from the moment a puppy is matched rather than on collection
day, because a blocker you learn about at the door is one nobody can fix.


---

## The owner portal

The gate: **a buyer opens their dog's record on pickup day and it is already
complete.**

Recording the handover mints the dog record. It arrives carrying the pedigree
the breeder built, both parents' verified health, the growth curve from the
whelping box, the microchip, the litter, the signed contract — and the owner
has typed nothing. Everything above Phase 1 speaks Dog, so a puppy that stayed
a Puppy would be invisible to pedigrees and verification at exactly the moment
it starts to matter.

**The contract becomes dated obligations.** A puppy contract is read once at
the kitchen table and then filed; six months later nobody remembers the spay
deadline was tied to eighteen months rather than six, or that the health
guarantee needed a vet visit in the first 72 hours. So the clauses are derived
into things with dates:

| | |
|---|---|
| **Vet exam** | Within the window the contract names, from collection. The single most time-critical term in a puppy contract, and the one most often missed. |
| **Spay/neuter** | Dated from birth, with the contract's own wording — and a note that waiting for skeletal maturity is a legitimate reason to talk to your vet. |
| **Registration paperwork** | The **breeder's** obligation, labelled as theirs. An owner who can see what they are owed can ask for it. |
| **Health guarantee** | Runs to a date, and says what it actually covers. |
| **Take-back** | Never expires. Explained as the reason dogs from good programs stay out of shelters, not as a penalty clause. |

**Rehoming states the term rather than blocking it.** Stud cannot enforce a
private contract between two other people, and refusing would push the whole
thing off-platform where nobody can see it. So the portal says what the
contract asks at the moment somebody is deciding, notifies the breeder when the
transfer is *proposed* rather than when it completes, and records both. An
ownership is ended, never deleted — the chain of custody is the record that
answers "was this dog ever returned to its breeder?".

**What happened comes back.** Owners log vet visits and diagnoses, shared with
the breeder by default with the reason given rather than assumed: a program
only improves if it hears what it produced, and a health guarantee depends on
being told anyway. An owner can turn it off for anything in one click.

Nothing an owner writes becomes a verified claim. A logged result is *their
account* of a test, and only a check against the issuing body can change that —
which is invariant 5, applied to the person who now owns the dog.


---

## Trust and measurement

The last gate is a measurement, not a feature: **organic is the primary
channel, and the verified tier converts measurably better.** Phase 9 built the
instruments and the honesty to read them.

**Reviews are anchored to transactions.** A review requires a completed
placement or a signed breeding through Stud — there is no other path and no
override. The breeder gets exactly one reply and cannot delete anything;
moderation is a status, never a removal. The overall score is what reviewers
wrote, never the mean of the dimension scores, and a rating built on three
reviews says so: *"read them rather than the number."* Each review carries how
long after pickup it was written, because a review left on collection day
measures excitement and one left at three years measures the breeder.

**Measurement is first-party and honest by construction.** No third-party
tracker — a platform whose whole argument is "we check things" does not report
its visitors to an ad network. A funnel event is a row: the step, the
verification tier *frozen at that moment*, a session hash that expires with
the day, and a referrer bucketed in the browser so the full URL never leaves
it. The tier snapshot is what makes the comparison honest — a listing verified
after the traffic came through cannot retroactively claim the conversions.

**The lift metric can say no.** `verificationLift` reports a negative result
as plainly as a positive one, refuses to certify anything under 30 views in
the smaller cohort, and never divides by a zero baseline. The seeded dashboard
shows a 12.9× lift flagged *"directionally interesting; not yet evidence"* —
because the fully-verified cohort has 14 views, and a growth metric that can
only move one way is not a measurement.

**Discovery ranks on evidence.** The breeder directory sorts on verified
claims — there is no way to buy a higher slot because the ranking reads
nothing money can change — and shows open conflicts beside verified counts on
the same card. The `/learn` guides answer what first-time buyers actually
search ("what is limited registration", "how to read health testing"), live in
the repo as code, prerender statically, and each ends at the product surface
that makes its advice actionable.

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
│   ├── web            Next.js — buyer marketplace (public, SEO-critical)
│   ├── studio         Next.js — breeder workspace (authed)
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
| `studio` | http://localhost:3001 | Breeder workspace |
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
| **0** ✅ | Foundations | `pnpm dev` boots web + studio + api against a seeded Postgres |
| **1** ✅ | Dog record & pedigree graph | Import a 5-generation pedigree, render it, compute Wright's COI against a hand-checked case |
| **2** ✅ | Verification engine | Paste a registration number, get real OFA results with source attribution in < 5s |
| **3** ✅ | Breeder workspace | Run an entire litter from heat to eight weeks without a spreadsheet |
| **4** ✅ | Stud directory & match | Search, open a profile, run a trial pairing, see a COI for a litter that doesn't exist yet |
| **5** | Breeding transaction | Stud contract from template → signed → paid → litter-linked, in-app |
| **6** | Litter & puppy marketplace | A public litter page ranks, loads fast, shows verified parent data with zero re-entry |
| **7** | Buyer pipeline & payments | Application → approval → deposit → balance → pickup, fully tracked |
| **8** | Owner portal & record transfer | A buyer opens their dog's record on pickup day and it's already complete |
| **9** | Trust, discovery & growth | Organic traffic is the primary channel; the verified tier converts measurably better |

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

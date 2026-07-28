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

---

## Phases

| Phase | Scope | Gate |
|---|---|---|
| **0** | Foundations | `pnpm dev` boots web + studio + api against a seeded Postgres |
| **1** | Dog record & pedigree graph | Import a 5-generation pedigree, render it, compute Wright's COI against a hand-checked case |
| **2** | Verification engine | Paste a registration number, get real OFA results with source attribution in < 5s |
| **3** | Breeder workspace | Run an entire litter from heat to eight weeks without a spreadsheet |
| **4** | Stud directory & match | Search, open a profile, run a trial pairing, see a COI for a litter that doesn't exist yet |
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

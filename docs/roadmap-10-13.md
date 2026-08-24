# Roadmap — Phases 10 to 13

Phases 0–9 are shipped. This is what the research (`Stud Research doc`) and the
seed workbook (`Stud_Test_Data.xlsx`) add on top, written the same way as the
table in the README: a scope and a gate that can be checked.

## Why this order

The competitive finding drives it. The stud-marketplace concept is already
taken several times over — PairMyPet, K9Stud, StudDogCentral, Petmeetly,
BreedYourDog and others all do verified-ish listings with search and messaging.
What none of them appear to pair with it is secured payment plus an integrated
booking calendar. Verification and payment are built. **Booking is the missing
leg of the only combination that is actually differentiated**, so it goes first
once there is enough data to test it against.

Stripe Connect lands after booking rather than before, because booking is what
creates the thing worth charging for, and the deposit flow can be proven end to
end against the existing mock provider before real money is wired in.

---

## Phase 10 — Seed at realistic scale

**Scope.** Import the workbook into the dev database: 100 breeders, 100 stud
owners, 279 dogs, 939 health records, 86 litters, 110 stud listings, 569
reviews. Today's seed is roughly 35 dogs, which is too small to expose ranking,
filtering or pagination problems.

Three mappings the import has to handle rather than paper over:

- `Litters.Status` has four values (`Expected`, `Not Yet Ready (under 8 weeks)`,
  `Available Now`, `Sold Out`) against `LitterAvailability`'s six.
  "Not Yet Ready" is `AVAILABLE` with a future `goHomeFrom`, not a status.
- `StudListings.BookingStatus` carries `"Booked through 2026-12-09"` on 41 of
  110 rows. There is nowhere to put that date until Phase 11 — park the date,
  do not discard it.
- **Titles in the workbook are randomly assigned and explicitly not
  breed-accurate.** Importing as-is puts NAVHDA versatile-hunting titles on
  Poodles. Either filter titles to the breed's own discipline on import or drop
  the column; do not load it raw.

**Gate.** `/puppies` and `/studs` paginate and filter correctly against ~280
dogs, and no dog carries a title its breed does not compete for.

---

## Phase 11 — Booking and availability

The missing differentiation leg, and the largest piece of new work.

**Scope.** A stud owner controls an availability calendar. A dam owner requests
a **date range**, not a slot — breeding windows follow a heat cycle and are
multi-day by nature, so a single-date request models the wrong thing. The stud
owner accepts or declines; a deposit is charged on acceptance; the public
listing shows open or booked-through so nobody requests a committed dog.

New schema. `StudListing` currently has a `StudAvailability` enum and no dates
at all, which is why the workbook's booked-through values have nowhere to go.
`StudInquiry` already exists and is the natural parent of a booking request.

**Gate.** A dam owner requests a five-day window, the stud owner accepts, a
deposit is taken, and the public listing reads "booked through" — with nobody
having edited a status field by hand.

---

## Phase 12 — Structured credentials and breed-aware health requirements

**Scope.** Four related pieces, all currently free-text or hardcoded:

1. **Titles as a structured, filterable vocabulary.** The real alphabet soup —
   AKC conformation (CH, GCH), obedience and rally (CD, CDX, UD, RN, RA, RE,
   MACH), hunt tests (JH, SH, MH), herding (HT, PT, HS), NAVHDA, UKC (GRCH),
   CGC/CGCA, therapy (ThD, TDI, Pet Partners). `claimType` is already a
   `String`, so this is a vocabulary and filter-UI problem, not a migration.
2. **Breeder-level credentials on the kennel.** AKC Breeder of Merit and Bred
   with H.E.A.R.T. are properties of the breeder, not of a dog, and there is no
   field for them. 55 of the workbook's 100 breeders carry one.
3. **A CHIC-backed per-breed required-test table.** Expected tests are hardcoded
   as the same five for every breed (`HIP, ELBOW, EYE_CAER, CARDIAC, THYROID`),
   so a German Shorthaired Pointer and a Poodle show identical expectations.
   CHIC already defines which tests each breed is expected to have; this makes
   "not tested" mean something per breed.
4. **Brucellosis freshness.** It needs to be current within roughly 30 days of a
   mating — a rule none of the other tests have. It exists today only as
   contract prose (`{{testWindow}}`), not as anything the app can check.

**Care needed.** Service and assistance dogs are legally sensitive: there is no
universal service-dog certification, and fake credentials are something AKC and
disability advocates actively push back on. ADI accredits training programs and
IAADP sets public-access standards — neither is a per-dog certificate. Model and
word these as programme accreditation, never as a verified badge on a dog.

**Gate.** A GSP profile shows its own CHIC expectations while a Poodle shows a
different set, and a stud whose brucellosis test is 45 days old is flagged
before a booking can be accepted.

---

## Phase 13 — Stripe Connect

**Scope.** Replace the mock provider. This is a two-sided marketplace, so it
needs Connect, not a plain account: a Stud platform account, and Connect
onboarding (identity verification, bank linkage) for every breeder and stud
owner before they can be paid. That onboarding is a real flow with its own
states, not a checkbox — the workbook already carries a `StripeOnboarded` flag,
true for 88 of 100 breeders, which is roughly the right shape.

Use **Separate Charges and Transfers**: the platform collects into its own
balance and holds, then transfers to the breeder or stud owner once the
condition is met (puppy collected, stud service completed). Refunds are fast
while the money is still platform-side because no payout has happened.

**Blocking, not a footnote.** Stripe permits holding funds against a clear
condition and a commitment to release, and explicitly advises against holding
arbitrarily — with counsel if there is any doubt. This moves real money for live
animals. Get that conversation done before the phase starts, not before launch.

**Gate.** In Stripe test mode: a deposit is charged, held on the platform,
refunded in full with no payout having occurred; and a second one is charged,
held, and transferred to a connected account on completion.

---

## Not engineering — resolve alongside

- **Look at PairMyPet properly before building Phase 11.** It is the closest
  existing product to this spec (verified health badges, breed and location
  search, direct messaging). Worth knowing exactly where it stops.
- **The $2B TAM figure needs a second source.** It is one secondary source and
  likely undercounts hobby breeders, who are most of the actual user base. The
  research flags it as directional and says not to put it in a deck as-is.
- **Demo credentials are public.** `studdev1234` is in the repo and those
  accounts are live on the deployed URL. Fine for a demo, not past that.

# Verification sources

**Status of live lookups: OFF.** `VERIFY_LIVE_SOURCES=false` is the default and
should stay that way until every box below is ticked. With it off, the fixture
adapter serves the same `SourceAdapter` contract offline, so nothing downstream
is stubbed — the state machine, persistence, audit log and reconciliation
worker all run against real data shapes.

## Why this is gated

The entire pitch of this platform is "we check the receipts". A product making
that argument cannot begin by quietly hammering the search endpoint of a
non-profit that publishes health records as a public service. The standard we
hold breeders to is the standard we hold ourselves to.

So the adapters are written, tested and ready — and switched off.

## What has to be settled before switching one on

Per source, not in aggregate. Turning on OFA says nothing about AKC.

1. **Terms of use.** Read them. Note the clause and the date read below.
2. **`robots.txt`.** Check what it disallows for our user-agent.
3. **Contact.** Where a source publishes a contact address, write to them
   describing what we intend to do and at what rate, before doing it. Several
   of these bodies are small and would rather be asked.
4. **Rate ceiling.** Agree a request interval we would be comfortable
   defending. The default in `http.ts` is one request per 1.2 s per host with
   at most two retries; that is a starting point, not a target.
5. **Attribution.** Every verified claim already links back to the source
   record. Confirm the link format is the one they want.
6. **A kill switch that works.** `VERIFY_LIVE_SOURCES=false` must stop all
   outbound traffic within one deploy. Test it before going live, not after.

## Source register

| Source | Claims | Keyed on | Freshness | Live? | ToU reviewed |
|---|---|---|---|---|---|
| OFA / CHIC | Hips, elbows, eyes, cardiac, patella, thyroid, breed panels, CHIC | Registration number | 30d | ☐ | ☐ |
| AKC | Registration status, titles, DNA profile | AKC number | 30d | ☐ | ☐ |
| UKC | Registration status, titles | UKC number | 30d | ☐ | ☐ |
| CKC | Registration status, titles | CKC number | 45d | ☐ | ☐ |
| NAVHDA | NA, UT, Invitational results and scores | Registration number | 60d | ☐ | ☐ |
| AFTCA | Field trial placements | Registration number | 60d | ☐ | ☐ |
| Embark / Wisdom / UC Davis / Paw Print | Genetic panels | Uploaded certificate | 365d | n/a — human review | n/a |
| Fixture | All of the above, offline | Registration number | 30d | ✅ always | n/a |

## A note on partnerships

Public-record ingest has no dependency risk but is slower and more fragile than
a data partnership. The open decision in the roadmap — attempt a formal AKC/UKC
relationship or stay on public records — does not have to be answered before
Phase 2 ships, but it should be answered before Phase 6 opens the marketplace.
A verified badge that breaks because a registry changed its markup is worse
than one that took longer to build.

## Genetic panels are a human review, deliberately

Labs publish results to the owner, not to a searchable database. So there is no
machine to query, and the "source" is a person reading a PDF.

OCR pre-fills the reviewer's form and **nothing more**. Every suggestion carries
a confidence score and the source line it came from; below `AUTO_FILL_THRESHOLD`
the value is left blank rather than guessed. Nothing reaches `verified_claims`
until a reviewer signs off.

An OCR mis-read that turned "Carrier" into "Clear" and auto-published would be
precisely the failure this platform exists to prevent. The queue is slower. It
is supposed to be.

## Normalisation caveats

`normalize.ts` maps each source's wording onto a comparable outcome so buyers
can filter across sources. Three rules govern it:

- The verbatim result is **always** retained. Normalisation is for filtering,
  never a replacement for what the source said.
- When in doubt, `INCONCLUSIVE`. Guessing `NORMAL` is the failure that sells a
  dog.
- **Carrier is not a failure.** A carrier bred to a clear dog produces no
  affected puppies. `CARRIER` is its own outcome, rendered neutrally, and is
  excluded from `isConcerning()`. Treating carriers as disqualifying is how
  breeds lose genetic diversity, and a platform with our reach would do real
  damage getting this wrong.

Two results we deliberately refuse to grade:

- **PennHIP distraction index** — the threshold is breed-relative and we do not
  hold breed medians. Recorded as `INFORMATIONAL`.
- **BVA/KC hip score** — same reason.

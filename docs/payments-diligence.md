# Payments diligence — live animal sales

**Status:** open. Phase 0 diligence item, ships in Phase 7.
**Owner:** unassigned.

> No processor may move real money for this vertical until a processor has
> given **written** approval. `PAYMENTS_PROVIDER=mock` remains the default and
> is the only value that runs by itself.

## What exists now (Phase 13, test mode only)

`packages/payments/src/stripe-connect.ts` implements Connect using separate
charges and transfers: the platform collects onto its own balance and holds,
then transfers to the breeder's connected account once the condition is met.
Refunding while the money is still platform-side needs no clawback, because
nothing has been paid out.

It is a rehearsal of the flow, not a payment rail, and three things keep it
that way:

- `StripeConnectProvider.fromKey()` **refuses a live key** — `sk_live_` throws.
  The check is on the key rather than on a mode flag, because a flag can be set
  wrongly and `sk_live_` cannot be misread.
- `isLive` is `false` and is not configurable.
- Selecting it takes two deliberate acts: `PAYMENTS_PROVIDER=stripe-connect`
  **and** a `STRIPE_SECRET_KEY`. Neither alone does anything.

Verified against a recorded fake transport rather than a live Stripe test
account — no key was handled. The assertions are on the call *sequence*, since
that is what the pattern is about: a held deposit refunds with
`/v1/payment_intents` then `/v1/refunds` and **no** `/v1/transfers`, and a
completed one goes `/v1/payment_intents` then `/v1/transfers` to `acct_…`.

Still outstanding before real money moves, on top of the checklist below:

1. Written processor approval for live animal sales. Nothing else matters
   without it.
2. Legal advice on holding funds. Stripe permits holding against a clear
   condition and a commitment to release, and explicitly advises against
   holding arbitrarily. Deposits here sit 8–16 weeks against a live animal.
3. A run against a real Stripe test account, including a declined card and a
   connected account whose verification is incomplete.
4. Client-side payment collection. `charge()` currently uses the test card
   token; a real integration collects a payment method from the buyer.

## Why this is a blocker, not a formality

Live animal sales sit in a high-risk bucket for essentially every card
processor. The exposure profile is genuinely bad:

- **High average ticket.** Puppies run $1,500–$5,000+; stud fees $800–$3,500.
  Large tickets attract both fraud and reserve requirements.
- **Long fulfilment delay.** A deposit is taken 8–16 weeks before pickup, and
  sometimes before the litter is born. That is well outside the window most
  processors are comfortable underwriting.
- **Emotionally charged disputes.** A puppy that gets sick post-sale generates a
  chargeback with a sympathetic narrative attached. Representment is hard.
- **Category reputation.** Puppy-mill fraud has made processors wary of the
  whole vertical regardless of an individual platform's controls.

## What we need before writing code

1. **Written processor approval** naming live animal sales / pet marketplace as
   an approved MCC for our account. Verbal sales assurance is not approval.
2. **Reserve terms in writing** — rolling percentage, hold period, release
   schedule. Model the cash impact at 3×, 10× and 50× current volume.
3. **Chargeback exposure model.** At what dispute rate does the account get
   terminated, and what is our projected rate given deposit-to-pickup lag?
4. **Escrow structure decision.** Funds held by the processor vs. a licensed
   escrow partner vs. a delayed-payout model. This has money-transmitter
   implications and needs a legal read before it is chosen, not after.
5. **Refund policy enforcement rules** encoded per contract clause, not
   discretionary — discretion is what turns a refund into a dispute.

## Candidate processors

| Provider | Fit | Open questions |
|---|---|---|
| Stripe Connect | Best platform tooling, marketplace-native payouts | Live animals are restricted; needs explicit exception. Get it in writing. |
| Adyen for Platforms | Handles high-risk verticals, strong marketplace primitives | Higher volume floor; onboarding effort |
| High-risk specialist (e.g. PaymentCloud, Soar) | Will approve the vertical | Weaker platform/split-payment tooling; higher rates; may need custom escrow |
| Licensed escrow partner + ACH | Cleanest dispute story for large balances | Slow settlement; poor buyer UX for deposits |

Likely shape: **card for deposits** (small, fast, low dispute value) and
**ACH or escrow for balances** (large, where a chargeback is existential).

## Design constraints this places on Phase 7

Regardless of who we land on, build to these so the processor is swappable:

- `@stud/payments` exposes a provider interface. No processor SDK types leak
  into route handlers, the database, or the UI.
- All amounts are integer cents (invariant 2). No exceptions for "just this fee".
- Every money movement writes an immutable ledger row before the external call,
  and reconciles on webhook. Never trust an inline API response as the record.
- Refund eligibility is computed from the signed contract's clauses, not from a
  support agent's judgement.
- Payouts to breeders are gated on identity verification (Phase 9 trust & safety).

/**
 * What a signed contract actually asks of the people who signed it.
 *
 * A puppy contract is read once, at the kitchen table, and then filed. Six
 * months later nobody remembers that the spay deadline was tied to eighteen
 * months rather than six, or that the health guarantee needed a vet visit in
 * the first 72 hours, or that there is a take-back clause at all.
 *
 * This turns the clauses into dated obligations that a portal can show as
 * things with deadlines rather than as a PDF nobody opens. Every one is
 * derived from a clause EFFECT or an explicit variable — never from parsing
 * the prose, which is the same rule the money follows.
 *
 * Pure module. No I/O, and `now` is always passed in.
 */

import { getClause } from './clauses.js';
import { type ClauseInstance } from './render.js';

export type ObligationParty = 'BUYER' | 'BREEDER' | 'BOTH';

export type ObligationKind =
  | 'VET_EXAM'
  | 'ALTERATION'
  | 'ALTERATION_PROOF'
  | 'RETURN_TO_BREEDER'
  | 'NO_BREEDING'
  | 'REGISTRATION_PAPERS'
  | 'HEALTH_GUARANTEE'
  | 'CARE_STANDARD';

export interface Obligation {
  kind: ObligationKind;
  party: ObligationParty;
  title: string;
  detail: string;
  /** Null for a standing obligation with no deadline. */
  dueOn: Date | null;
  /** Null when it never expires — a take-back clause is for life. */
  expiresOn: Date | null;
  /** True while it is live: not expired, and not yet satisfied elsewhere. */
  active: boolean;
  /** Set when a deadline has passed. */
  overdue: boolean;
  clauseId: string;
}

export interface ObligationContext {
  /** The clauses as signed. */
  instances: readonly ClauseInstance[];
  dateOfBirth: Date;
  /** When the dog was collected. Some windows run from here, not from birth. */
  collectedOn: Date | null;
  now: Date;
  /** Already done, so the portal stops nagging. */
  alterationConfirmed?: boolean;
  vetExamRecorded?: boolean;
  registrationReceived?: boolean;
}

const DAY = 86_400_000;

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * DAY);
}

/** Months, as the calendar means them rather than as 30-day blocks. */
function addMonths(from: Date, months: number): Date {
  const d = new Date(from.getTime());
  d.setUTCMonth(d.getUTCMonth() + months);
  return d;
}

/**
 * Parse a human window — "72 hours", "30 days", "14 days" — into days.
 *
 * These come from a TEXT variable a breeder typed, so this is genuinely
 * reading prose. It is confined to durations, it rounds up, and it returns
 * null rather than guessing when it does not recognise the shape. A duration
 * nobody can parse becomes an obligation with no deadline, which is honest;
 * inventing one would put a date in front of an owner that their contract
 * does not support.
 */
export function parseWindowDays(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = String(raw).toLowerCase();
  const hours = /(\d+)\s*hour/.exec(text);
  if (hours) return Math.ceil(Number(hours[1]) / 24);
  const days = /(\d+)\s*day/.exec(text);
  if (days) return Number(days[1]);
  const weeks = /(\d+)\s*week/.exec(text);
  if (weeks) return Number(weeks[1]) * 7;
  const months = /(\d+)\s*month/.exec(text);
  if (months) return Number(months[1]) * 30;
  return null;
}

/** Months from an alteration deadline like "eighteen months of age". */
const WORD_MONTHS: Record<string, number> = {
  six: 6, eight: 8, nine: 9, ten: 10, twelve: 12, fourteen: 14,
  sixteen: 16, eighteen: 18, twenty: 20, 'twenty-four': 24,
};

export function parseAgeMonths(raw: string | null | undefined): number | null {
  if (!raw) return null;
  const text = String(raw).toLowerCase();
  const digits = /(\d+)\s*month/.exec(text);
  if (digits) return Number(digits[1]);
  for (const [word, months] of Object.entries(WORD_MONTHS)) {
    if (text.includes(`${word} month`)) return months;
  }
  const years = /(\d+)\s*year/.exec(text);
  if (years) return Number(years[1]) * 12;
  return null;
}

/** The guarantee period, in months, from the CHOICE value. */
const GUARANTEE_MONTHS: Record<string, number> = {
  TWELVE_MONTHS: 12,
  TWENTY_FOUR_MONTHS: 24,
  THIRTY_SIX_MONTHS: 36,
};

/**
 * Every live obligation this contract created, with dates.
 *
 * Returned in the order an owner meets them: the vet exam in the first days,
 * the papers, the spay deadline, then the standing ones that never expire.
 */
export function deriveObligations(ctx: ObligationContext): Obligation[] {
  const out: Obligation[] = [];
  const { now, dateOfBirth, collectedOn } = ctx;

  for (const instance of ctx.instances) {
    const clause = getClause(instance.clauseId, instance.clauseVersion);
    if (!clause) continue;
    const v = instance.values;

    // ── The vet exam that the health guarantee turns on ──
    if (clause.id === 'health.puppy_guarantee') {
      const windowDays = parseWindowDays(String(v.initialExamWindow ?? ''));
      const dueOn = collectedOn && windowDays != null ? addDays(collectedOn, windowDays) : null;
      out.push({
        kind: 'VET_EXAM',
        party: 'BUYER',
        title: 'Have your own vet examine the puppy',
        detail: windowDays
          ? `Within ${v.initialExamWindow} of collection. Missing this window can cost you the right to return the puppy for a refund if the vet finds something pre-existing — it is the single most time-critical thing in your contract.`
          : 'Your contract asks for an examination by your own vet shortly after collection.',
        dueOn,
        expiresOn: dueOn,
        active: !ctx.vetExamRecorded && (dueOn == null || dueOn.getTime() >= now.getTime()),
        overdue: !ctx.vetExamRecorded && dueOn != null && dueOn.getTime() < now.getTime(),
        clauseId: clause.id,
      });

      const months = GUARANTEE_MONTHS[String(v.guaranteePeriod ?? '')] ?? null;
      const expiresOn = months ? addMonths(dateOfBirth, months) : null;
      out.push({
        kind: 'HEALTH_GUARANTEE',
        party: 'BREEDER',
        title: 'Hereditary health guarantee',
        // The date is on `expiresOn` as a value. Formatting it into the prose
        // here would print an ISO string next to dates the UI has formatted
        // for the reader's locale.
        detail: months
          ? `${months} months from birth. Covers a life-threatening or life-limiting hereditary condition diagnosed by a vet, confirmed by a second opinion the breeder may obtain at their own cost.`
          : 'Your contract includes a hereditary health guarantee.',
        dueOn: null,
        expiresOn,
        active: expiresOn == null || expiresOn.getTime() >= now.getTime(),
        overdue: false,
        clauseId: clause.id,
      });
    }

    // ── Spay/neuter ──
    if (clause.effects?.requiresAlteration) {
      const months = parseAgeMonths(String(v.alterationDeadline ?? ''));
      const dueOn = months ? addMonths(dateOfBirth, months) : null;
      out.push({
        kind: 'ALTERATION',
        party: 'BUYER',
        title: 'Have the dog spayed or neutered',
        detail: `Your contract says ${v.alterationDeadline ?? 'by the age it names'}. Talk to your vet about timing — for a larger breed there are good orthopaedic reasons to wait for skeletal maturity, and your contract allows for that.`,
        dueOn,
        expiresOn: null,
        active: !ctx.alterationConfirmed,
        overdue: !ctx.alterationConfirmed && dueOn != null && dueOn.getTime() < now.getTime(),
        clauseId: clause.id,
      });

      const proofDays = parseWindowDays(String(v.confirmationWindow ?? ''));
      out.push({
        kind: 'ALTERATION_PROOF',
        party: 'BUYER',
        title: 'Send the breeder confirmation from your vet',
        detail: proofDays
          ? `Within ${v.confirmationWindow} of the procedure.`
          : 'Your contract asks for veterinary confirmation afterwards.',
        dueOn: null,
        expiresOn: null,
        active: !ctx.alterationConfirmed,
        overdue: false,
        clauseId: clause.id,
      });
    }

    // ── Registration paperwork ──
    if (clause.id === 'ownership.puppy_registration') {
      const windowDays = parseWindowDays(String(v.paperworkWindow ?? ''));
      const dueOn = collectedOn && windowDays != null ? addDays(collectedOn, windowDays) : null;
      const type = String(v.registrationType ?? clause.effects?.definesRegistrationType ?? '');
      out.push({
        kind: 'REGISTRATION_PAPERS',
        party: 'BREEDER',
        title: 'Registration paperwork',
        detail:
          type === 'NONE'
            ? 'This puppy was sold without registration paperwork.'
            : `Sold on ${type === 'FULL' ? 'full' : 'limited'} registration${
                windowDays ? `, due within ${v.paperworkWindow} of the balance being paid` : ''
              }.${
                type === 'LIMITED'
                  ? ' Limited registration means any puppies this dog produces can\u2019t be registered. This is standard for pet homes.'
                  : ''
              }`,
        dueOn,
        expiresOn: null,
        active: type !== 'NONE' && !ctx.registrationReceived,
        overdue:
          type !== 'NONE' &&
          !ctx.registrationReceived &&
          dueOn != null &&
          dueOn.getTime() < now.getTime(),
        clauseId: clause.id,
      });

      if (type === 'LIMITED') {
        out.push({
          kind: 'NO_BREEDING',
          party: 'BUYER',
          title: 'This dog is not to be bred',
          detail:
            'This dog is on limited registration and your contract rules out breeding. If your plans change, talk to your breeder first.',
          dueOn: null,
          expiresOn: null,
          active: true,
          overdue: false,
          clauseId: clause.id,
        });
      }
    }

    // ── The take-back ──
    if (clause.effects?.requiresReturnToBreeder) {
      out.push({
        kind: 'RETURN_TO_BREEDER',
        party: 'BOTH',
        title: 'If you ever cannot keep this dog',
        detail:
          'If circumstances ever change, your breeder has committed to taking this dog back — at any age, for any reason. Contact them before rehoming, surrendering, or anything else. They want the call.',
        dueOn: null,
        expiresOn: null,
        active: true,
        overdue: false,
        clauseId: clause.id,
      });
    }

    if (clause.id === 'care.puppy_welfare') {
      out.push({
        kind: 'CARE_STANDARD',
        party: 'BUYER',
        title: 'How the dog is to be kept',
        detail:
          'As a companion in your home, with routine and emergency veterinary care, and never permanently kennelled, chained or kept outdoors.',
        dueOn: null,
        expiresOn: null,
        active: true,
        overdue: false,
        clauseId: clause.id,
      });
    }
  }

  // Deadlines first, soonest first; standing obligations after.
  return out.sort((a, b) => {
    if (a.dueOn && b.dueOn) return a.dueOn.getTime() - b.dueOn.getTime();
    if (a.dueOn) return -1;
    if (b.dueOn) return 1;
    return 0;
  });
}

// ── Transfer rules ─────────────────────────────────────────────────────────

export interface TransferCheck {
  /** Whether the contract requires the dog to go back to the breeder. */
  requiresReturnToBreeder: boolean;
  /** Whether this transfer may proceed without the breeder being involved. */
  allowed: boolean;
  message: string;
}

/**
 * May this owner rehome this dog?
 *
 * The answer is almost always "not without talking to the breeder first", and
 * the point of surfacing it here is that the owner reads it at the moment they
 * are deciding — not in a clause they signed two years ago.
 *
 * Stud does not block the transfer. It cannot enforce a private contract, and
 * pretending otherwise would push people to do it off-platform where nobody
 * can see it at all. What it does is state the term, notify the breeder, and
 * record that both happened.
 */
export function checkTransfer(args: {
  instances: readonly ClauseInstance[];
  kind: 'REHOME' | 'RETURN_TO_BREEDER' | 'CO_OWNERSHIP_CHANGE' | 'PLACEMENT';
}): TransferCheck {
  const requiresReturn = args.instances.some(
    (i) => getClause(i.clauseId, i.clauseVersion)?.effects?.requiresReturnToBreeder,
  );

  if (args.kind !== 'REHOME') {
    return {
      requiresReturnToBreeder: requiresReturn,
      allowed: true,
      message: '',
    };
  }

  if (!requiresReturn) {
    return {
      requiresReturnToBreeder: false,
      allowed: true,
      message:
        'This dog’s contract does not restrict rehoming. Telling the breeder anyway is a kindness — most want to know where their dogs end up.',
    };
  }

  return {
    requiresReturnToBreeder: true,
    allowed: true,
    message:
      'This dog’s contract asks that it come back to the breeder rather than be rehomed. They have committed to taking it back at any age and for any reason — please contact them first. If you continue, the breeder will be notified and this transfer will be recorded as being outside the contract.',
  };
}

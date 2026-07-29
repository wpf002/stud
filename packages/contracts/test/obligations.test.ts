import { describe, expect, it } from 'vitest';
import {
  checkTransfer,
  deriveObligations,
  draftFromTemplate,
  parseAgeMonths,
  parseWindowDays,
  type ClauseInstance,
  type Obligation,
  type ObligationKind,
} from '../src/index.js';

const d = (iso: string) => new Date(iso);

function puppyClauses(over: Record<string, Record<string, string | number>> = {}): ClauseInstance[] {
  return draftFromTemplate('PUPPY_SALE', {
    'parties.puppy_sale': {
      agreementDate: '2026-09-05',
      breederName: 'Cedar Run',
      buyerName: 'Dana Whitfield',
      puppyDescription: 'a female Golden Retriever puppy, red collar',
      dateOfBirth: '2026-07-10',
      damName: 'Marigold',
      sireName: 'Atlas',
    },
    'fee.purchase_price': {
      priceTotal: 320_000,
      depositAmount: 50_000,
      balanceAmount: 270_000,
    },
    'general.governing_law': { jurisdiction: 'the State of Texas' },
    ...over,
  })!.instances;
}

function byKind(list: Obligation[], kind: ObligationKind) {
  return list.find((o) => o.kind === kind);
}

describe('parsing windows', () => {
  it('reads hours, days, weeks and months', () => {
    expect(parseWindowDays('72 hours')).toBe(3);
    expect(parseWindowDays('30 days')).toBe(30);
    expect(parseWindowDays('2 weeks')).toBe(14);
    expect(parseWindowDays('6 months')).toBe(180);
  });

  it('rounds a part-day up rather than down', () => {
    // 36 hours is a day and a half. Rounding down would put the deadline
    // before the contract does.
    expect(parseWindowDays('36 hours')).toBe(2);
  });

  /**
   * Returning null rather than guessing is the point. An unparseable duration
   * becomes an obligation with no deadline, which is honest — inventing one
   * would put a date in front of an owner their contract does not support.
   */
  it('returns null on something it does not recognise', () => {
    expect(parseWindowDays('as soon as practicable')).toBeNull();
    expect(parseWindowDays('')).toBeNull();
    expect(parseWindowDays(null)).toBeNull();
  });

  it('reads an age in words as well as digits', () => {
    expect(parseAgeMonths('eighteen months of age, or earlier on veterinary advice')).toBe(18);
    expect(parseAgeMonths('6 months')).toBe(6);
    expect(parseAgeMonths('2 years')).toBe(24);
    expect(parseAgeMonths('when the vet says so')).toBeNull();
  });
});

describe('obligations from a signed puppy contract', () => {
  const base = {
    instances: puppyClauses(),
    dateOfBirth: d('2026-07-10'),
    collectedOn: d('2026-09-06'),
    now: d('2026-09-07'),
  };

  it('puts the vet exam first, with the deadline the contract sets', () => {
    const list = deriveObligations(base);
    const exam = byKind(list, 'VET_EXAM')!;
    // 72 hours from collection.
    expect(exam.dueOn?.toISOString().slice(0, 10)).toBe('2026-09-09');
    expect(exam.party).toBe('BUYER');
    expect(list[0]!.kind).toBe('VET_EXAM');
  });

  it('marks the vet exam overdue once the window has passed', () => {
    const list = deriveObligations({ ...base, now: d('2026-09-20') });
    const exam = byKind(list, 'VET_EXAM')!;
    expect(exam.overdue).toBe(true);
    expect(exam.active).toBe(false);
  });

  it('stops nagging once the exam is recorded', () => {
    const list = deriveObligations({ ...base, now: d('2026-09-20'), vetExamRecorded: true });
    const exam = byKind(list, 'VET_EXAM')!;
    expect(exam.overdue).toBe(false);
    expect(exam.active).toBe(false);
  });

  it('dates the spay deadline from birth, not from collection', () => {
    const list = deriveObligations(base);
    const alter = byKind(list, 'ALTERATION')!;
    // Eighteen months from 2026-07-10.
    expect(alter.dueOn?.toISOString().slice(0, 10)).toBe('2028-01-10');
  });

  it('dates the health guarantee from birth and expires it', () => {
    const list = deriveObligations(base);
    const g = byKind(list, 'HEALTH_GUARANTEE')!;
    expect(g.expiresOn?.toISOString().slice(0, 10)).toBe('2028-07-10');
    // The date belongs on the field, not baked into prose the UI cannot
    // format — an ISO string next to locale-formatted dates reads as a bug.
    expect(g.detail).not.toMatch(/\d{4}-\d{2}-\d{2}/);
    expect(g.active).toBe(true);
    expect(g.party).toBe('BREEDER');

    const later = deriveObligations({ ...base, now: d('2029-01-01') });
    expect(byKind(later, 'HEALTH_GUARANTEE')!.active).toBe(false);
  });

  it('carries a take-back obligation that never expires', () => {
    const list = deriveObligations({ ...base, now: d('2035-01-01') });
    const back = byKind(list, 'RETURN_TO_BREEDER')!;
    expect(back.expiresOn).toBeNull();
    expect(back.active).toBe(true);
    expect(back.party).toBe('BOTH');
    expect(back.detail).toMatch(/not a penalty/i);
  });

  it('explains limited registration rather than just stating it', () => {
    const list = deriveObligations(base);
    expect(byKind(list, 'NO_BREEDING')).toBeDefined();
    expect(byKind(list, 'REGISTRATION_PAPERS')!.detail).toMatch(/not a comment on the dog/i);
  });

  it('does not raise a breeding prohibition on full registration', () => {
    const instances = puppyClauses();
    const reg = instances.find((i) => i.clauseId === 'ownership.puppy_registration')!;
    reg.values.registrationType = 'FULL';
    const list = deriveObligations({ ...base, instances });
    expect(byKind(list, 'NO_BREEDING')).toBeUndefined();
  });

  it('leaves a deadline off when the contract worded it unparseably', () => {
    const instances = puppyClauses();
    const guarantee = instances.find((i) => i.clauseId === 'health.puppy_guarantee')!;
    guarantee.values.initialExamWindow = 'as soon as you reasonably can';
    const exam = byKind(deriveObligations({ ...base, instances }), 'VET_EXAM')!;
    expect(exam.dueOn).toBeNull();
    expect(exam.overdue).toBe(false);
    expect(exam.active).toBe(true);
  });

  it('has no deadline to give before the dog has been collected', () => {
    const exam = byKind(deriveObligations({ ...base, collectedOn: null }), 'VET_EXAM')!;
    expect(exam.dueOn).toBeNull();
  });

  it('sorts dated obligations before standing ones, soonest first', () => {
    const list = deriveObligations(base);
    const dated = list.filter((o) => o.dueOn);
    const times = dated.map((o) => o.dueOn!.getTime());
    expect([...times].sort((a, b) => a - b)).toEqual(times);
    expect(list.at(-1)!.dueOn).toBeNull();
  });
});

describe('transfer checks', () => {
  it('warns, but does not block, a rehome under a take-back clause', () => {
    // Stud cannot enforce a private contract, and pretending otherwise would
    // push people to do it off-platform where nobody can see it at all.
    const check = checkTransfer({ instances: puppyClauses(), kind: 'REHOME' });
    expect(check.requiresReturnToBreeder).toBe(true);
    expect(check.allowed).toBe(true);
    expect(check.message).toMatch(/contact them first/i);
    expect(check.message).toMatch(/outside the contract/i);
  });

  it('still suggests telling the breeder when nothing requires it', () => {
    const instances = puppyClauses().filter((i) => i.clauseId !== 'care.return_to_breeder');
    const check = checkTransfer({ instances, kind: 'REHOME' });
    expect(check.requiresReturnToBreeder).toBe(false);
    expect(check.allowed).toBe(true);
    expect(check.message).toMatch(/kindness/i);
  });

  it('says nothing on a return to the breeder — that is the clause working', () => {
    const check = checkTransfer({ instances: puppyClauses(), kind: 'RETURN_TO_BREEDER' });
    expect(check.allowed).toBe(true);
    expect(check.message).toBe('');
  });

  it('reports no obligations for a contract with no clauses', () => {
    expect(deriveObligations({
      instances: [],
      dateOfBirth: d('2026-07-10'),
      collectedOn: d('2026-09-06'),
      now: d('2026-09-07'),
    })).toEqual([]);
  });
});

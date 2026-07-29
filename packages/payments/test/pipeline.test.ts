import { describe, expect, it } from 'vitest';
import {
  assessDepositRefund,
  assessPickupReadiness,
  buildPickOrder,
  canAdvance,
  isTerminal,
  type ApplicationStage,
  type PickCandidate,
} from '../src/pipeline.js';

const d = (iso: string) => new Date(iso);

describe('pipeline stages', () => {
  it('walks the happy path end to end', () => {
    const path: ApplicationStage[] = [
      'SUBMITTED',
      'IN_REVIEW',
      'APPROVED',
      'DEPOSIT_PAID',
      'MATCHED',
      'PAID_IN_FULL',
      'COMPLETED',
    ];
    for (let i = 0; i < path.length - 1; i++) {
      expect(canAdvance(path[i]!, path[i + 1]!).allowed).toBe(true);
    }
  });

  /**
   * The ordering invariant. Money must not move before the breeder has
   * accepted the buyer — a deposit from someone you have not approved is a
   * deposit you have to give back.
   */
  it('refuses a deposit before approval, and says why', () => {
    for (const from of ['SUBMITTED', 'IN_REVIEW', 'WAITLISTED'] as ApplicationStage[]) {
      const t = canAdvance(from, 'DEPOSIT_PAID');
      expect(t.allowed).toBe(false);
      expect(t.reason).toMatch(/approved/i);
    }
    expect(canAdvance('APPROVED', 'DEPOSIT_PAID').allowed).toBe(true);
  });

  it('refuses to match a puppy before the deposit is paid', () => {
    expect(canAdvance('APPROVED', 'MATCHED').allowed).toBe(false);
    expect(canAdvance('APPROVED', 'MATCHED').reason).toMatch(/pick order|deposit/i);
    expect(canAdvance('DEPOSIT_PAID', 'MATCHED').allowed).toBe(true);
  });

  it('refuses to complete before the balance is settled', () => {
    const t = canAdvance('MATCHED', 'COMPLETED');
    expect(t.allowed).toBe(false);
    expect(t.reason).toMatch(/balance/i);
  });

  it('never advances out of a terminal stage', () => {
    for (const stage of ['COMPLETED', 'DECLINED', 'WITHDRAWN'] as ApplicationStage[]) {
      expect(isTerminal(stage)).toBe(true);
      expect(canAdvance(stage, 'APPROVED').allowed).toBe(false);
      expect(canAdvance(stage, 'IN_REVIEW').allowed).toBe(false);
    }
  });

  it('lets a buyer withdraw from any live stage', () => {
    for (const stage of [
      'SUBMITTED',
      'IN_REVIEW',
      'APPROVED',
      'WAITLISTED',
      'DEPOSIT_PAID',
      'MATCHED',
      'PAID_IN_FULL',
    ] as ApplicationStage[]) {
      expect(canAdvance(stage, 'WITHDRAWN').allowed).toBe(true);
    }
  });

  it('lets a waitlisted applicant be promoted when a place opens', () => {
    expect(canAdvance('WAITLISTED', 'APPROVED').allowed).toBe(true);
  });

  it('does not treat a no-op as a valid transition', () => {
    expect(canAdvance('APPROVED', 'APPROVED').allowed).toBe(false);
  });
});

describe('pick order', () => {
  function candidate(over: Partial<PickCandidate> & { applicationId: string }): PickCandidate {
    return {
      stage: 'DEPOSIT_PAID',
      applicationSubmittedAt: d('2026-06-01'),
      depositPaidAt: d('2026-07-01'),
      ...over,
    };
  }

  it('leaves out anyone who has not paid a deposit', () => {
    const order = buildPickOrder([
      candidate({ applicationId: 'paid' }),
      candidate({ applicationId: 'approved-only', stage: 'APPROVED', depositPaidAt: null }),
      candidate({ applicationId: 'declined', stage: 'DECLINED' }),
    ]);
    expect(order.map((s) => s.applicationId)).toEqual(['paid']);
  });

  it('orders by deposit time, not application time', () => {
    // The fair default: the point at which somebody actually committed, and
    // the only one of the three dates both parties can see.
    const order = buildPickOrder([
      candidate({
        applicationId: 'applied-first',
        applicationSubmittedAt: d('2026-01-01'),
        depositPaidAt: d('2026-08-01'),
      }),
      candidate({
        applicationId: 'paid-first',
        applicationSubmittedAt: d('2026-05-01'),
        depositPaidAt: d('2026-06-01'),
      }),
    ]);
    expect(order.map((s) => s.applicationId)).toEqual(['paid-first', 'applied-first']);
  });

  it('honours a position the breeder set by hand above everything else', () => {
    const order = buildPickOrder([
      candidate({ applicationId: 'early-deposit', depositPaidAt: d('2026-01-01') }),
      candidate({ applicationId: 'promised-first', manualPosition: 1, depositPaidAt: d('2026-09-01') }),
    ]);
    expect(order[0]!.applicationId).toBe('promised-first');
    expect(order[0]!.reason).toMatch(/breeder/i);
  });

  it('falls back to application time when deposits landed together', () => {
    const same = d('2026-07-01');
    const order = buildPickOrder([
      candidate({ applicationId: 'later', applicationSubmittedAt: d('2026-06-10'), depositPaidAt: same }),
      candidate({ applicationId: 'earlier', applicationSubmittedAt: d('2026-06-01'), depositPaidAt: same }),
    ]);
    expect(order.map((s) => s.applicationId)).toEqual(['earlier', 'later']);
  });

  it('marks exactly one buyer as next, skipping those already matched', () => {
    const order = buildPickOrder([
      candidate({ applicationId: 'first', depositPaidAt: d('2026-06-01'), matchedPuppyId: 'pup-1', stage: 'MATCHED' }),
      candidate({ applicationId: 'second', depositPaidAt: d('2026-06-02') }),
      candidate({ applicationId: 'third', depositPaidAt: d('2026-06-03') }),
    ]);
    expect(order.filter((s) => s.isNext).map((s) => s.applicationId)).toEqual(['second']);
    // A matched buyer keeps their slot rather than dropping off the list.
    expect(order.map((s) => s.position)).toEqual([1, 2, 3]);
  });

  it('marks nobody as next when everyone has a puppy', () => {
    const order = buildPickOrder([
      candidate({ applicationId: 'a', stage: 'MATCHED', matchedPuppyId: 'p1' }),
      candidate({ applicationId: 'b', stage: 'MATCHED', matchedPuppyId: 'p2' }),
    ]);
    expect(order.some((s) => s.isNext)).toBe(false);
  });
});

describe('deposit refunds', () => {
  const base = { depositCents: 50_000, hasPicked: false, breederWithdrew: false };

  it('refunds in full when there is no signed contract term', () => {
    const r = assessDepositRefund({ ...base, term: null });
    expect(r.refundableCents).toBe(50_000);
    expect(r.reason).toMatch(/nobody agreed/i);
  });

  /**
   * A "non-refundable" deposit is consideration for the BUYER's commitment. It
   * cannot also be a fee for the breeder changing their mind.
   */
  it('refunds in full when the breeder is the one who withdrew, whatever the term says', () => {
    for (const term of ['NON_REFUNDABLE', 'REFUNDABLE_UNTIL_PICK', 'FULLY_REFUNDABLE'] as const) {
      const r = assessDepositRefund({ ...base, term, breederWithdrew: true, hasPicked: true });
      expect(r.refundableCents).toBe(50_000);
      expect(r.forfeitedCents).toBe(0);
    }
  });

  it('forfeits a non-refundable deposit when the buyer withdraws', () => {
    const r = assessDepositRefund({ ...base, term: 'NON_REFUNDABLE' });
    expect(r.refundableCents).toBe(0);
    expect(r.forfeitedCents).toBe(50_000);
  });

  it('turns on whether a puppy was actually chosen', () => {
    const before = assessDepositRefund({ ...base, term: 'REFUNDABLE_UNTIL_PICK', hasPicked: false });
    const after = assessDepositRefund({ ...base, term: 'REFUNDABLE_UNTIL_PICK', hasPicked: true });
    expect(before.refundableCents).toBe(50_000);
    expect(after.forfeitedCents).toBe(50_000);
  });

  it('refunds in full when no puppy suited, through nobody’s fault', () => {
    const r = assessDepositRefund({
      ...base,
      term: 'NON_REFUNDABLE',
      hasPicked: false,
      noSuitablePuppy: true,
    });
    expect(r.refundableCents).toBe(50_000);
  });

  it('handles a zero deposit without inventing a refund', () => {
    const r = assessDepositRefund({ ...base, depositCents: 0, term: 'NON_REFUNDABLE' });
    expect(r.refundableCents).toBe(0);
    expect(r.forfeitedCents).toBe(0);
  });
});

describe('pickup readiness', () => {
  const base = {
    bornOn: d('2026-07-10'),
    pickupOn: d('2026-09-05'),
    balanceOutstandingCents: 0,
    contractSigned: true,
    microchipped: true,
    vaccinationRecorded: true,
    vetCheckRecorded: true,
  };

  it('clears a puppy that is old enough, paid for and under contract', () => {
    const r = assessPickupReadiness(base);
    expect(r.ready).toBe(true);
    expect(r.blockers).toEqual([]);
  });

  it('blocks a puppy under eight weeks', () => {
    const r = assessPickupReadiness({ ...base, pickupOn: d('2026-08-20') });
    expect(r.ready).toBe(false);
    expect(r.blockers[0]).toMatch(/eight weeks/i);
  });

  it('clears at exactly eight weeks', () => {
    const r = assessPickupReadiness({ ...base, pickupOn: d('2026-09-04') });
    expect(r.ready).toBe(true);
  });

  it('blocks an outstanding balance and names the amount', () => {
    const r = assessPickupReadiness({ ...base, balanceOutstandingCents: 270_000 });
    expect(r.ready).toBe(false);
    expect(r.blockers.some((b) => b.includes('$2,700.00'))).toBe(true);
  });

  it('blocks an unsigned contract', () => {
    const r = assessPickupReadiness({ ...base, contractSigned: false });
    expect(r.ready).toBe(false);
    expect(r.blockers.some((b) => /contract/i.test(b))).toBe(true);
  });

  it('warns about missing records without blocking the handover', () => {
    // A breeder who did these and did not log them should not be stopped at
    // the door by their own paperwork.
    const r = assessPickupReadiness({
      ...base,
      microchipped: false,
      vaccinationRecorded: false,
      vetCheckRecorded: false,
    });
    expect(r.ready).toBe(true);
    expect(r.warnings).toHaveLength(3);
  });

  it('reports every blocker at once rather than one at a time', () => {
    const r = assessPickupReadiness({
      ...base,
      pickupOn: d('2026-08-01'),
      balanceOutstandingCents: 100_000,
      contractSigned: false,
    });
    expect(r.blockers).toHaveLength(3);
  });
});

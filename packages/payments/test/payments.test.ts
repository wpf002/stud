import { describe, expect, it } from 'vitest';
import {
  LedgerError,
  MockProvider,
  PaymentError,
  ScheduleError,
  amountOutstanding,
  amountPaid,
  applyProgress,
  assertBalanced,
  assessEscrow,
  balanceOf,
  buildSchedule,
  captureToEscrow,
  createProvider,
  isLedgerBalanced,
  platformFee,
  refundFromEscrow,
  releaseFromEscrow,
  reverseTransaction,
  type BreedingProgress,
  type LedgerEntry,
} from '../src/index.js';

const at = new Date('2026-07-29T12:00:00Z');
const ctx = { transactionId: 't1', referenceType: 'Contract', referenceId: 'c1', occurredAt: at };

const progress = (over: Partial<BreedingProgress> = {}): BreedingProgress => ({
  contractSigned: false,
  tieRecorded: false,
  pregnancyConfirmed: false,
  litterWhelped: false,
  ...over,
});

// ── Ledger ──────────────────────────────────────────────────────────────────

describe('ledger integrity', () => {
  it('accepts a balanced transaction', () => {
    expect(() => assertBalanced(captureToEscrow(ctx, { payerId: 'u1', amountCents: 60000, isDeposit: true }))).not.toThrow();
  });

  it('refuses an unbalanced transaction', () => {
    const legs: LedgerEntry[] = [
      { transactionId: 't', account: { kind: 'ESCROW' }, amountCents: 100, reason: 'ESCROW_HELD', referenceType: 'x', referenceId: 'y', occurredAt: at },
      { transactionId: 't', account: { kind: 'EXTERNAL' }, amountCents: -90, reason: 'DEPOSIT_CAPTURED', referenceType: 'x', referenceId: 'y', occurredAt: at },
    ];
    expect(() => assertBalanced(legs)).toThrow(LedgerError);
    expect(() => assertBalanced(legs)).toThrow(/sum to 10 cents/);
  });

  it('refuses a non-integer amount', () => {
    const legs: LedgerEntry[] = [
      { transactionId: 't', account: { kind: 'ESCROW' }, amountCents: 100.5, reason: 'ESCROW_HELD', referenceType: 'x', referenceId: 'y', occurredAt: at },
      { transactionId: 't', account: { kind: 'EXTERNAL' }, amountCents: -100.5, reason: 'DEPOSIT_CAPTURED', referenceType: 'x', referenceId: 'y', occurredAt: at },
    ];
    expect(() => assertBalanced(legs)).toThrow(/integer cents/);
  });

  it('refuses a zero-amount leg', () => {
    const legs: LedgerEntry[] = [
      { transactionId: 't', account: { kind: 'ESCROW' }, amountCents: 0, reason: 'ESCROW_HELD', referenceType: 'x', referenceId: 'y', occurredAt: at },
    ];
    expect(() => assertBalanced(legs)).toThrow(/records nothing/);
  });
});

describe('money movements', () => {
  it('captures money into escrow', () => {
    const legs = captureToEscrow(ctx, { payerId: 'buyer', amountCents: 60000, isDeposit: true });
    expect(balanceOf(legs, { kind: 'ESCROW' })).toBe(60000);
    expect(balanceOf(legs, { kind: 'EXTERNAL' })).toBe(-60000);
  });

  it('releases to the seller, taking the platform fee at release', () => {
    // The fee is taken on release, not on capture, so a refunded breeding
    // earns the platform nothing.
    const legs = releaseFromEscrow(ctx, { sellerId: 'seller', amountCents: 60000, platformFeeCents: 3600 });
    expect(balanceOf(legs, { kind: 'SELLER', ownerId: 'seller' })).toBe(56400);
    expect(balanceOf(legs, { kind: 'PLATFORM_FEE' })).toBe(3600);
    expect(balanceOf(legs, { kind: 'ESCROW' })).toBe(-60000);
  });

  it('refuses a fee larger than the amount released', () => {
    expect(() =>
      releaseFromEscrow(ctx, { sellerId: 's', amountCents: 100, platformFeeCents: 200 }),
    ).toThrow(LedgerError);
  });

  it('refunds without taking a fee', () => {
    const legs = refundFromEscrow(ctx, { payerId: 'buyer', amountCents: 60000 });
    expect(balanceOf(legs, { kind: 'PLATFORM_FEE' })).toBe(0);
    expect(balanceOf(legs, { kind: 'ESCROW' })).toBe(-60000);
  });

  it('reverses by mirroring, never by deleting', () => {
    const original = captureToEscrow(ctx, { payerId: 'buyer', amountCents: 60000, isDeposit: true });
    const reversal = reverseTransaction(original, { ...ctx, transactionId: 't2' });
    expect(reversal[0]!.reversesTransactionId).toBe('t1');
    // Both remain; together they net to nothing.
    expect(isLedgerBalanced([...original, ...reversal])).toBe(true);
    expect(balanceOf([...original, ...reversal], { kind: 'ESCROW' })).toBe(0);
  });

  it('keeps the whole ledger balanced across a full lifecycle', () => {
    const entries = [
      ...captureToEscrow(ctx, { payerId: 'buyer', amountCents: 60000, isDeposit: true }),
      ...captureToEscrow({ ...ctx, transactionId: 't2' }, { payerId: 'buyer', amountCents: 160000, isDeposit: false }),
      ...releaseFromEscrow({ ...ctx, transactionId: 't3' }, { sellerId: 'seller', amountCents: 220000, platformFeeCents: 13200 }),
    ];
    expect(isLedgerBalanced(entries)).toBe(true);
    expect(balanceOf(entries, { kind: 'ESCROW' })).toBe(0);
    expect(balanceOf(entries, { kind: 'SELLER', ownerId: 'seller' })).toBe(206800);
  });
});

// ── Schedule ────────────────────────────────────────────────────────────────

describe('payment schedule', () => {
  it('splits a fee into deposit and balance', () => {
    const s = buildSchedule({ totalCents: 220000, depositCents: 60000, balanceTrigger: 'ON_CONFIRMED_PREGNANCY' });
    expect(s.instalments.map((i) => i.amountCents)).toEqual([60000, 160000]);
    expect(s.instalments[1]!.trigger).toBe('ON_CONFIRMED_PREGNANCY');
  });

  it('handles a fee with no deposit', () => {
    const s = buildSchedule({ totalCents: 220000, depositCents: 0, balanceTrigger: 'ON_WHELP' });
    expect(s.instalments).toHaveLength(1);
    expect(s.instalments[0]!.key).toBe('balance');
  });

  it('handles a deposit-only fee', () => {
    const s = buildSchedule({ totalCents: 60000, depositCents: 60000, balanceTrigger: 'ON_WHELP' });
    expect(s.instalments).toHaveLength(1);
    expect(s.instalments[0]!.key).toBe('deposit');
  });

  it('refuses a deposit larger than the total', () => {
    expect(() => buildSchedule({ totalCents: 100, depositCents: 200, balanceTrigger: 'ON_WHELP' })).toThrow(ScheduleError);
  });

  it('refuses non-integer amounts', () => {
    expect(() => buildSchedule({ totalCents: 100.5, depositCents: 0, balanceTrigger: 'ON_WHELP' })).toThrow(/integer cents/);
  });

  it('moves instalments to DUE as triggers fire', () => {
    let s = buildSchedule({ totalCents: 220000, depositCents: 60000, balanceTrigger: 'ON_CONFIRMED_PREGNANCY' });
    s = applyProgress(s, progress({ contractSigned: true }), at);
    expect(s.instalments[0]!.status).toBe('DUE');
    expect(s.instalments[1]!.status).toBe('PENDING');

    s = applyProgress(s, progress({ contractSigned: true, pregnancyConfirmed: true }), at);
    expect(s.instalments[1]!.status).toBe('DUE');
  });

  it('reports outstanding and paid amounts', () => {
    const s = buildSchedule({ totalCents: 220000, depositCents: 60000, balanceTrigger: 'ON_WHELP' });
    s.instalments[0]!.status = 'PAID';
    expect(amountPaid(s)).toBe(60000);
    expect(amountOutstanding(s)).toBe(160000);
  });
});

// ── Escrow decisions ────────────────────────────────────────────────────────

describe('escrow assessment', () => {
  const base = { heldCents: 220000, depositCents: 60000, noLitterRemedy: 'REPEAT_ONLY' as const, breedingFailed: false };

  it('holds before the service happens', () => {
    expect(assessEscrow({ ...base, progress: progress({ contractSigned: true }) }).decision).toBe('HOLD');
  });

  it('holds after a tie but before pregnancy is confirmed', () => {
    expect(assessEscrow({ ...base, progress: progress({ tieRecorded: true }) }).decision).toBe('HOLD');
  });

  it('releases only the deposit on confirmed pregnancy', () => {
    // The balance stays held until the litter is on the ground, which is what
    // actually protects the bitch owner.
    const r = assessEscrow({ ...base, progress: progress({ pregnancyConfirmed: true }) });
    expect(r.decision).toBe('RELEASE');
    expect(r.releasableCents).toBe(60000);
  });

  /**
   * The bug this guards against: settle once on confirmed pregnancy, and the
   * deposit goes out. Settle again and the old code re-read "the deposit is
   * releasable" and paid it a SECOND time — out of the balance that exists to
   * protect the bitch owner until there are puppies on the ground.
   */
  it('does not release the deposit twice across two settlements', () => {
    const first = assessEscrow({ ...base, progress: progress({ pregnancyConfirmed: true }) });
    expect(first.releasableCents).toBe(60000);

    const second = assessEscrow({
      ...base,
      heldCents: base.heldCents - first.releasableCents,
      alreadyReleasedCents: first.releasableCents,
      progress: progress({ pregnancyConfirmed: true }),
    });
    expect(second.decision).toBe('HOLD');
    expect(second.releasableCents).toBe(0);
    expect(second.reason).toMatch(/already been released/i);
  });

  it('counts a partial prior release against the deposit still owed', () => {
    const r = assessEscrow({
      ...base,
      heldCents: 200000,
      alreadyReleasedCents: 20000,
      progress: progress({ pregnancyConfirmed: true }),
    });
    expect(r.decision).toBe('RELEASE');
    expect(r.releasableCents).toBe(40000);
  });

  it('does not let a prior release shrink the refund owed to the payer', () => {
    // Deposit 60000 already out; 160000 still held. A REFUND_BALANCE contract
    // owes the payer all 160000 — the stud owner has had their deposit.
    const r = assessEscrow({
      ...base,
      heldCents: 160000,
      alreadyReleasedCents: 60000,
      breedingFailed: true,
      noLitterRemedy: 'REFUND_BALANCE',
      progress: progress({ tieRecorded: true }),
    });
    expect(r.decision).toBe('REFUND');
    expect(r.refundableCents).toBe(160000);
  });

  it('releases everything once a litter is whelped', () => {
    const r = assessEscrow({ ...base, progress: progress({ litterWhelped: true }) });
    expect(r.releasableCents).toBe(220000);
  });

  it('releases the fee when the contract says repeat-only', () => {
    const r = assessEscrow({ ...base, breedingFailed: true, progress: progress({ tieRecorded: true }) });
    expect(r.decision).toBe('RELEASE');
    expect(r.reason).toMatch(/repeat service as the sole remedy/i);
  });

  it('refunds only the balance when the contract says so', () => {
    const r = assessEscrow({
      ...base,
      breedingFailed: true,
      noLitterRemedy: 'REFUND_BALANCE',
      progress: progress({ tieRecorded: true }),
    });
    expect(r.decision).toBe('REFUND');
    expect(r.refundableCents).toBe(160000);
    expect(r.releasableCents).toBe(60000);
  });

  it('refunds everything when the contract says so', () => {
    const r = assessEscrow({
      ...base,
      breedingFailed: true,
      noLitterRemedy: 'REFUND_ALL',
      progress: progress({ tieRecorded: true }),
    });
    expect(r.refundableCents).toBe(220000);
  });

  it('REFUSES TO GUESS when the contract is silent', () => {
    // The most important assertion in this file. A platform that invents a
    // refund position the contract did not state is making a decision it has
    // no authority to make.
    const r = assessEscrow({
      ...base,
      breedingFailed: true,
      noLitterRemedy: null,
      progress: progress({ tieRecorded: true }),
    });
    expect(r.decision).toBe('NEEDS_REVIEW');
    expect(r.requiresHuman).toBe(true);
    expect(r.releasableCents).toBe(0);
    expect(r.refundableCents).toBe(0);
    expect(r.reason).toMatch(/cannot decide that on the parties/i);
  });

  it('freezes everything while a dispute is open', () => {
    const r = assessEscrow({ ...base, progress: progress({ litterWhelped: true }), disputed: true });
    expect(r.decision).toBe('NEEDS_REVIEW');
    expect(r.releasableCents).toBe(0);
  });
});

describe('platform fee', () => {
  it('computes basis points, rounded', () => {
    expect(platformFee(220000, 600)).toBe(13200);
    expect(platformFee(1, 600)).toBe(0);
    expect(platformFee(99, 600)).toBe(6);
  });

  it('never exceeds the amount', () => {
    expect(platformFee(100, 10_000)).toBe(100);
  });

  it('rejects nonsense basis points', () => {
    expect(() => platformFee(100, -1)).toThrow(ScheduleError);
    expect(() => platformFee(100, 10_001)).toThrow(ScheduleError);
  });
});

// ── Provider ────────────────────────────────────────────────────────────────

describe('payment provider', () => {
  it('is not live', () => {
    // The gate. Flipping this needs a signed processor agreement, not a commit.
    expect(new MockProvider().isLive).toBe(false);
  });

  it('refuses to resolve any provider but mock', () => {
    expect(() => createProvider('stripe')).toThrow(PaymentError);
    expect(() => createProvider('stripe')).toThrow(/payments-diligence/);
  });

  it('is idempotent — a retry must not charge twice', () => {
    const p = new MockProvider(() => at);
    const req = {
      idempotencyKey: 'k1', amountCents: 60000, currency: 'USD' as const,
      payerId: 'u1', description: 'Deposit', method: 'CARD' as const,
    };
    return Promise.all([p.charge(req), p.charge(req)]).then(([a, b]) => {
      expect(a.providerId).toBe(b.providerId);
    });
  });

  it('models a decline deterministically', async () => {
    const p = new MockProvider(() => at);
    const r = await p.charge({
      idempotencyKey: 'decline_k2', amountCents: 60000, currency: 'USD',
      payerId: 'u1', description: 'Deposit', method: 'CARD',
    });
    expect(r.status).toBe('FAILED');
    expect(r.failureCode).toBe('card_declined');
  });

  it('rejects a non-integer or zero charge', async () => {
    const p = new MockProvider(() => at);
    await expect(
      p.charge({ idempotencyKey: 'k3', amountCents: 0, currency: 'USD', payerId: 'u1', description: 'x', method: 'CARD' }),
    ).rejects.toThrow(PaymentError);
  });
});

/**
 * The money ledger.
 *
 * Double-entry, append-only, integer cents. Every movement of money is two
 * entries that must sum to zero, and nothing is ever updated or deleted — a
 * correction is a new pair of entries, exactly like a real ledger.
 *
 * The reason for this shape rather than a `balance` column: when a breeder and
 * a stud owner disagree about who paid what, the answer has to be
 * reconstructible from an immutable record. A mutable balance can only tell
 * you what someone last wrote.
 *
 * From docs/payments-diligence.md:
 *   "Every money movement writes an immutable ledger row before the external
 *    call, and reconciles on webhook. Never trust an inline API response as
 *    the record."
 *
 * Pure module. No I/O, no clock.
 */

export type Cents = number;

/**
 * Accounts are logical, not bank accounts.
 *
 * `ESCROW` is money we are holding on behalf of one party pending a condition.
 * `PLATFORM_FEE` is ours. `EXTERNAL` is the outside world — a card network, a
 * bank. Every transfer has an `EXTERNAL` leg somewhere at the boundary.
 */
export type AccountKind =
  | 'BUYER'
  | 'SELLER'
  | 'ESCROW'
  | 'PLATFORM_FEE'
  | 'EXTERNAL';

export interface AccountRef {
  kind: AccountKind;
  /** User or kennel id. Null for ESCROW, PLATFORM_FEE and EXTERNAL. */
  ownerId?: string | null;
}

export type EntryReason =
  | 'DEPOSIT_CAPTURED'
  | 'BALANCE_CAPTURED'
  | 'ESCROW_HELD'
  | 'ESCROW_RELEASED'
  | 'ESCROW_REFUNDED'
  | 'PLATFORM_FEE_TAKEN'
  | 'PAYOUT_SENT'
  | 'REFUND_ISSUED'
  | 'ADJUSTMENT'
  | 'REVERSAL';

export interface LedgerEntry {
  /** Groups the legs of a single movement. Legs must sum to zero. */
  transactionId: string;
  account: AccountRef;
  /** Positive credits the account, negative debits it. Integer cents. */
  amountCents: Cents;
  reason: EntryReason;
  /** What this movement relates to — a contract, a payment schedule item. */
  referenceType: string;
  referenceId: string;
  memo?: string | null;
  occurredAt: Date;
  /** Set on a REVERSAL, pointing at the transaction being reversed. */
  reversesTransactionId?: string | null;
}

export class LedgerError extends Error {
  constructor(
    message: string,
    public code: 'UNBALANCED' | 'NON_INTEGER' | 'EMPTY' | 'ZERO_AMOUNT',
  ) {
    super(message);
    this.name = 'LedgerError';
  }
}

/**
 * Validate a set of legs before they are written.
 *
 * Throws rather than returns. An unbalanced transaction is a bug that must
 * never reach the database — once it is in an append-only ledger, the only
 * remedy is another entry, and the books are wrong until someone notices.
 */
export function assertBalanced(legs: readonly LedgerEntry[]): void {
  if (legs.length === 0) throw new LedgerError('A transaction needs at least two legs.', 'EMPTY');

  for (const leg of legs) {
    if (!Number.isInteger(leg.amountCents)) {
      throw new LedgerError(
        `Ledger amounts must be integer cents. Got ${leg.amountCents} on ${leg.reason}.`,
        'NON_INTEGER',
      );
    }
    if (leg.amountCents === 0) {
      throw new LedgerError(`A zero-amount leg on ${leg.reason} records nothing.`, 'ZERO_AMOUNT');
    }
  }

  const sum = legs.reduce((total, leg) => total + leg.amountCents, 0);
  if (sum !== 0) {
    throw new LedgerError(
      `Transaction legs must sum to zero; these sum to ${sum} cents. Every credit needs a matching debit.`,
      'UNBALANCED',
    );
  }
}

function accountKey(account: AccountRef): string {
  return `${account.kind}:${account.ownerId ?? '-'}`;
}

/** Balance of one account across a set of entries. */
export function balanceOf(entries: readonly LedgerEntry[], account: AccountRef): Cents {
  const key = accountKey(account);
  return entries
    .filter((e) => accountKey(e.account) === key)
    .reduce((total, e) => total + e.amountCents, 0);
}

/** Every account's balance. Used by reconciliation and by the admin view. */
export function balances(entries: readonly LedgerEntry[]): Map<string, Cents> {
  const out = new Map<string, Cents>();
  for (const e of entries) {
    const key = accountKey(e.account);
    out.set(key, (out.get(key) ?? 0) + e.amountCents);
  }
  return out;
}

/**
 * Does the whole ledger balance?
 *
 * Run on a schedule. A non-zero total means a transaction was written
 * unbalanced, and that needs a human before anything else happens.
 */
export function isLedgerBalanced(entries: readonly LedgerEntry[]): boolean {
  return entries.reduce((total, e) => total + e.amountCents, 0) === 0;
}

// ── Movement builders ───────────────────────────────────────────────────────
//
// Each returns the legs for one movement. They are the only sanctioned way to
// construct entries, so the balancing rule cannot be forgotten at a call site.

export interface MovementContext {
  transactionId: string;
  referenceType: string;
  referenceId: string;
  occurredAt: Date;
  memo?: string | null;
}

/** Money arrives from the outside world and lands in escrow. */
export function captureToEscrow(
  ctx: MovementContext,
  args: { payerId: string; amountCents: Cents; isDeposit: boolean },
): LedgerEntry[] {
  const reason: EntryReason = args.isDeposit ? 'DEPOSIT_CAPTURED' : 'BALANCE_CAPTURED';
  const legs: LedgerEntry[] = [
    {
      transactionId: ctx.transactionId,
      account: { kind: 'EXTERNAL' },
      amountCents: -args.amountCents,
      reason,
      referenceType: ctx.referenceType,
      referenceId: ctx.referenceId,
      memo: ctx.memo,
      occurredAt: ctx.occurredAt,
    },
    {
      transactionId: ctx.transactionId,
      account: { kind: 'ESCROW' },
      amountCents: args.amountCents,
      reason: 'ESCROW_HELD',
      referenceType: ctx.referenceType,
      referenceId: ctx.referenceId,
      memo: `Held on behalf of ${args.payerId}`,
      occurredAt: ctx.occurredAt,
    },
  ];
  assertBalanced(legs);
  return legs;
}

/**
 * Escrow is released to the seller, less the platform fee.
 *
 * The fee is taken here rather than at capture, so a refunded transaction
 * refunds the whole amount and the platform earns nothing on a breeding that
 * did not happen. That is a product decision as much as an accounting one.
 */
export function releaseFromEscrow(
  ctx: MovementContext,
  args: { sellerId: string; amountCents: Cents; platformFeeCents: Cents },
): LedgerEntry[] {
  if (args.platformFeeCents > args.amountCents) {
    throw new LedgerError('The platform fee cannot exceed the amount being released.', 'UNBALANCED');
  }
  const toSeller = args.amountCents - args.platformFeeCents;

  const legs: LedgerEntry[] = [
    {
      transactionId: ctx.transactionId,
      account: { kind: 'ESCROW' },
      amountCents: -args.amountCents,
      reason: 'ESCROW_RELEASED',
      referenceType: ctx.referenceType,
      referenceId: ctx.referenceId,
      memo: ctx.memo,
      occurredAt: ctx.occurredAt,
    },
    {
      transactionId: ctx.transactionId,
      account: { kind: 'SELLER', ownerId: args.sellerId },
      amountCents: toSeller,
      reason: 'ESCROW_RELEASED',
      referenceType: ctx.referenceType,
      referenceId: ctx.referenceId,
      occurredAt: ctx.occurredAt,
    },
  ];

  if (args.platformFeeCents > 0) {
    legs.push({
      transactionId: ctx.transactionId,
      account: { kind: 'PLATFORM_FEE' },
      amountCents: args.platformFeeCents,
      reason: 'PLATFORM_FEE_TAKEN',
      referenceType: ctx.referenceType,
      referenceId: ctx.referenceId,
      occurredAt: ctx.occurredAt,
    });
  }

  assertBalanced(legs);
  return legs;
}

/** Escrow goes back out to the payer. No platform fee is taken. */
export function refundFromEscrow(
  ctx: MovementContext,
  args: { payerId: string; amountCents: Cents },
): LedgerEntry[] {
  const legs: LedgerEntry[] = [
    {
      transactionId: ctx.transactionId,
      account: { kind: 'ESCROW' },
      amountCents: -args.amountCents,
      reason: 'ESCROW_REFUNDED',
      referenceType: ctx.referenceType,
      referenceId: ctx.referenceId,
      memo: `Refunded to ${args.payerId}`,
      occurredAt: ctx.occurredAt,
    },
    {
      transactionId: ctx.transactionId,
      account: { kind: 'EXTERNAL' },
      amountCents: args.amountCents,
      reason: 'REFUND_ISSUED',
      referenceType: ctx.referenceType,
      referenceId: ctx.referenceId,
      memo: ctx.memo,
      occurredAt: ctx.occurredAt,
    },
  ];
  assertBalanced(legs);
  return legs;
}

/**
 * Reverse a transaction by writing its mirror image.
 *
 * Never deletes. The original stays, the reversal sits beside it, and the
 * history shows both — which is the only way a dispute can be reconstructed.
 */
export function reverseTransaction(
  original: readonly LedgerEntry[],
  ctx: MovementContext,
): LedgerEntry[] {
  if (original.length === 0) throw new LedgerError('Nothing to reverse.', 'EMPTY');
  const legs = original.map((leg) => ({
    ...leg,
    transactionId: ctx.transactionId,
    amountCents: -leg.amountCents,
    reason: 'REVERSAL' as EntryReason,
    memo: ctx.memo ?? `Reversal of ${leg.transactionId}`,
    occurredAt: ctx.occurredAt,
    reversesTransactionId: original[0]!.transactionId,
  }));
  assertBalanced(legs);
  return legs;
}

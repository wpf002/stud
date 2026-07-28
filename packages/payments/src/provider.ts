/**
 * Payment provider interface.
 *
 * ── The gate ──────────────────────────────────────────────────────────────
 * `MockProvider` is the ONLY implementation, and `PAYMENTS_PROVIDER=mock` is
 * the only supported value, until the diligence in docs/payments-diligence.md
 * is complete. Live animal sales are a high-risk vertical: large tickets, a
 * 8–16 week gap between deposit and fulfilment, and emotionally charged
 * disputes. A processor that has not explicitly approved this vertical in
 * writing will terminate the account at the worst possible moment.
 *
 * So the money is *modelled* — schedules, escrow, the double-entry ledger,
 * refund logic derived from contract clauses — and every layer above the
 * provider boundary is real and tested. What is not built is the one thing
 * that must not be built before a signature exists on a processor agreement.
 *
 * From the diligence note:
 *   "@stud/payments exposes a provider interface. No processor SDK types leak
 *    into route handlers, the database, or the UI."
 *
 * That is what this file enforces.
 */

import { type Cents } from './ledger.js';

export type PaymentMethodKind = 'CARD' | 'ACH' | 'MANUAL';

export interface ChargeRequest {
  /** Idempotency key. The same key must never charge twice. */
  idempotencyKey: string;
  amountCents: Cents;
  currency: 'USD';
  payerId: string;
  description: string;
  method: PaymentMethodKind;
  metadata?: Record<string, string>;
}

export type ChargeStatus = 'SUCCEEDED' | 'PENDING' | 'FAILED' | 'REQUIRES_ACTION';

export interface ChargeResult {
  providerId: string;
  status: ChargeStatus;
  amountCents: Cents;
  /** Only on FAILED. */
  failureCode?: string | null;
  failureMessage?: string | null;
  /** Only on REQUIRES_ACTION — e.g. 3DS. */
  actionUrl?: string | null;
  createdAt: Date;
}

export interface RefundRequest {
  idempotencyKey: string;
  providerChargeId: string;
  amountCents: Cents;
  reason: string;
}

export interface RefundResult {
  providerId: string;
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED';
  amountCents: Cents;
  failureMessage?: string | null;
  createdAt: Date;
}

export interface PayoutRequest {
  idempotencyKey: string;
  recipientId: string;
  amountCents: Cents;
  description: string;
}

export interface PayoutResult {
  providerId: string;
  status: 'SUCCEEDED' | 'PENDING' | 'FAILED';
  amountCents: Cents;
  failureMessage?: string | null;
  createdAt: Date;
}

export interface PaymentProvider {
  readonly id: string;
  /** False until a processor has approved this vertical in writing. */
  readonly isLive: boolean;
  charge(req: ChargeRequest): Promise<ChargeResult>;
  refund(req: RefundRequest): Promise<RefundResult>;
  payout(req: PayoutRequest): Promise<PayoutResult>;
}

export class PaymentError extends Error {
  constructor(
    message: string,
    public code: 'NOT_CONFIGURED' | 'DUPLICATE' | 'DECLINED' | 'TRANSPORT',
  ) {
    super(message);
    this.name = 'PaymentError';
  }
}

/**
 * The mock provider.
 *
 * Not a stub — it enforces idempotency, models declines, and returns the same
 * shapes a real processor would, so every layer above it is genuinely
 * exercised. What it does not do is move money.
 *
 * Deterministic by design: a caller can force a decline by prefixing the
 * idempotency key with `decline_`, which is how the failure paths get tested
 * without waiting for a real card to be refused.
 */
export class MockProvider implements PaymentProvider {
  readonly id = 'mock';
  readonly isLive = false;

  private readonly charges = new Map<string, ChargeResult>();
  private readonly refunds = new Map<string, RefundResult>();
  private readonly payouts = new Map<string, PayoutResult>();
  private counter = 0;

  constructor(private readonly now: () => Date = () => new Date()) {}

  private nextId(prefix: string): string {
    this.counter += 1;
    return `${prefix}_mock_${this.counter.toString().padStart(6, '0')}`;
  }

  async charge(req: ChargeRequest): Promise<ChargeResult> {
    // Idempotency is the property that matters most here. A retry after a
    // timeout must not take the money twice.
    const existing = this.charges.get(req.idempotencyKey);
    if (existing) return existing;

    if (!Number.isInteger(req.amountCents) || req.amountCents <= 0) {
      throw new PaymentError('Charge amount must be a positive integer number of cents.', 'DECLINED');
    }

    const declined = req.idempotencyKey.startsWith('decline_');
    const result: ChargeResult = declined
      ? {
          providerId: this.nextId('ch'),
          status: 'FAILED',
          amountCents: req.amountCents,
          failureCode: 'card_declined',
          failureMessage: 'The card was declined (simulated).',
          createdAt: this.now(),
        }
      : {
          providerId: this.nextId('ch'),
          status: 'SUCCEEDED',
          amountCents: req.amountCents,
          createdAt: this.now(),
        };

    this.charges.set(req.idempotencyKey, result);
    return result;
  }

  async refund(req: RefundRequest): Promise<RefundResult> {
    const existing = this.refunds.get(req.idempotencyKey);
    if (existing) return existing;

    if (!Number.isInteger(req.amountCents) || req.amountCents <= 0) {
      throw new PaymentError('Refund amount must be a positive integer number of cents.', 'DECLINED');
    }

    const result: RefundResult = {
      providerId: this.nextId('re'),
      status: 'SUCCEEDED',
      amountCents: req.amountCents,
      createdAt: this.now(),
    };
    this.refunds.set(req.idempotencyKey, result);
    return result;
  }

  async payout(req: PayoutRequest): Promise<PayoutResult> {
    const existing = this.payouts.get(req.idempotencyKey);
    if (existing) return existing;

    const result: PayoutResult = {
      providerId: this.nextId('po'),
      status: 'SUCCEEDED',
      amountCents: req.amountCents,
      createdAt: this.now(),
    };
    this.payouts.set(req.idempotencyKey, result);
    return result;
  }
}

/**
 * Resolve the configured provider.
 *
 * Anything other than `mock` throws with a pointer to the diligence note,
 * rather than silently falling back — a silent fallback to mock in production
 * would take orders and move nothing.
 */
export function createProvider(name: string, opts: { now?: () => Date } = {}): PaymentProvider {
  if (name === 'mock') return new MockProvider(opts.now);
  throw new PaymentError(
    `Payment provider "${name}" is not implemented. Live animal sales are a high-risk vertical and no processor may be enabled until the diligence in docs/payments-diligence.md is complete and a written approval for this vertical is on file.`,
    'NOT_CONFIGURED',
  );
}

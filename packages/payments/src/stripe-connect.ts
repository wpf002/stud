/**
 * Stripe Connect — separate charges and transfers.
 *
 * This is a two-sided marketplace, so money moves from a buyer to a breeder
 * with the platform in between. That rules out a plain Stripe account: each
 * breeder and stud owner needs a Connect account of their own before they can
 * be paid.
 *
 * The pattern is deliberate. The platform collects the charge into its OWN
 * balance and holds it there, then transfers to the connected account once the
 * condition is met — puppy collected, stud service completed. Refunding while
 * the money is still platform-side is fast and clean because no payout has
 * happened yet, which is exactly the "secure deposit, quick refund if it falls
 * through" behaviour this product promises.
 *
 * TEST MODE ONLY, enforced in the constructor rather than by convention. A
 * live key is refused outright. docs/payments-diligence.md gates a real
 * processor on written approval for this vertical, which does not exist, and
 * a flag someone can flip by accident is not a gate. `isLive` stays false.
 *
 * No Stripe SDK dependency: the API is form-encoded REST and the handful of
 * calls needed here are easier to read — and to fake in a test — than a
 * mocked client object.
 */
import type {
  ChargeRequest,
  ChargeResult,
  PaymentProvider,
  PayoutRequest,
  PayoutResult,
  RefundRequest,
  RefundResult,
} from './provider.js';
import { PaymentError } from './provider.js';

/** The transport, so tests can record calls without touching the network. */
export interface StripeTransport {
  post(
    path: string,
    body: Record<string, string>,
    opts: { idempotencyKey?: string; stripeAccount?: string },
  ): Promise<Record<string, unknown>>;
}

/** Live HTTPS transport. Only built from a test key — see the constructor. */
export function httpTransport(secretKey: string): StripeTransport {
  return {
    async post(path, body, opts) {
      const res = await fetch(`https://api.stripe.com${path}`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${secretKey}`,
          'content-type': 'application/x-www-form-urlencoded',
          ...(opts.idempotencyKey ? { 'idempotency-key': opts.idempotencyKey } : {}),
          ...(opts.stripeAccount ? { 'stripe-account': opts.stripeAccount } : {}),
        },
        body: new URLSearchParams(body).toString(),
      });
      const json = (await res.json()) as Record<string, unknown>;
      if (!res.ok) {
        const err = (json.error ?? {}) as { message?: string; code?: string };
        throw new PaymentError(err.message ?? `Stripe returned ${res.status}`, 'TRANSPORT');
      }
      return json;
    },
  };
}

const str = (v: unknown): string => (typeof v === 'string' ? v : String(v ?? ''));

export class StripeConnectProvider implements PaymentProvider {
  readonly id = 'stripe-connect';

  /**
   * False, and not configurable. Live animal sales need written processor
   * approval before real money moves; until that exists this integration is a
   * test-mode rehearsal of the flow, not a payment rail.
   */
  readonly isLive = false;

  private readonly now: () => Date;

  constructor(
    private readonly transport: StripeTransport,
    opts: { now?: () => Date } = {},
  ) {
    this.now = opts.now ?? (() => new Date());
  }

  /**
   * Build from a secret key, refusing a live one.
   *
   * The check is on the key itself rather than on a mode flag: a flag can be
   * set wrongly, whereas `sk_live_` is unambiguous about what it would move.
   */
  static fromKey(secretKey: string, opts: { now?: () => Date } = {}): StripeConnectProvider {
    if (!secretKey) throw new PaymentError('No Stripe secret key configured.', 'NOT_CONFIGURED');
    if (secretKey.startsWith('sk_live_') || secretKey.startsWith('rk_live_')) {
      throw new PaymentError(
        'A live Stripe key was supplied. This integration is test-mode only until the diligence in docs/payments-diligence.md is complete and written approval for live animal sales is on file.',
        'NOT_CONFIGURED',
      );
    }
    if (!secretKey.startsWith('sk_test_') && !secretKey.startsWith('rk_test_')) {
      throw new PaymentError('Expected a Stripe test key (sk_test_…).', 'NOT_CONFIGURED');
    }
    return new StripeConnectProvider(httpTransport(secretKey), opts);
  }

  /**
   * Collect onto the PLATFORM balance and hold.
   *
   * Note what is absent: no `transfer_data`, no `on_behalf_of`. Adding either
   * would settle the money straight to the breeder and turn a refund into a
   * clawback from someone who has already been paid.
   */
  async charge(req: ChargeRequest): Promise<ChargeResult> {
    const intent = await this.transport.post(
      '/v1/payment_intents',
      {
        amount: String(req.amountCents),
        currency: req.currency.toLowerCase(),
        description: req.description,
        'metadata[payer_id]': req.payerId,
        confirm: 'true',
        // Test-mode card that always succeeds; a real integration collects a
        // payment method from the client instead.
        payment_method: 'pm_card_visa',
        'automatic_payment_methods[enabled]': 'true',
        'automatic_payment_methods[allow_redirects]': 'never',
      },
      { idempotencyKey: req.idempotencyKey },
    );

    const status = str(intent.status);
    return {
      providerId: str(intent.id),
      status:
        status === 'succeeded'
          ? 'SUCCEEDED'
          : status === 'requires_action'
            ? 'REQUIRES_ACTION'
            : status === 'canceled'
              ? 'FAILED'
              : 'PENDING',
      amountCents: Number(intent.amount ?? req.amountCents),
      failureMessage: status === 'canceled' ? 'The payment was cancelled.' : null,
      createdAt: this.now(),
    };
  }

  /** Refund from the platform balance. Nothing to claw back, because nothing was sent. */
  async refund(req: RefundRequest): Promise<RefundResult> {
    const refund = await this.transport.post(
      '/v1/refunds',
      {
        payment_intent: req.providerChargeId,
        amount: String(req.amountCents),
        'metadata[reason]': req.reason,
      },
      { idempotencyKey: req.idempotencyKey },
    );
    const status = str(refund.status);
    return {
      providerId: str(refund.id),
      status: status === 'succeeded' ? 'SUCCEEDED' : status === 'failed' ? 'FAILED' : 'PENDING',
      amountCents: Number(refund.amount ?? req.amountCents),
      failureMessage: status === 'failed' ? 'The refund was rejected.' : null,
      createdAt: this.now(),
    };
  }

  /**
   * Release to the connected account — the second half of the pattern.
   *
   * `recipientId` is the breeder's Connect account id. This is the only call
   * that moves money out of the platform balance, which is why it happens on
   * completion and not on payment.
   */
  async payout(req: PayoutRequest): Promise<PayoutResult> {
    if (!req.recipientId.startsWith('acct_')) {
      throw new PaymentError(
        'That recipient has not completed Stripe Connect onboarding, so there is nowhere to send the money.',
        'NOT_CONFIGURED',
      );
    }
    const transfer = await this.transport.post(
      '/v1/transfers',
      {
        amount: String(req.amountCents),
        currency: 'usd',
        destination: req.recipientId,
        description: req.description,
      },
      { idempotencyKey: req.idempotencyKey },
    );
    return {
      providerId: str(transfer.id),
      status: 'SUCCEEDED',
      amountCents: Number(transfer.amount ?? req.amountCents),
      failureMessage: null,
      createdAt: this.now(),
    };
  }

  /** Start Connect onboarding for a breeder. Returns the link they must complete. */
  async createConnectOnboarding(args: {
    email: string;
    kennelName: string;
    returnUrl: string;
    refreshUrl: string;
    existingAccountId?: string | null;
  }): Promise<{ accountId: string; onboardingUrl: string }> {
    const accountId =
      args.existingAccountId ??
      str(
        (
          await this.transport.post(
            '/v1/accounts',
            {
              type: 'express',
              email: args.email,
              'business_profile[name]': args.kennelName,
              'capabilities[transfers][requested]': 'true',
            },
            {},
          )
        ).id,
      );

    const link = await this.transport.post(
      '/v1/account_links',
      {
        account: accountId,
        type: 'account_onboarding',
        return_url: args.returnUrl,
        refresh_url: args.refreshUrl,
      },
      {},
    );
    return { accountId, onboardingUrl: str(link.url) };
  }

  /** Whether a connected account can actually receive money yet. */
  async accountReady(accountId: string): Promise<boolean> {
    const acct = await this.transport.post(`/v1/accounts/${accountId}`, {}, {});
    return Boolean(acct.payouts_enabled) && Boolean(acct.charges_enabled);
  }
}

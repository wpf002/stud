import { describe, expect, it } from 'vitest';
import { PaymentError, StripeConnectProvider, type StripeTransport } from '../src/index.js';

/**
 * Records every call so a test can assert the SEQUENCE, which is the whole
 * point of separate charges and transfers: what matters is not that a refund
 * succeeded but that no transfer happened before it.
 */
function recorder() {
  const calls: { path: string; body: Record<string, string> }[] = [];
  const transport: StripeTransport = {
    async post(path, body) {
      calls.push({ path, body });
      if (path === '/v1/payment_intents') {
        return { id: 'pi_test_1', status: 'succeeded', amount: Number(body.amount) };
      }
      if (path === '/v1/refunds') {
        return { id: 're_test_1', status: 'succeeded', amount: Number(body.amount) };
      }
      if (path === '/v1/transfers') {
        return { id: 'tr_test_1', amount: Number(body.amount), destination: body.destination };
      }
      if (path === '/v1/accounts') return { id: 'acct_test_1' };
      if (path === '/v1/account_links') return { url: 'https://connect.stripe.com/setup/x' };
      return { id: 'obj_1', payouts_enabled: true, charges_enabled: true };
    },
  };
  return { calls, transport, paths: () => calls.map((c) => c.path) };
}

const NOW = () => new Date('2026-08-24T12:00:00Z');

describe('holding on the platform', () => {
  it('charges without transfer_data, so the money stays platform-side', async () => {
    const r = recorder();
    const p = new StripeConnectProvider(r.transport, { now: NOW });
    const charge = await p.charge({
      idempotencyKey: 'k1',
      amountCents: 50_000,
      currency: 'USD',
      payerId: 'user_1',
      description: 'Stud booking deposit',
      method: 'CARD',
    });
    expect(charge.status).toBe('SUCCEEDED');
    const body = r.calls[0]!.body;
    // Either of these would settle straight to the breeder and turn a refund
    // into a clawback from someone already paid.
    expect(body).not.toHaveProperty('transfer_data[destination]');
    expect(body).not.toHaveProperty('on_behalf_of');
  });
});

describe('the gate', () => {
  /** A held deposit refunds with NO payout. */
  it('refunds a held deposit without any transfer having occurred', async () => {
    const r = recorder();
    const p = new StripeConnectProvider(r.transport, { now: NOW });

    const charge = await p.charge({
      idempotencyKey: 'k-refund',
      amountCents: 50_000,
      currency: 'USD',
      payerId: 'user_1',
      description: 'Deposit',
      method: 'CARD',
    });
    const refund = await p.refund({
      idempotencyKey: 'k-refund-1',
      providerChargeId: charge.providerId,
      amountCents: 50_000,
      reason: 'Deal fell through',
    });

    expect(refund.status).toBe('SUCCEEDED');
    expect(refund.amountCents).toBe(50_000);
    expect(r.paths()).toEqual(['/v1/payment_intents', '/v1/refunds']);
    expect(r.paths()).not.toContain('/v1/transfers');
  });

  /** A second transfers to a connected account on completion. */
  it('transfers to the connected account when the condition is met', async () => {
    const r = recorder();
    const p = new StripeConnectProvider(r.transport, { now: NOW });

    await p.charge({
      idempotencyKey: 'k-pay',
      amountCents: 220_000,
      currency: 'USD',
      payerId: 'user_2',
      description: 'Stud fee',
      method: 'CARD',
    });
    const payout = await p.payout({
      idempotencyKey: 'k-pay-1',
      recipientId: 'acct_test_1',
      amountCents: 220_000,
      description: 'Stud service completed',
    });

    expect(payout.status).toBe('SUCCEEDED');
    expect(r.paths()).toEqual(['/v1/payment_intents', '/v1/transfers']);
    expect(r.calls[1]!.body.destination).toBe('acct_test_1');
    expect(r.calls[1]!.body.amount).toBe('220000');
  });
});

describe('paying someone who cannot receive', () => {
  it('refuses to transfer to a breeder who has not onboarded', async () => {
    const r = recorder();
    const p = new StripeConnectProvider(r.transport, { now: NOW });
    await expect(
      p.payout({ idempotencyKey: 'k', recipientId: 'user_3', amountCents: 100, description: 'x' }),
    ).rejects.toThrow(/onboarding/i);
    expect(r.paths()).not.toContain('/v1/transfers');
  });
});

describe('test-mode enforcement', () => {
  it('refuses a live secret key outright', () => {
    expect(() => StripeConnectProvider.fromKey('sk_live_abc123')).toThrow(/test-mode only/i);
  });

  it('refuses a key that is neither test nor live', () => {
    expect(() => StripeConnectProvider.fromKey('whatever')).toThrow(PaymentError);
  });

  it('accepts a test key', () => {
    expect(StripeConnectProvider.fromKey('sk_test_abc123').id).toBe('stripe-connect');
  });

  /** Not configurable: written approval for this vertical does not exist. */
  it('never reports itself as live', () => {
    expect(StripeConnectProvider.fromKey('sk_test_abc123').isLive).toBe(false);
    expect(new StripeConnectProvider(recorder().transport).isLive).toBe(false);
  });
});

describe('connect onboarding', () => {
  it('creates an express account and returns the link the breeder must complete', async () => {
    const r = recorder();
    const p = new StripeConnectProvider(r.transport, { now: NOW });
    const out = await p.createConnectOnboarding({
      email: 'breeder@example.invalid',
      kennelName: 'Blackwater Kennels',
      returnUrl: 'https://stud.dog/studio/payouts?done=1',
      refreshUrl: 'https://stud.dog/studio/payouts',
    });
    expect(out.accountId).toBe('acct_test_1');
    expect(out.onboardingUrl).toContain('connect.stripe.com');
    expect(r.paths()).toEqual(['/v1/accounts', '/v1/account_links']);
    expect(r.calls[0]!.body['capabilities[transfers][requested]']).toBe('true');
  });

  it('reuses an existing account rather than creating a second', async () => {
    const r = recorder();
    const p = new StripeConnectProvider(r.transport, { now: NOW });
    await p.createConnectOnboarding({
      email: 'b@example.invalid',
      kennelName: 'K',
      returnUrl: 'https://x/y',
      refreshUrl: 'https://x/z',
      existingAccountId: 'acct_existing',
    });
    expect(r.paths()).toEqual(['/v1/account_links']);
  });
});

describe('provider selection', () => {
  it('still defaults to mock, and mock is not live', async () => {
    const { createProvider } = await import('../src/provider.js');
    const p = createProvider('mock');
    expect(p.id).toBe('mock');
    expect(p.isLive).toBe(false);
  });

  it('refuses stripe-connect when no key is configured', async () => {
    const { createProvider } = await import('../src/provider.js');
    const prev = process.env.STRIPE_SECRET_KEY;
    delete process.env.STRIPE_SECRET_KEY;
    expect(() => createProvider('stripe-connect')).toThrow(/no stripe secret key/i);
    if (prev !== undefined) process.env.STRIPE_SECRET_KEY = prev;
  });

  it('refuses an unknown provider with a pointer to the diligence note', async () => {
    const { createProvider } = await import('../src/provider.js');
    expect(() => createProvider('adyen')).toThrow(/payments-diligence/);
  });
});

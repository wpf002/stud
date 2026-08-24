'use client';

import { CalendarCheck, Check, X } from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  Alert, Badge, Button, Card, CardContent, EmptyState, Textarea,
  formatDateOnly, formatMoney, titleCase,
} from '@stud/ui';
import { api, ApiError } from '@/lib/api';
import type { StudBookingDto } from '@/lib/types';

const TONE: Record<string, 'brand' | 'neutral' | 'warning' | 'danger'> = {
  REQUESTED: 'warning',
  ACCEPTED: 'brand',
  COMPLETED: 'brand',
  DECLINED: 'neutral',
  WITHDRAWN: 'neutral',
  CANCELLED: 'danger',
};

/** Inclusive, so a window that starts and ends the same day is one day. */
function windowLength(from: string, to: string) {
  const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000) + 1;
  return `${days} day${days === 1 ? '' : 's'}`;
}

export function BookingsClient({
  incoming,
  outgoing,
}: {
  incoming: StudBookingDto[];
  outgoing: StudBookingDto[];
}) {
  const router = useRouter();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState<string | null>(null);
  const [declining, setDeclining] = React.useState<string | null>(null);

  async function act(id: string, action: string, json?: Record<string, unknown>) {
    setBusy(id);
    setError(null);
    try {
      await api(`/studs/bookings/${id}/${action}`, { method: 'POST', json: json ?? {} });
      setDeclining(null);
      router.refresh();
    } catch (err) {
      // A conflict is the common one and it is actionable, so it is shown as
      // the API worded it rather than flattened to "something went wrong".
      setError(err instanceof ApiError ? err.message : 'Could not do that.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-8">
      {error && <Alert tone="danger">{error}</Alert>}

      <section>
        <h2 className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
          Requests to Your Studs
        </h2>

        {incoming.length === 0 ? (
          <EmptyState
            className="mt-3"
            icon={<CalendarCheck className="h-5 w-5" />}
            title="No Booking Requests"
            description="A dam owner asks for the window her bitch is due in season, not a single date. Accepting takes the deposit and marks the stud booked through that window."
          />
        ) : (
          <ul className="mt-3 space-y-3">
            {incoming.map((b) => (
              <li key={b.id}>
                <Card>
                  <CardContent className="pt-5">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="font-display text-lg text-ink-900">
                          {formatDateOnly(b.windowStart)} — {formatDateOnly(b.windowEnd)}
                          <span className="ml-2 text-sm text-ink-400">
                            {windowLength(b.windowStart, b.windowEnd)}
                          </span>
                        </p>
                        <p className="mt-0.5 text-sm text-ink-600">
                          <Link
                            href={`/studio/dogs/${b.dam.slug}`}
                            className="font-medium text-ink-800 hover:text-brand-700"
                          >
                            {b.dam.callName}
                          </Link>{' '}
                          <span className="text-ink-400">({b.dam.breed})</span> to{' '}
                          <span className="font-medium text-ink-800">
                            {b.studListing.dog.callName}
                          </span>
                        </p>
                        <p className="mt-0.5 text-2xs text-ink-400">
                          {b.requestedBy?.displayName ?? b.requestedBy?.name ?? b.requestedBy?.email ?? 'Unknown requester'}
                          {b.method ? ` · ${titleCase(b.method)}` : ''}
                        </p>
                      </div>
                      <div className="flex shrink-0 items-center gap-2">
                        {b.depositCents != null && b.depositCents > 0 && (
                          <span className="text-sm text-ink-500">
                            {formatMoney(b.depositCents, { compact: true })}
                          </span>
                        )}
                        <Badge tone={TONE[b.status] ?? 'neutral'} size="sm">
                          {titleCase(b.status)}
                        </Badge>
                      </div>
                    </div>

                    {b.message && (
                      <p className="mt-3 rounded-md bg-bone-200/60 px-3 py-2 text-sm leading-relaxed text-ink-700">
                        {b.message}
                      </p>
                    )}

                    {b.status === 'REQUESTED' && (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          loading={busy === b.id}
                          onClick={() =>
                            act(b.id, 'accept', {
                              depositCents: b.studListing.studFeeCents ?? 0,
                            })
                          }
                        >
                          <Check /> Accept and Take Deposit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setDeclining(declining === b.id ? null : b.id)}
                        >
                          <X /> Decline
                        </Button>
                        <p className="text-2xs text-ink-400">
                          Accepting marks this stud booked through{' '}
                          {formatDateOnly(b.windowEnd)}.
                        </p>
                      </div>
                    )}

                    {declining === b.id && (
                      <form
                        className="mt-3 space-y-2"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const reason = new FormData(e.currentTarget).get('reason');
                          act(b.id, 'decline', { reason: String(reason ?? '') || undefined });
                        }}
                      >
                        <Textarea
                          name="reason"
                          rows={2}
                          placeholder="Why, in a sentence. The dam owner sees this."
                        />
                        <div className="flex gap-2">
                          <Button size="sm" type="submit" variant="danger" loading={busy === b.id}>
                            Decline This Request
                          </Button>
                          <Button size="sm" type="button" variant="ghost" onClick={() => setDeclining(null)}>
                            Cancel
                          </Button>
                        </div>
                      </form>
                    )}

                    {b.status === 'ACCEPTED' && (
                      <div className="mt-4 flex flex-wrap items-center gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          loading={busy === b.id}
                          onClick={() => act(b.id, 'cancel', {})}
                        >
                          Cancel This Booking
                        </Button>
                        <p className="text-2xs text-ink-400">
                          Cancelling frees the dates and the listing goes back to available.
                        </p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2 className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
          Your Requests to Other Studs
        </h2>
        {outgoing.length === 0 ? (
          <p className="mt-3 text-sm text-ink-500">
            None yet. Ask for a window from any stud in the directory.
          </p>
        ) : (
          <ul className="mt-3 space-y-2">
            {outgoing.map((b) => (
              <li
                key={b.id}
                className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-bone-300 bg-bone-50 px-4 py-3"
              >
                <div className="min-w-0">
                  <p className="text-sm font-medium text-ink-800">
                    {b.dam.callName} to {b.studListing.dog.callName}
                  </p>
                  <p className="text-2xs text-ink-400">
                    {formatDateOnly(b.windowStart)} — {formatDateOnly(b.windowEnd)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={TONE[b.status] ?? 'neutral'} size="sm">
                    {titleCase(b.status)}
                  </Badge>
                  {b.status === 'REQUESTED' && (
                    <Button
                      size="xs"
                      variant="ghost"
                      loading={busy === b.id}
                      onClick={() => act(b.id, 'withdraw')}
                    >
                      Withdraw
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

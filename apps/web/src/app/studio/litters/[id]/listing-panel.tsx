'use client';

import { ExternalLink, Eye, EyeOff, Globe, ShieldCheck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  Field,
  Input,
  Select,
  Textarea,
  formatDate,
  formatMoney,
} from '@stud/ui';
import { api, ApiError } from '@/lib/api';
import type { LitterListingDto } from '@/lib/types';

const AVAILABILITY = [
  { value: 'NOT_LISTED', label: 'Not listed — nobody can see this' },
  { value: 'PLANNED', label: 'Planned — taking expressions of interest' },
  { value: 'EXPECTING', label: 'Expecting — pregnancy confirmed' },
  { value: 'AVAILABLE', label: 'Available — puppies on the ground' },
  { value: 'FULLY_RESERVED', label: 'Fully reserved — page stays up' },
  { value: 'PAST', label: 'Past litter — archived but still indexed' },
];

/**
 * Publishing a litter.
 *
 * What is NOT on this form is the point of it: no health results, no titles,
 * no registration numbers, no COI. All of that is read from the dogs' records
 * when the page renders. A breeder who has done the work of getting their dogs
 * verified should never type a hip score into a marketing form — that is how
 * the number on the listing drifts from the number on the certificate.
 */
export function ListingPanel({
  litterId,
  listing,
  whelpedOn,
  parentVerifiedCount,
}: {
  litterId: string;
  listing: LitterListingDto | null;
  whelpedOn: string | null;
  parentVerifiedCount: number;
}) {
  const router = useRouter();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [saved, setSaved] = React.useState(false);
  const [availability, setAvailability] = React.useState(listing?.availability ?? 'NOT_LISTED');

  const webUrl = process.env.NEXT_PUBLIC_WEB_URL ?? 'http://localhost:3000';
  const isLive = Boolean(listing?.publishedAt) && listing?.availability !== 'NOT_LISTED';

  // The earliest a go-home date may be. Eight weeks, and the API refuses
  // anything under it rather than warning — this input just says so first.
  const earliestGoHome = whelpedOn
    ? new Date(new Date(whelpedOn).getTime() + 56 * 86_400_000).toISOString().slice(0, 10)
    : undefined;

  async function save(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setSaved(false);
    const fd = new FormData(e.currentTarget);

    const money = (k: string) => {
      const raw = String(fd.get(k) ?? '').replace(/[^0-9.]/g, '');
      return raw === '' ? null : Math.round(Number(raw) * 100);
    };
    const text = (k: string) => {
      const v = String(fd.get(k) ?? '').trim();
      return v === '' ? null : v;
    };

    try {
      await api(`/litters/${litterId}/listing`, {
        method: 'PUT',
        json: {
          availability,
          priceCentsFrom: money('priceCentsFrom'),
          priceCentsTo: money('priceCentsTo'),
          depositCents: money('depositCents'),
          priceNotes: text('priceNotes'),
          headline: text('headline'),
          description: text('description'),
          includedInPrice: text('includedInPrice'),
          buyerRequirements: text('buyerRequirements'),
          goHomeFrom: text('goHomeFrom'),
        },
      });
      setSaved(true);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the listing.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {saved && !error && <Alert tone="success">Saved.</Alert>}

      <Card>
        <CardContent className="pt-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="flex items-center gap-2 font-display text-lg text-ink-900">
                {isLive ? (
                  <>
                    <Globe className="h-4 w-4 text-brand-600" /> Live on Stud
                  </>
                ) : (
                  <>
                    <EyeOff className="h-4 w-4 text-ink-400" /> Not Published
                  </>
                )}
              </p>
              {listing?.publishedAt && (
                <p className="mt-0.5 text-2xs text-ink-400">
                  first published {formatDate(listing.publishedAt)}
                </p>
              )}
            </div>
            {listing?.slug && isLive && (
              <Button variant="secondary" size="sm" asChild>
                <a href={`${webUrl}/puppies/${listing.slug}`} target="_blank" rel="noreferrer">
                  <Eye /> View Public Page <ExternalLink />
                </a>
              </Button>
            )}
          </div>

          {/* Why this form is short — breeders expect to retype results here. */}
          <div className="mt-4 flex gap-3 rounded-md bg-brand-50 px-3 py-3 ring-1 ring-inset ring-brand-100">
            <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
            <p className="text-xs leading-relaxed text-ink-700">
              <span className="font-semibold text-ink-900">
                {parentVerifiedCount} verified {parentVerifiedCount === 1 ? 'result' : 'results'} on
                the parents will appear on this page automatically
              </span>{' '}
              — along with the projected COI, both pedigrees and anything still untested. You never
              retype a health result into a listing, so what buyers read cannot drift from what the
              certificate says.
            </p>
          </div>

          <Field label="Visibility" htmlFor="availability" className="mt-4">
            <Select
              id="availability"
              value={availability}
              onChange={(e) => setAvailability(e.target.value)}
            >
              {AVAILABILITY.map((a) => (
                <option key={a.value} value={a.value}>
                  {a.label}
                </option>
              ))}
            </Select>
          </Field>

          {availability === 'FULLY_RESERVED' || availability === 'PAST' ? (
            <p className="mt-2 text-2xs leading-relaxed text-ink-400">
              The page stays public and indexed. A sold-out litter is the best evidence a program
              has, and taking it down throws that away.
            </p>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 pt-5">
          <p className="text-2xs uppercase tracking-widest text-ink-400">The Listing</p>

          <Field label="Headline" htmlFor="headline" hint="Shown as the page title in search results.">
            <Input
              id="headline"
              name="headline"
              maxLength={160}
              defaultValue={listing?.headline ?? ''}
              placeholder="Golden Retriever puppies, raised in the house"
            />
          </Field>

          <Field
            label="About This Litter"
            htmlFor="description"
            hint="How they are raised, what you are breeding for, anything a buyer should know before they ask."
          >
            <Textarea id="description" name="description" rows={7} defaultValue={listing?.description ?? ''} />
          </Field>

          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Price From" htmlFor="priceCentsFrom">
              <MoneyInput id="priceCentsFrom" name="priceCentsFrom" cents={listing?.priceCentsFrom} />
            </Field>
            <Field label="Price To" htmlFor="priceCentsTo">
              <MoneyInput id="priceCentsTo" name="priceCentsTo" cents={listing?.priceCentsTo} />
            </Field>
            <Field label="Deposit" htmlFor="depositCents">
              <MoneyInput id="depositCents" name="depositCents" cents={listing?.depositCents} />
            </Field>
          </div>

          <Field
            label="Notes on Price"
            htmlFor="priceNotes"
            hint="Why the range is a range. Buyers assume the cheap one is the flawed one unless you say otherwise."
          >
            <Textarea id="priceNotes" name="priceNotes" rows={2} defaultValue={listing?.priceNotes ?? ''} />
          </Field>

          <Field
            label="Ready to Go Home From"
            htmlFor="goHomeFrom"
            hint={
              earliestGoHome
                ? `No earlier than ${formatDate(earliestGoHome)} — eight weeks.`
                : 'Eight weeks after whelping at the earliest.'
            }
          >
            <Input
              id="goHomeFrom"
              name="goHomeFrom"
              type="date"
              min={earliestGoHome}
              defaultValue={listing?.goHomeFrom?.slice(0, 10) ?? ''}
            />
          </Field>

          <Field label="What Is Included" htmlFor="includedInPrice">
            <Textarea
              id="includedInPrice"
              name="includedInPrice"
              rows={4}
              defaultValue={listing?.includedInPrice ?? ''}
              placeholder="Registration, microchip, first vaccination, health certificate, food, take-back guarantee…"
            />
          </Field>

          <Field
            label="What You Ask of a Buyer"
            htmlFor="buyerRequirements"
            hint="Stated up front, this filters out the enquiries you would decline anyway."
          >
            <Textarea
              id="buyerRequirements"
              name="buyerRequirements"
              rows={4}
              defaultValue={listing?.buyerRequirements ?? ''}
            />
          </Field>
        </CardContent>
      </Card>

      {listing && (
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xs uppercase tracking-widest text-ink-400">
              What search sees — derived, not typed
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <Badge tone="brand" size="sm">
                {listing.cachedSireVerified + listing.cachedDamVerified} verified on the parents
              </Badge>
              {listing.cachedCoi != null && (
                <Badge tone="neutral" size="sm">
                  {(listing.cachedCoi * 100).toFixed(1)}% COI
                </Badge>
              )}
              <Badge tone="neutral" size="sm">
                {listing.cachedAvailablePups} of {listing.cachedTotalPups} available
              </Badge>
              {listing.priceCentsFrom != null && (
                <Badge tone="neutral" size="sm">
                  from {formatMoney(listing.priceCentsFrom, { compact: true })}
                </Badge>
              )}
            </div>
            <p className="mt-3 text-2xs leading-relaxed text-ink-400">
              These are recomputed from your records whenever anything changes — reserving a puppy
              updates the availability count on the browse page immediately. They drive sorting and
              filtering only; the litter page itself reads everything live.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="flex items-center justify-end gap-3">
        <p className="text-2xs text-ink-400">
          {availability === 'NOT_LISTED' ? 'Saving keeps this private.' : 'Saving publishes it.'}
        </p>
        <Button type="submit" loading={busy}>
          {availability === 'NOT_LISTED' ? 'Save draft' : 'Save and publish'}
        </Button>
      </div>
    </form>
  );
}

/** Money in, integer cents out. Converted once, at the edge. */
function MoneyInput({ id, name, cents }: { id: string; name: string; cents?: number | null }) {
  return (
    <div className="relative">
      <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-400">
        $
      </span>
      <Input
        id={id}
        name={name}
        inputMode="decimal"
        className="pl-7 tabular-nums"
        defaultValue={cents != null ? (cents / 100).toFixed(2) : ''}
        placeholder="0.00"
      />
    </div>
  );
}

'use client';

import { X } from 'lucide-react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { Button, Checkbox, Field, Select, cn } from '@stud/ui';

/**
 * Search filters.
 *
 * URL-backed rather than component state, for three reasons that all matter on
 * a page meant to rank: a filtered view is shareable, it survives a back
 * button, and the server renders it without a client round trip.
 *
 * Every health filter here reads from verified claims on BOTH parents. That is
 * the one thing a classified board cannot offer, because it has no idea
 * whether the hips are normal.
 */
const HEALTH_FILTERS = [
  { value: 'HIP', label: 'Hips' },
  { value: 'ELBOW', label: 'Elbows' },
  { value: 'EYE_CAER', label: 'Eyes' },
  { value: 'CARDIAC', label: 'Heart' },
] as const;

export function LitterFilters() {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();

  const selectedHealth = React.useMemo(
    () => new Set((params.get('verifiedNormal') ?? '').split(',').filter(Boolean)),
    [params],
  );

  function apply(next: URLSearchParams) {
    const qs = next.toString();
    router.push(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  }

  function set(key: string, value: string | null) {
    const next = new URLSearchParams(params.toString());
    if (value === null || value === '') next.delete(key);
    else next.set(key, value);
    apply(next);
  }

  function toggleHealth(claim: string) {
    const next = new URLSearchParams(params.toString());
    const set_ = new Set(selectedHealth);
    if (set_.has(claim)) set_.delete(claim);
    else set_.add(claim);
    if (set_.size === 0) next.delete('verifiedNormal');
    else next.set('verifiedNormal', [...set_].join(','));
    apply(next);
  }

  const hasFilters = [...params.keys()].some((k) => k !== 'sort');

  return (
    <aside className="space-y-5 lg:sticky lg:top-6 lg:self-start">
      <div className="flex items-center justify-between">
        <p className="text-2xs uppercase tracking-widest text-ink-400">Filter</p>
        {hasFilters && (
          <Button variant="link" size="xs" onClick={() => apply(new URLSearchParams())}>
            <X /> Clear
          </Button>
        )}
      </div>

      <Field label="Breed" htmlFor="breed">
        <Select
          id="breed"
          inputSize="sm"
          value={params.get('breed') ?? ''}
          onChange={(e) => set('breed', e.target.value)}
        >
          <option value="">Any Breed</option>
          <option value="Golden Retriever">Golden Retriever</option>
          <option value="German Shorthaired Pointer">German Shorthaired Pointer</option>
          <option value="Labrador Retriever">Labrador Retriever</option>
        </Select>
      </Field>

      <Field label="Availability" htmlFor="availability">
        <Select
          id="availability"
          inputSize="sm"
          value={params.get('availability') ?? ''}
          onChange={(e) => set('availability', e.target.value)}
        >
          <option value="">Any</option>
          <option value="AVAILABLE">Puppies Available</option>
          <option value="EXPECTING">Expecting</option>
          <option value="PLANNED">Planned</option>
          <option value="FULLY_RESERVED">Fully Reserved</option>
          <option value="PAST">Past Litters</option>
        </Select>
      </Field>

      <div>
        <p className="mb-2 text-sm font-medium text-ink-700">Parents Tested Normal</p>
        <div className="space-y-1.5">
          {HEALTH_FILTERS.map((h) => (
            <Checkbox
              key={h.value}
              checked={selectedHealth.has(h.value)}
              onChange={() => toggleHealth(h.value)}
              label={h.label}
            />
          ))}
        </div>
        {/*
          Stated where the filter is, not in a footnote. Selecting two means
          both, on both parents — quietly widening that to "either" would be
          the kind of helpfulness that returns the wrong litter.
        */}
        <p className="mt-2 text-2xs leading-relaxed text-ink-400">
          Both parents, checked with the registry. One side tested is not enough.
        </p>
      </div>

      <Field
        label="How Related the Parents Are"
        htmlFor="maxCoi"
        hint="Closely related parents raise the odds of inherited problems."
      >
        <Select
          id="maxCoi"
          inputSize="sm"
          value={params.get('maxCoi') ?? ''}
          onChange={(e) => set('maxCoi', e.target.value)}
        >
          <option value="">Any</option>
          <option value="0.0625">No closer than first cousins</option>
          <option value="0.125">No closer than half-siblings</option>
          <option value="0.25">No closer than siblings</option>
        </Select>
      </Field>

      <Field label="Maximum Price" htmlFor="maxPriceCents">
        <Select
          id="maxPriceCents"
          inputSize="sm"
          value={params.get('maxPriceCents') ?? ''}
          onChange={(e) => set('maxPriceCents', e.target.value)}
        >
          <option value="">Any</option>
          <option value="150000">Under $1,500</option>
          <option value="250000">Under $2,500</option>
          <option value="350000">Under $3,500</option>
          <option value="500000">Under $5,000</option>
        </Select>
      </Field>

      <Checkbox
        checked={params.get('requireNoConflicts') === 'true'}
        onChange={(e) => set('requireNoConflicts', e.target.checked ? 'true' : null)}
        label="Hide Disputed Results"
      />

      <Field label="Sort By" htmlFor="sort" className={cn('border-t border-bone-200 pt-4')}>
        <Select
          id="sort"
          inputSize="sm"
          value={params.get('sort') ?? 'RELEVANCE'}
          onChange={(e) => set('sort', e.target.value === 'RELEVANCE' ? null : e.target.value)}
        >
          <option value="RELEVANCE">Most Verified First</option>
          <option value="SOONEST">Ready Soonest</option>
          <option value="PRICE_ASC">Price, Low to High</option>
          <option value="PRICE_DESC">Price, High to Low</option>
          <option value="COI">Least Related Parents</option>
        </Select>
      </Field>
    </aside>
  );
}

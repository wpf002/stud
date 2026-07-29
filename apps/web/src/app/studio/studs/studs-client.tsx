'use client';

import { AlertTriangle, Bookmark, MapPin, Search, ShieldCheck, SlidersHorizontal } from 'lucide-react';
import Link from 'next/link';
import * as React from 'react';
import { Alert, Badge, Button, Card, CardContent, Checkbox, EmptyState, Field, Input, Select, cn, formatCoi, formatDistance, formatDogAge, formatMoney, titleCase } from '@stud/ui';
import { api, ApiError } from '@/lib/api';
import type { DogSummary, StudSearchResponse, StudRow } from '@/lib/types';

const HEALTH_FILTERS = [
  { value: 'HIP', label: 'Hips' },
  { value: 'ELBOW', label: 'Elbows' },
  { value: 'EYE_CAER', label: 'Eyes' },
  { value: 'CARDIAC', label: 'Cardiac' },
  { value: 'THYROID', label: 'Thyroid' },
];

const TITLE_FILTERS = [
  { value: 'TITLE_HUNT_TEST', label: 'Hunt Test' },
  { value: 'TITLE_FIELD', label: 'Field Trial' },
  { value: 'TITLE_CONFORMATION', label: 'Conformation' },
  { value: 'NAVHDA_UT', label: 'NAVHDA UT' },
];

/**
 * The stud directory.
 *
 * The filters are the product. A classified board cannot offer "verified
 * normal hips" because it has no idea whether the hips are normal — every
 * health filter here reads from the verified claim tables, and the empty state
 * says so rather than just shrugging.
 */
export function StudsClient({ dams }: { dams: DogSummary[] }) {
  const [results, setResults] = React.useState<StudSearchResponse | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showFilters, setShowFilters] = React.useState(true);

  const [search, setSearch] = React.useState('');
  const [breed, setBreed] = React.useState('');
  const [damId, setDamId] = React.useState('');
  const [health, setHealth] = React.useState<string[]>([]);
  const [titles, setTitles] = React.useState<string[]>([]);
  const [requireChic, setRequireChic] = React.useState(false);
  const [semenType, setSemenType] = React.useState('');
  const [maxFee, setMaxFee] = React.useState('');
  const [maxCoi, setMaxCoi] = React.useState('');
  const [sort, setSort] = React.useState('RELEVANCE');

  const run = React.useCallback(async () => {
    setBusy(true);
    setError(null);
    const params = new URLSearchParams();
    if (search) params.set('search', search);
    if (breed) params.set('breed', breed);
    if (damId) params.set('damId', damId);
    if (health.length) params.set('verifiedNormal', health.join(','));
    if (titles.length) params.set('hasTitle', titles.join(','));
    if (requireChic) params.set('requireChic', 'true');
    if (semenType) params.set('semenType', semenType);
    if (maxFee) params.set('maxFeeCents', String(Math.round(Number(maxFee) * 100)));
    if (maxCoi) params.set('maxCoi', String(Number(maxCoi) / 100));
    params.set('sort', sort);

    try {
      setResults(await api<StudSearchResponse>(`/studs?${params.toString()}`));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Search failed.');
    } finally {
      setBusy(false);
    }
  }, [search, breed, damId, health, titles, requireChic, semenType, maxFee, maxCoi, sort]);

  React.useEffect(() => {
    void run();
    // Intentionally on mount only — the filter panel has an explicit Search
    // button, because refiltering on every keystroke against a COI computation
    // would be both slow and jumpy.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const toggle = (list: string[], setList: (v: string[]) => void, value: string) =>
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <div className="grid gap-4 lg:grid-cols-[17rem_1fr]">
      {/* ── Filters ──────────────────────────────────────────────────── */}
      <div className={cn('space-y-4', !showFilters && 'hidden lg:block')}>
        <Card>
          <CardContent className="space-y-4 pt-5">
            <Field label="Search" htmlFor="search">
              <Input
                id="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Name or kennel"
                onKeyDown={(e) => e.key === 'Enter' && run()}
              />
            </Field>

            <Field label="Breed" htmlFor="breed">
              <Input id="breed" value={breed} onChange={(e) => setBreed(e.target.value)} />
            </Field>

            {/* The differentiating filter. */}
            <Field
              label="Match Against"
              htmlFor="damId"
              hint="Pick a bitch and every stud is scored for the litter it would produce with her."
            >
              <Select id="damId" value={damId} onChange={(e) => setDamId(e.target.value)}>
                <option value="">No Bitch Selected</option>
                {dams.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.callName}
                  </option>
                ))}
              </Select>
            </Field>

            {damId && (
              <Field label="Max Projected COI (%)" htmlFor="maxCoi">
                <Input
                  id="maxCoi"
                  type="number"
                  step="0.5"
                  min="0"
                  max="50"
                  value={maxCoi}
                  onChange={(e) => setMaxCoi(e.target.value)}
                  placeholder="6.25"
                  className="font-mono"
                />
              </Field>
            )}

            <fieldset>
              <legend className="flex items-center gap-1.5 text-sm font-medium text-ink-700">
                <ShieldCheck className="h-3.5 w-3.5 text-brand-600" /> Verified Normal
              </legend>
              <p className="mb-2 mt-0.5 text-2xs leading-relaxed text-ink-400">
                Checked against the source, not typed in by the owner.
              </p>
              <div className="space-y-1.5">
                {HEALTH_FILTERS.map((h) => (
                  <Checkbox
                    key={h.value}
                    checked={health.includes(h.value)}
                    onChange={() => toggle(health, setHealth, h.value)}
                    label={h.label}
                  />
                ))}
                <Checkbox
                  checked={requireChic}
                  onChange={(e) => setRequireChic(e.target.checked)}
                  label="CHIC Number"
                />
              </div>
            </fieldset>

            <fieldset>
              <legend className="text-sm font-medium text-ink-700">Verified Titles</legend>
              <div className="mt-2 space-y-1.5">
                {TITLE_FILTERS.map((t) => (
                  <Checkbox
                    key={t.value}
                    checked={titles.includes(t.value)}
                    onChange={() => toggle(titles, setTitles, t.value)}
                    label={t.label}
                  />
                ))}
              </div>
            </fieldset>

            <Field label="Semen" htmlFor="semenType">
              <Select id="semenType" value={semenType} onChange={(e) => setSemenType(e.target.value)}>
                <option value="">Any</option>
                <option value="NATURAL">Natural Only</option>
                <option value="FRESH">Fresh</option>
                <option value="CHILLED">Ships Chilled</option>
                <option value="FROZEN">Ships Frozen</option>
              </Select>
            </Field>

            <Field label="Max Fee ($)" htmlFor="maxFee">
              <Input
                id="maxFee"
                type="number"
                min="0"
                step="100"
                value={maxFee}
                onChange={(e) => setMaxFee(e.target.value)}
                className="font-mono"
              />
            </Field>

            <Button block onClick={run} loading={busy}>
              <Search /> Search
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* ── Results ──────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-sm text-ink-500">
            {results ? `${results.total} stud${results.total === 1 ? '' : 's'}` : 'Searching…'}
            {damId && results?.total ? ' · scored against your bitch' : ''}
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden"
              onClick={() => setShowFilters((v) => !v)}
            >
              <SlidersHorizontal /> Filters
            </Button>
            <Select
              inputSize="sm"
              value={sort}
              onChange={(e) => {
                setSort(e.target.value);
                setTimeout(run, 0);
              }}
              className="w-44"
            >
              <option value="RELEVANCE">Most Verified</option>
              {damId && <option value="COI">Lowest Projected COI</option>}
              <option value="FEE_ASC">Fee: Low to High</option>
              <option value="FEE_DESC">Fee: High to Low</option>
              <option value="DISTANCE">Nearest</option>
            </Select>
          </div>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        {results && results.studs.length === 0 ? (
          <EmptyState
            icon={<Search className="h-5 w-5" />}
            title="No studs match those filters"
            description={
              health.length > 0 || titles.length > 0 || requireChic
                ? 'Health and title filters only match registry-confirmed results, so dogs with unverified claims won\u2019t show up here.'
                : 'Try widening the filters.'
            }
          />
        ) : (
          <div className="space-y-3">
            {results?.studs.map((s) => (
              <StudCard key={s.id} stud={s} damId={damId || null} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function StudCard({ stud, damId }: { stud: StudRow; damId: string | null }) {
  const [saving, setSaving] = React.useState(false);
  const [saved, setSaved] = React.useState(false);
  const dog = stud.dog;
  const summary = dog.verificationSummary;
  const atRisk = stud.geneticRisk?.atRisk ?? 0;

  async function shortlist() {
    if (!damId) return;
    setSaving(true);
    try {
      await api('/pairings/saved', { method: 'POST', json: { sireId: dog.id, damId } });
      setSaved(true);
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card interactive className={cn(atRisk > 0 && 'border-danger/30')}>
      <div className="p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <Link href={`/studs/${dog.slug}`} className="group">
              <p className="font-display text-lg leading-tight text-ink-900 group-hover:text-brand-700">
                {dog.registeredName ?? dog.callName}
              </p>
            </Link>
            <p className="mt-0.5 text-sm text-ink-500">
              {dog.breed} · {formatDogAge(dog.dateOfBirth)}
              {dog.kennel ? ` · ${dog.kennel.name}` : ''}
            </p>
            <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-2xs text-ink-400">
              {dog.kennel?.city && (
                <span className="flex items-center gap-1">
                  <MapPin className="h-3 w-3" />
                  {dog.kennel.city}, {dog.kennel.region}
                  {stud.distanceMiles != null ? ` · ${formatDistance(stud.distanceMiles)}` : ''}
                </span>
              )}
              {stud.semenTypes.length > 0 && <span>{stud.semenTypes.map(titleCase).join(", ")}</span>}
              {stud.shipsSemen && <span>Ships</span>}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="font-display text-xl text-ink-900">
              {stud.studFeeCents != null ? formatMoney(stud.studFeeCents, { compact: true }) : '—'}
            </p>
            <Badge tone={stud.availability === 'AVAILABLE' ? 'brand' : 'neutral'} size="sm">
              {titleCase(stud.availability)}
            </Badge>
          </div>
        </div>

        {/* The numbers that only exist because of Phases 1 and 2. */}
        <div className="mt-4 grid grid-cols-2 gap-3 border-t border-bone-200 pt-3 sm:grid-cols-4">
          <Metric
            label="Verified"
            value={summary ? `${Math.round(summary.density * 100)}%` : '—'}
            sub={summary ? `${summary.verifiedCount} claims` : 'nothing on file'}
            tone={summary && summary.density > 0.6 ? 'good' : undefined}
          />
          <Metric
            label="Health normal"
            value={summary ? String(summary.healthNormalCount) : '—'}
            sub={summary?.hasChic ? 'CHIC' : undefined}
          />
          <Metric label="His own COI" value={dog.pedigreeStats ? formatCoi(dog.pedigreeStats.coi) : '—'} />
          {damId ? (
            <Metric
              label="Litter COI"
              value={stud.projectedCoi != null ? formatCoi(stud.projectedCoi) : '—'}
              tone={
                stud.projectedCoi == null ? undefined : stud.projectedCoi < 0.0625 ? 'good' : 'warn'
              }
              sub="with your bitch"
            />
          ) : (
            <Metric label="Titles" value={summary ? String(summary.verifiedTitleCount) : '—'} />
          )}
        </div>

        {/* An at-risk genetic pairing outranks everything else on the card. */}
        {atRisk > 0 && (
          <p className="mt-3 flex items-center gap-2 rounded-md bg-danger-bg px-3 py-2 text-xs text-danger-fg">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            {atRisk} genetic marker{atRisk === 1 ? '' : 's'} would produce affected puppies with your
            bitch.
          </p>
        )}
        {atRisk === 0 && (stud.geneticRisk?.unknown ?? 0) > 0 && (
          <p className="mt-3 text-2xs text-ink-500">
            {stud.geneticRisk!.unknown} genetic marker
            {stud.geneticRisk!.unknown === 1 ? '' : 's'} could not be checked — one of the two dogs
            has not been tested for {stud.geneticRisk!.unknown === 1 ? 'it' : 'them'}.
          </p>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-bone-200 bg-bone-100 px-4 py-2">
        <Button asChild variant="ghost" size="sm">
          <Link href={`/studs/${dog.slug}`}>View Profile</Link>
        </Button>
        {damId && (
          <>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/studio/pedigrees/pairing?sireId=${dog.id}&damId=${damId}`}>Trial Pairing</Link>
            </Button>
            <Button variant="ghost" size="sm" onClick={shortlist} loading={saving} disabled={saved}>
              <Bookmark /> {saved ? 'Shortlisted' : 'Shortlist'}
            </Button>
          </>
        )}
      </div>
    </Card>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: 'good' | 'warn';
}) {
  return (
    <div>
      <p className="text-2xs uppercase tracking-widest text-ink-400">{label}</p>
      <p
        className={cn(
          'font-mono text-md tabular-nums',
          tone === 'good' ? 'text-brand-700' : tone === 'warn' ? 'text-warning-fg' : 'text-ink-800',
        )}
      >
        {value}
      </p>
      {sub && <p className="text-2xs text-ink-400">{sub}</p>}
    </div>
  );
}

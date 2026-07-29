'use client';

import { AlertTriangle, Check, Plus, Scale, Stethoscope } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import * as React from 'react';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, EmptyState, Field, GrowthChart, Input, Tabs, TabsContent, TabsList, TabsTrigger, Textarea, WeightSparkline, cn, formatDate, formatDateTime, relativeTime, titleCase } from '@stud/ui';
import { api, ApiError } from '@/lib/api';
import type { GrowthAssessmentDto, LitterDetailResponse, PuppyDto } from '@/lib/types';
import { ListingPanel } from './listing-panel';

const TABS = ['puppies', 'growth', 'care', 'log', 'listing'] as const;

export function LitterClient({ initial }: { initial: LitterDetailResponse }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [data, setData] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);

  // Tab state lives in the URL. A breeder checking growth on a litter every
  // morning should be able to bookmark it, and a refresh must not throw them
  // back to the first tab.
  const paramTab = searchParams.get('tab');
  const tab = (TABS as readonly string[]).includes(paramTab ?? '') ? paramTab! : 'puppies';
  const setTab = (next: string) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set('tab', next);
    router.replace(`?${params.toString()}`, { scroll: false });
  };

  const refresh = React.useCallback(async () => {
    setData(await api<LitterDetailResponse>(`/litters/${initial.litter.id}`));
    router.refresh();
  }, [initial.litter.id, router]);

  const { litter, milestones, growth, siblings, referenceBand } = data;
  const growthById = new Map(growth.map((g) => [g.puppyId, g.assessment]));
  const siblingById = new Map(siblings.map((s) => [s.puppyId, s]));

  const urgent = growth.filter((g) => g.assessment.flags.some((f) => f.severity === 'URGENT'));
  const whelped = Boolean(litter.whelpedOn);

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}

      {/* Anything urgent goes above everything else. */}
      {urgent.length > 0 && (
        <Alert tone="danger" icon={<AlertTriangle className="h-4 w-4" />}>
          <span className="font-semibold">
            {urgent.length} {urgent.length === 1 ? 'puppy needs' : 'puppies need'} attention
          </span>
          <ul className="mt-1.5 space-y-0.5">
            {urgent.map((g) => {
              const pup = litter.puppies.find((p) => p.id === g.puppyId);
              return (
                <li key={g.puppyId}>
                  {puppyLabel(pup)} — {g.assessment.flags[0]!.message}
                </li>
              );
            })}
          </ul>
        </Alert>
      )}

      {!whelped && (
        <WhelpDatePrompt litterId={litter.id} expectedOn={litter.expectedWhelpOn} onDone={refresh} />
      )}

      <div className="grid gap-4 lg:grid-cols-[1fr_19rem]">
        <div className="space-y-4">
          <Tabs value={tab} onValueChange={setTab}>
            <TabsList>
              <TabsTrigger value="puppies">Puppies ({litter.puppies.length})</TabsTrigger>
              <TabsTrigger value="growth">Growth</TabsTrigger>
              <TabsTrigger value="care">Care Schedule</TabsTrigger>
              <TabsTrigger value="log">Whelping Log</TabsTrigger>
              <TabsTrigger value="listing">Listing</TabsTrigger>
            </TabsList>

            {/* ── Puppies ─────────────────────────────────────────── */}
            <TabsContent value="puppies">
              <Card>
                <CardHeader className="flex-row items-center justify-between">
                  <CardTitle as="h4" className="text-md">
                    In the Box
                  </CardTitle>
                  <AddPuppyDialog litterId={litter.id} nextOrder={litter.puppies.length + 1} onDone={refresh} />
                </CardHeader>
                <CardContent>
                  {litter.puppies.length === 0 ? (
                    <EmptyState
                      title="No Puppies Logged"
                      description="Log each one as it arrives. Sex is the only thing you have to enter — weight, markings and collar colour can wait until you have a free hand."
                    />
                  ) : (
                    <ul className="divide-y divide-bone-200">
                      {litter.puppies.map((p) => (
                        <PuppyRow
                          key={p.id}
                          puppy={p}
                          assessment={growthById.get(p.id) ?? null}
                          sibling={siblingById.get(p.id) ?? null}
                          bornOn={litter.whelpedOn}
                          onDone={refresh}
                          onError={setError}
                        />
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Growth ──────────────────────────────────────────── */}
            <TabsContent value="growth">
              <Card>
                <CardHeader>
                  <CardTitle as="h4" className="text-md">
                    Weight Against the Reference Band
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <GrowthChart
                    series={litter.puppies.map((p) => ({
                      puppyId: p.id,
                      label: puppyLabel(p),
                      atRisk: growthById.get(p.id)?.flags.some((f) => f.severity === 'URGENT') ?? false,
                      points: litter.whelpedOn
                        ? p.weights.map((w) => ({
                            day: Math.round(
                              (new Date(w.recordedOn).getTime() - new Date(litter.whelpedOn!).getTime()) /
                                86_400_000,
                            ),
                            grams: w.grams,
                          }))
                        : [],
                    }))}
                    reference={referenceBand}
                  />
                  <p className="mt-4 border-t border-bone-200 pt-3 text-2xs leading-relaxed text-ink-400">
                    The band is scaled to this litter&rsquo;s own median birth weight, not to a breed
                    average — a Chihuahua and a Great Dane both roughly double birth weight by day
                    ten, so the useful comparison is a puppy against its own trajectory and against
                    its littermates.
                  </p>
                </CardContent>
              </Card>
            </TabsContent>

            {/* ── Care schedule ───────────────────────────────────── */}
            <TabsContent value="care">
              <CareSchedule tasks={litter.careTasks} litterId={litter.id} whelped={whelped} onDone={refresh} />
            </TabsContent>

            {/* ── Whelping log ────────────────────────────────────── */}
            <TabsContent value="log">
              <WhelpingLog
                litterId={litter.id}
                events={litter.whelpingEvents}
                onDone={refresh}
                onError={setError}
              />
            </TabsContent>

            {/* ── Public listing ──────────────────────────────────── */}
            <TabsContent value="listing">
              <ListingPanel
                litterId={litter.id}
                listing={data.listing ?? null}
                whelpedOn={litter.whelpedOn}
                parentVerifiedCount={
                  (litter.sire.verificationSummary?.verifiedCount ?? 0) +
                  (litter.dam.verificationSummary?.verifiedCount ?? 0)
                }
              />
            </TabsContent>
          </Tabs>
        </div>

        {/* ── Rail ────────────────────────────────────────────────── */}
        <div className="space-y-4">
          <Card>
            <CardContent className="pt-5">
              <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">Litter</p>
              <p className="mt-1 font-display text-xl text-ink-900">
                {litter.dam.callName} × {litter.sire.callName}
              </p>
              <dl className="mt-4 space-y-2 border-t border-bone-200 pt-3 text-sm">
                <Row label="Status" value={titleCase(litter.status)} />
                {litter.whelpedOn ? (
                  <>
                    <Row label="Whelped" value={formatDate(litter.whelpedOn)} />
                    <Row label="Age" value={`${milestones?.ageDays ?? 0} days · ${milestones?.ageWeeks ?? 0} wk`} />
                  </>
                ) : (
                  <Row
                    label="Expected"
                    value={litter.expectedWhelpOn ? formatDate(litter.expectedWhelpOn) : '—'}
                  />
                )}
                <Row label="Born" value={litter.totalBorn != null ? String(litter.totalBorn) : '—'} />
                <Row label="Live" value={litter.liveBorn != null ? String(litter.liveBorn) : '—'} />
                {(litter.stillborn ?? 0) > 0 && <Row label="Stillborn" value={String(litter.stillborn)} />}
                {litter.neonatalDeaths > 0 && <Row label="Lost since" value={String(litter.neonatalDeaths)} />}
                {litter.breeding?.xrayPuppyCount != null && (
                  <Row label="X-ray count" value={String(litter.breeding.xrayPuppyCount)} />
                )}
              </dl>
            </CardContent>
          </Card>

          {milestones && (
            <Card>
              <CardHeader>
                <CardTitle as="h4" className="text-md">
                  What Happens Next
                </CardTitle>
              </CardHeader>
              <CardContent>
                {milestones.inCriticalWindow && (
                  <p className="mb-3 rounded-md bg-warning-bg px-3 py-2 text-xs leading-relaxed text-warning-fg">
                    First fortnight. Weigh twice daily — a puppy that stops gaining is in trouble
                    hours before it looks like it.
                  </p>
                )}
                <ul className="space-y-2 text-sm">
                  <Milestone label="Eyes open" on={milestones.eyesOpenOn} />
                  <Milestone label="Weaning starts" on={milestones.weaningStartsOn} />
                  <Milestone label="Socialisation window" on={milestones.socialisationOpensOn} />
                  <Milestone label="First vaccination" on={milestones.firstVaccinationOn} />
                  <Milestone label="Earliest go-home" on={milestones.goHomeFrom} emphasis />
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Pieces ─────────────────────────────────────────────────────────────────

function puppyLabel(p?: PuppyDto | null): string {
  if (!p) return 'Puppy';
  return p.name || p.collarColor || `#${p.birthOrder ?? '?'}`;
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-ink-500">{label}</dt>
      <dd className="text-right text-ink-800">{value}</dd>
    </div>
  );
}

function Milestone({ label, on, emphasis }: { label: string; on: string; emphasis?: boolean }) {
  const past = new Date(on) < new Date();
  return (
    <li className="flex items-baseline justify-between gap-3">
      <span className={cn(past ? 'text-ink-400 line-through' : emphasis ? 'font-medium text-ink-800' : 'text-ink-600')}>
        {label}
      </span>
      <span className={cn('shrink-0 text-2xs', past ? 'text-ink-300' : 'text-ink-500')}>
        {formatDate(on, 'short')}
      </span>
    </li>
  );
}

function WhelpDatePrompt({
  litterId,
  expectedOn,
  onDone,
}: {
  litterId: string;
  expectedOn: string | null;
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function record(date: string) {
    setBusy(true);
    try {
      await api(`/litters/${litterId}`, { method: 'PATCH', json: { whelpedOn: date } });
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-brand-200 bg-brand-50/50">
      <CardContent className="pt-5">
        <p className="font-display text-lg text-ink-900">Not Whelped Yet</p>
        <p className="mt-1 text-sm leading-relaxed text-ink-600">
          {expectedOn
            ? `Due ${formatDate(expectedOn)} — ${relativeTime(expectedOn)}.`
            : 'No due date on record.'}{' '}
          Recording the whelp date generates the full care schedule from it.
        </p>
        <form
          className="mt-4 flex flex-wrap items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            const v = new FormData(e.currentTarget).get('whelpedOn');
            if (v) record(String(v));
          }}
        >
          <Field label="Whelp Date" htmlFor="whelpedOn" className="min-w-48">
            <Input
              id="whelpedOn"
              name="whelpedOn"
              type="date"
              required
              defaultValue={new Date().toISOString().slice(0, 10)}
            />
          </Field>
          <Button type="submit" loading={busy}>
            Record Whelp
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}

/**
 * Logging a puppy mid-whelp.
 *
 * Sex is the only required field, and the form opens with it focused. Anything
 * that can wait, waits — this gets used with one hand while the other is
 * holding a towel.
 */
function AddPuppyDialog({
  litterId,
  nextOrder,
  onDone,
}: {
  litterId: string;
  nextOrder: number;
  onDone: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [sex, setSex] = React.useState<'MALE' | 'FEMALE'>('MALE');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const f = new FormData(e.currentTarget);
    const weight = String(f.get('birthWeightGrams') || '');
    try {
      await api(`/litters/${litterId}/puppies`, {
        method: 'POST',
        json: {
          sex,
          birthOrder: nextOrder,
          collarColor: String(f.get('collarColor') || '') || undefined,
          birthWeightGrams: weight ? Number(weight) : undefined,
          colorPattern: String(f.get('colorPattern') || '') || undefined,
          markings: String(f.get('markings') || '') || undefined,
        },
      });
      setOpen(false);
      onDone();
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm">
          <Plus /> Log a Puppy
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Puppy #{nextOrder}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit}>
          <DialogBody>
            {/* Big targets — this is used one-handed. */}
            <Field label="Sex" required>
              <div className="grid grid-cols-2 gap-2">
                {(['MALE', 'FEMALE'] as const).map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSex(s)}
                    className={cn(
                      'flex h-tap items-center justify-center rounded-md border-2 text-md font-medium transition-colors',
                      sex === s
                        ? s === 'MALE'
                          ? 'border-brand-500 bg-brand-50 text-brand-800'
                          : 'border-clay-400 bg-clay-50 text-clay-700'
                        : 'border-bone-300 bg-bone-100 text-ink-500',
                    )}
                  >
                    {s === 'MALE' ? 'Male' : 'Female'}
                  </button>
                ))}
              </div>
            </Field>

            <Field label="Birth Weight (grams)" htmlFor="birthWeightGrams">
              <Input
                id="birthWeightGrams"
                name="birthWeightGrams"
                type="number"
                inputMode="numeric"
                min={20}
                max={3000}
                inputSize="tap"
                className="font-mono text-lg"
                autoFocus
              />
            </Field>

            <Field label="Collar Colour" htmlFor="collarColor" hint="What you'll call it until it has a name.">
              <Input id="collarColor" name="collarColor" inputSize="tap" placeholder="Green" />
            </Field>

            <Field label="Colour / Markings" htmlFor="colorPattern">
              <Input id="colorPattern" name="colorPattern" inputSize="tap" placeholder="Liver roan" />
            </Field>
            <Input name="markings" placeholder="White blaze, ticked legs…" inputSize="tap" />
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} size="tap">
              Log Puppy
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PuppyRow({
  puppy,
  assessment,
  sibling,
  bornOn,
  onDone,
  onError,
}: {
  puppy: PuppyDto;
  assessment: GrowthAssessmentDto | null;
  sibling: { rank: number | null; ofTotal: number; vsMedianGrams: number | null } | null;
  bornOn: string | null;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [weighing, setWeighing] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const urgent = assessment?.flags.find((f) => f.severity === 'URGENT');
  const watch = assessment?.flags.find((f) => f.severity === 'WATCH');

  const points = bornOn
    ? puppy.weights.map((w) => ({
        day: Math.round((new Date(w.recordedOn).getTime() - new Date(bornOn).getTime()) / 86_400_000),
        grams: w.grams,
      }))
    : [];

  async function weigh(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const grams = Number(new FormData(e.currentTarget).get('grams'));
    try {
      await api(`/puppies/${puppy.id}/weights`, { method: 'POST', json: { grams } });
      setWeighing(false);
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not save that weight.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <li className={cn('py-3', urgent && 'bg-danger-bg/30')}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium text-ink-800">{puppyLabel(puppy)}</span>
            <Badge tone={puppy.sex === 'MALE' ? 'brand' : 'clay'} size="sm">
              {puppy.sex === 'MALE' ? 'M' : 'F'}
            </Badge>
            {puppy.status !== 'AVAILABLE' && (
              <Badge tone="neutral" size="sm">
                {titleCase(puppy.status)}
              </Badge>
            )}
            {urgent && (
              <Badge tone="danger" size="sm">
                <AlertTriangle /> Needs Attention
              </Badge>
            )}
          </p>
          <p className="mt-0.5 text-2xs text-ink-400">
            {puppy.colorPattern}
            {sibling?.rank ? ` · ${sibling.rank} of ${sibling.ofTotal} by weight` : ''}
            {sibling?.vsMedianGrams != null && sibling.vsMedianGrams !== 0
              ? ` · ${sibling.vsMedianGrams > 0 ? '+' : ''}${sibling.vsMedianGrams} g vs litter median`
              : ''}
          </p>
          {(urgent || watch) && (
            <p className={cn('mt-1 text-xs', urgent ? 'text-danger-fg' : 'text-warning-fg')}>
              {(urgent ?? watch)!.message}
            </p>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-3">
          <WeightSparkline points={points} atRisk={Boolean(urgent)} />
          <div className="text-right">
            <p className="font-mono text-md tabular-nums text-ink-800">
              {assessment?.latestGrams != null ? `${assessment.latestGrams} g` : '—'}
            </p>
            <p className="text-2xs text-ink-400">
              {assessment?.multipleOfBirthWeight != null
                ? `${assessment.multipleOfBirthWeight}× birth`
                : 'not weighed'}
            </p>
          </div>
          <Button size="icon-tap" variant="outline" onClick={() => setWeighing((v) => !v)} aria-label="Weigh">
            <Scale />
          </Button>
        </div>
      </div>

      {weighing && (
        <form onSubmit={weigh} className="mt-3 flex items-end gap-2">
          <Field label="Weight (grams)" htmlFor={`w-${puppy.id}`} className="flex-1">
            <Input
              id={`w-${puppy.id}`}
              name="grams"
              type="number"
              inputMode="numeric"
              min={20}
              max={5000}
              required
              autoFocus
              inputSize="tap"
              className="font-mono text-lg"
            />
          </Field>
          <Button type="submit" loading={busy} size="tap">
            Save
          </Button>
        </form>
      )}
    </li>
  );
}

function CareSchedule({
  tasks,
  litterId,
  whelped,
  onDone,
}: {
  tasks: LitterDetailResponse['litter']['careTasks'];
  litterId: string;
  whelped: boolean;
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const now = new Date();

  async function complete(id: string) {
    setBusy(id);
    try {
      await api(`/care-tasks/${id}`, { method: 'PATCH', json: { status: 'DONE' } });
      onDone();
    } finally {
      setBusy(null);
    }
  }

  async function generate() {
    setBusy('gen');
    try {
      await api(`/litters/${litterId}/care-schedule`, { method: 'POST' });
      onDone();
    } finally {
      setBusy(null);
    }
  }

  if (tasks.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5">
          <EmptyState
            icon={<Stethoscope className="h-5 w-5" />}
            title="No schedule yet"
            description={
              whelped
                ? 'Generate the standard protocol — deworming, vaccinations, vet checks and go-home — dated from the whelp date.'
                : 'Record the whelp date and the whole schedule generates from it.'
            }
            action={
              whelped ? (
                <Button size="sm" onClick={generate} loading={busy === 'gen'}>
                  Generate Schedule
                </Button>
              ) : undefined
            }
          />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <ul className="divide-y divide-bone-200">
          {tasks.map((t) => {
            const due = new Date(t.dueOn);
            const overdue = t.status === 'PENDING' && due < now;
            return (
              <li key={t.id} className="flex items-start gap-3 py-3">
                <button
                  type="button"
                  onClick={() => t.status === 'PENDING' && complete(t.id)}
                  disabled={t.status !== 'PENDING' || busy === t.id}
                  className={cn(
                    'mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border-2 transition-colors',
                    t.status === 'DONE'
                      ? 'border-brand-600 bg-brand-600 text-bone-50'
                      : 'border-bone-400 hover:border-brand-500',
                  )}
                  aria-label={t.status === 'DONE' ? 'Completed' : 'Mark complete'}
                >
                  {t.status === 'DONE' && <Check className="h-3 w-3" />}
                </button>
                <div className="min-w-0 flex-1">
                  <p className="flex flex-wrap items-center gap-2">
                    <span
                      className={cn(
                        'text-sm font-medium',
                        t.status === 'DONE' ? 'text-ink-400 line-through' : 'text-ink-800',
                      )}
                    >
                      {t.title}
                    </span>
                    {t.required && t.status === 'PENDING' && (
                      <Badge tone="neutral" size="sm">
                        Required
                      </Badge>
                    )}
                    {overdue && (
                      <Badge tone="warning" size="sm">
                        Overdue
                      </Badge>
                    )}
                  </p>
                  {t.detail && <p className="mt-0.5 text-2xs leading-relaxed text-ink-500">{t.detail}</p>}
                </div>
                <span className="shrink-0 text-right text-2xs text-ink-400">
                  {formatDate(t.dueOn, 'short')}
                  <span className="block">{t.status === 'DONE' ? 'done' : relativeTime(t.dueOn)}</span>
                </span>
              </li>
            );
          })}
        </ul>
        <p className="mt-4 border-t border-bone-200 pt-3 text-2xs leading-relaxed text-ink-400">
          Generated from the standard protocol and dated from the whelp date. It is a starting
          point, not veterinary instruction — products, intervals and legal requirements vary by
          jurisdiction and by vet. Every task is editable.
        </p>
      </CardContent>
    </Card>
  );
}

function WhelpingLog({
  litterId,
  events,
  onDone,
  onError,
}: {
  litterId: string;
  events: LitterDetailResponse['litter']['whelpingEvents'];
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);

  const QUICK: { kind: string; label: string }[] = [
    { kind: 'contraction', label: 'Contraction' },
    { kind: 'placenta', label: 'Placenta' },
    { kind: 'rest', label: 'Resting' },
    { kind: 'vet_called', label: 'Called vet' },
  ];

  async function log(kind: string, note?: string) {
    setBusy(true);
    try {
      await api(`/litters/${litterId}/whelping-events`, { method: 'POST', json: { kind, note } });
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not log that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        {/* One tap per entry. Nobody is typing during a whelping. */}
        <div className="flex flex-wrap gap-2">
          {QUICK.map((q) => (
            <Button key={q.kind} size="tap" variant="outline" disabled={busy} onClick={() => log(q.kind)}>
              {q.label}
            </Button>
          ))}
        </div>

        <form
          className="mt-3 flex items-end gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const note = String(new FormData(form).get('note') || '');
            if (note) log('note', note).then(() => form.reset());
          }}
        >
          <Field label="Note" htmlFor="note" className="flex-1">
            <Textarea id="note" name="note" rows={2} placeholder="Anything worth remembering…" />
          </Field>
          <Button type="submit" disabled={busy} size="tap">
            Add
          </Button>
        </form>

        {events.length === 0 ? (
          <p className="mt-5 text-sm text-ink-500">Nothing logged yet.</p>
        ) : (
          <ul className="mt-5 space-y-2 border-t border-bone-200 pt-4">
            {events.map((e) => (
              <li key={e.id} className="flex items-baseline gap-3 text-sm">
                <span className="w-20 shrink-0 font-mono text-2xs text-ink-400">
                  {new Date(e.occurredAt).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
                </span>
                <span className="min-w-0">
                  <span className="font-medium text-ink-700">{e.kind.replace(/_/g, ' ')}</span>
                  {e.note && <span className="ml-2 text-ink-600">{e.note}</span>}
                </span>
                <span className="ml-auto shrink-0 text-2xs text-ink-300">
                  {formatDateTime(e.occurredAt).split(', ').slice(0, 2).join(', ')}
                </span>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

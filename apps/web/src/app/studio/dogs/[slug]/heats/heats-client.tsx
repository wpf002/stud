'use client';

import { CalendarHeart, Plus, TrendingUp } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, EmptyState, Field, Input, Select, cn, formatDate, relativeTime, titleCase } from '@stud/ui';
import { api, ApiError } from '@/lib/api';
import type { HeatsResponse } from '@/lib/types';

const PHASE_COPY: Record<string, string> = {
  BASELINE: 'Baseline — she has not started rising',
  RISING: 'Rising — keep testing',
  LH_SURGE: 'LH surge — ovulation in about two days',
  OVULATION: 'Ovulating',
  POST_OVULATION: 'Past ovulation — in the breeding window',
  PAST_WINDOW: 'Window has closed',
};

export function HeatsClient({ initial, dogId }: { initial: HeatsResponse; dogId: string }) {
  const router = useRouter();
  const [data, setData] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setData(await api<HeatsResponse>(`/dogs/${dogId}/heats`));
    router.refresh();
  }, [dogId, router]);

  const { cycles, prediction, interpretation } = data;
  const current = cycles[0];

  async function logHeat(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      await api(`/dogs/${dogId}/heats`, {
        method: 'POST',
        json: { startedOn: String(f.get('startedOn')), notes: String(f.get('notes') || '') || undefined },
      });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not log that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        {/* ── Progesterone, for the cycle she is in now ─────────────── */}
        {current && (
          <Card>
            <CardHeader className="flex-row items-center justify-between">
              <CardTitle as="h4" className="text-md">
                <span className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-ink-400" /> Progesterone —{' '}
                  {formatDate(current.startedOn)} cycle
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              {interpretation && (
                <div
                  className={cn(
                    'mb-4 rounded-md px-4 py-3',
                    interpretation.estimatedOvulationDate ? 'bg-brand-50' : 'bg-bone-100',
                  )}
                >
                  <p className="text-sm font-semibold text-ink-800">
                    {PHASE_COPY[interpretation.phase] ?? interpretation.phase}
                  </p>
                  <p className="mt-1 text-xs leading-relaxed text-ink-600">{interpretation.note}</p>

                  {interpretation.estimatedOvulationDate && (
                    <div className="mt-3 grid gap-3 border-t border-bone-300 pt-3 sm:grid-cols-2">
                      <div>
                        <p className="text-2xs uppercase tracking-widest text-ink-400">Ovulation</p>
                        <p className="text-sm text-ink-800">
                          {formatDate(interpretation.estimatedOvulationDate)}
                        </p>
                        <p className="text-2xs text-ink-400">
                          {interpretation.ovulationBasis === 'MEASURED'
                            ? 'measured'
                            : 'derived from LH surge'}
                        </p>
                      </div>
                      <div>
                        <p className="text-2xs uppercase tracking-widest text-ink-400">Breeding Windows</p>
                        <ul className="mt-0.5 space-y-0.5 text-2xs">
                          {(['NATURAL', 'CHILLED', 'FROZEN'] as const).map((t) => {
                            const w = interpretation.breedingWindows[t];
                            if (!w) return null;
                            return (
                              <li key={t} className="flex justify-between gap-2">
                                <span className="text-ink-500">{titleCase(t)}</span>
                                <span className="font-mono text-ink-800">
                                  {formatDate(w.from, 'short')} – {formatDate(w.to, 'short')}
                                </span>
                              </li>
                            );
                          })}
                        </ul>
                      </div>
                    </div>
                  )}

                  {interpretation.retestOn && (
                    <p className="mt-3 border-t border-bone-300 pt-2 text-xs text-ink-600">
                      Test again {formatDate(interpretation.retestOn)} ·{' '}
                      {relativeTime(interpretation.retestOn)}
                    </p>
                  )}
                </div>
              )}

              {current.progesteroneTests.length > 0 && (
                <ul className="mb-4 divide-y divide-bone-200">
                  {current.progesteroneTests.map((t) => (
                    <li key={t.id} className="flex items-baseline justify-between gap-3 py-2 text-sm">
                      <span className="text-ink-600">{formatDate(t.takenOn)}</span>
                      <span className="flex items-baseline gap-2">
                        <span className="font-mono text-md tabular-nums text-ink-900">
                          {t.value} {t.unit === 'NG_ML' ? 'ng/mL' : 'nmol/L'}
                        </span>
                        {t.lab && <span className="text-2xs text-ink-400">{t.lab}</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}

              <ProgesteroneForm heatId={current.id} onDone={refresh} onError={setError} />
            </CardContent>
          </Card>
        )}

        {/* ── History ───────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle as="h4" className="text-md">
              Cycle History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {cycles.length === 0 ? (
              <EmptyState
                icon={<CalendarHeart className="h-5 w-5" />}
                title="No cycles logged"
                description="Log the first day of visible discharge. After two cycles, we can predict her next one from her own pattern."
              />
            ) : (
              <ul className="divide-y divide-bone-200">
                {cycles.map((c, i) => {
                  const next = cycles[i + 1];
                  const interval = next
                    ? Math.round(
                        (new Date(c.startedOn).getTime() - new Date(next.startedOn).getTime()) / 86_400_000,
                      )
                    : null;
                  return (
                    <li key={c.id} className="flex flex-wrap items-baseline justify-between gap-3 py-3">
                      <span>
                        <span className="text-sm font-medium text-ink-800">{formatDate(c.startedOn)}</span>
                        {c.endedOn && (
                          <span className="ml-2 text-2xs text-ink-400">
                            to {formatDate(c.endedOn, 'short')}
                          </span>
                        )}
                        {c.notes && <span className="mt-0.5 block text-2xs text-ink-500">{c.notes}</span>}
                      </span>
                      <span className="flex items-center gap-3 text-2xs text-ink-400">
                        {c.progesteroneTests.length > 0 && (
                          <span>{c.progesteroneTests.length} progesterone tests</span>
                        )}
                        {c.breedings.length > 0 && (
                          <Badge tone="brand" size="sm">
                            Bred
                          </Badge>
                        )}
                        {interval !== null && (
                          <span className="font-mono text-ink-500">{interval}d interval</span>
                        )}
                      </span>
                    </li>
                  );
                })}
              </ul>
            )}

            <form onSubmit={logHeat} className="mt-5 flex flex-wrap items-end gap-3 border-t border-bone-200 pt-4">
              <Field
                label="First Day of the Heat"
                htmlFor="startedOn"
                hint="The first day of visible discharge — the one date that has to be right."
                className="min-w-48"
              >
                <Input
                  id="startedOn"
                  name="startedOn"
                  type="date"
                  required
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </Field>
              <Button type="submit" loading={busy}>
                <Plus /> Log a Heat
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* ── Prediction rail ─────────────────────────────────────────── */}
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-5">
            <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
              Next heat predicted
            </p>
            <p className="mt-1 font-display text-2xl text-ink-900">
              {prediction.predictedStart ? formatDate(prediction.predictedStart) : '—'}
            </p>
            {prediction.windowStart && prediction.windowEnd && (
              <p className="mt-1 font-mono text-xs text-ink-500">
                {formatDate(prediction.windowStart, 'short')} –{' '}
                {formatDate(prediction.windowEnd, 'short')}
              </p>
            )}

            <div className="mt-4 space-y-2 border-t border-bone-200 pt-3 text-xs">
              <Row
                label="Confidence"
                value={titleCase(prediction.confidence)}
                tone={
                  prediction.confidence === 'HIGH'
                    ? 'good'
                    : prediction.confidence === 'NONE'
                      ? 'muted'
                      : 'warn'
                }
              />
              <Row label="Cycles logged" value={String(prediction.cyclesObserved)} />
              {prediction.averageIntervalDays && (
                <Row label="Her average" value={`${prediction.averageIntervalDays} days`} />
              )}
              {prediction.intervalStdDevDays != null && (
                <Row label="Varies by" value={`± ${prediction.intervalStdDevDays} days`} />
              )}
            </div>

            <p className="mt-3 rounded-md bg-bone-100 px-3 py-2 text-2xs leading-relaxed text-ink-600">
              {prediction.note}
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function Row({ label, value, tone }: { label: string; value: string; tone?: 'good' | 'warn' | 'muted' }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <span className="text-ink-500">{label}</span>
      <span
        className={cn(
          'font-mono',
          tone === 'good' ? 'text-brand-700' : tone === 'warn' ? 'text-warning-fg' : 'text-ink-800',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function ProgesteroneForm({
  heatId,
  onDone,
  onError,
}: {
  heatId: string;
  onDone: () => void;
  onError: (m: string) => void;
}) {
  const [busy, setBusy] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    const form = e.currentTarget;
    const f = new FormData(form);
    try {
      await api(`/heats/${heatId}/progesterone`, {
        method: 'POST',
        json: {
          takenOn: String(f.get('takenOn')),
          value: Number(f.get('value')),
          unit: String(f.get('unit')),
          lab: String(f.get('lab') || '') || undefined,
        },
      });
      form.reset();
      onDone();
    } catch (err) {
      onError(err instanceof ApiError ? err.message : 'Could not save that reading.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={submit} className="flex flex-wrap items-end gap-2 border-t border-bone-200 pt-4">
      <Field label="Date" htmlFor="takenOn" className="w-40">
        <Input
          id="takenOn"
          name="takenOn"
          type="date"
          required
          defaultValue={new Date().toISOString().slice(0, 10)}
        />
      </Field>
      <Field label="Value" htmlFor="value" className="w-28">
        <Input
          id="value"
          name="value"
          type="number"
          step="0.1"
          min="0"
          required
          className="font-mono"
          placeholder="2.4"
        />
      </Field>
      <Field label="Unit" htmlFor="unit" className="w-32">
        <Select id="unit" name="unit" defaultValue="NG_ML">
          <option value="NG_ML">ng/mL</option>
          <option value="NMOL_L">nmol/L</option>
        </Select>
      </Field>
      <Field label="Lab" htmlFor="lab" className="w-40">
        <Input id="lab" name="lab" maxLength={120} />
      </Field>
      <Button type="submit" loading={busy}>
        Add Reading
      </Button>
    </form>
  );
}

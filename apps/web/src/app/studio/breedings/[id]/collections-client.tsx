'use client';

import { FlaskConical, Plus, Truck } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Alert, Badge, Button, Card, CardContent, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Field, Input, Select, Textarea, formatDate, titleCase } from '@stud/ui';
import { api, ApiError } from '@/lib/api';
import type { CollectionRecordDto } from '@/lib/types';

/**
 * Collection and shipment records.
 *
 * For an AI breeding this is the chain of custody: who collected, what the
 * evaluation said, how it travelled, what condition it arrived in, and when it
 * was used. When a stud fee is disputed after a miss, this is the evidence —
 * and "the semen was poor on arrival" is a very different argument from "the
 * stud is infertile".
 *
 * Every field is optional except the collection date, because the record is
 * built up over days as each step happens, not filled in at the end.
 */
export function CollectionsClient({
  breedingId,
  collections,
}: {
  breedingId: string;
  collections: CollectionRecordDto[];
}) {
  const router = useRouter();
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const fd = new FormData(e.currentTarget);
    const str = (k: string) => {
      const v = String(fd.get(k) ?? '').trim();
      return v === '' ? undefined : v;
    };
    const num = (k: string) => {
      const v = str(k);
      return v === undefined ? undefined : Number(v);
    };

    try {
      await api(`/breedings/${breedingId}/collections`, {
        method: 'POST',
        json: {
          collectedOn: str('collectedOn'),
          collectedBy: str('collectedBy'),
          clinic: str('clinic'),
          volumeMl: num('volumeMl'),
          concentrationMkml: num('concentrationMkml'),
          motilityPercent: num('motilityPercent'),
          morphologyPercent: num('morphologyPercent'),
          totalMotileMillions: num('totalMotileMillions'),
          shippedOn: str('shippedOn'),
          shippingCarrier: str('shippingCarrier'),
          trackingNumber: str('trackingNumber'),
          receivedOn: str('receivedOn'),
          receivedCondition: str('receivedCondition'),
          inseminatedOn: str('inseminatedOn'),
          inseminatedBy: str('inseminatedBy'),
          method: str('method'),
          notes: str('notes'),
        },
      });
      setOpen(false);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save the record.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="flex items-center justify-between gap-3">
          <h3 className="flex items-center gap-2 font-display text-md text-ink-900">
            <FlaskConical className="h-4 w-4 text-ink-400" /> Collection and Shipment
          </h3>
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button size="xs" variant="secondary">
                <Plus /> Add
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>Collection Record</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit}>
                <DialogBody>
                  {error && <Alert tone="danger">{error}</Alert>}

                  <p className="text-2xs uppercase tracking-widest text-ink-400">Collection</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Collected On" htmlFor="collectedOn" required>
                      <Input id="collectedOn" name="collectedOn" type="date" required />
                    </Field>
                    <Field label="Collected By" htmlFor="collectedBy">
                      <Input id="collectedBy" name="collectedBy" placeholder="Dr. Vance" />
                    </Field>
                    <Field label="Clinic" htmlFor="clinic">
                      <Input id="clinic" name="clinic" />
                    </Field>
                  </div>

                  <p className="text-2xs uppercase tracking-widest text-ink-400">
                    Evaluation — as reported by the collecting vet
                  </p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Volume (ml)" htmlFor="volumeMl">
                      <Input id="volumeMl" name="volumeMl" type="number" step="0.1" min="0" />
                    </Field>
                    <Field label="Concentration (M/ml)" htmlFor="concentrationMkml">
                      <Input id="concentrationMkml" name="concentrationMkml" type="number" step="1" min="0" />
                    </Field>
                    <Field label="Total Motile (M)" htmlFor="totalMotileMillions">
                      <Input id="totalMotileMillions" name="totalMotileMillions" type="number" step="1" min="0" />
                    </Field>
                    <Field label="Motility %" htmlFor="motilityPercent">
                      <Input id="motilityPercent" name="motilityPercent" type="number" min="0" max="100" />
                    </Field>
                    <Field label="Normal Morphology %" htmlFor="morphologyPercent">
                      <Input id="morphologyPercent" name="morphologyPercent" type="number" min="0" max="100" />
                    </Field>
                  </div>

                  <p className="text-2xs uppercase tracking-widest text-ink-400">Shipment</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Shipped On" htmlFor="shippedOn">
                      <Input id="shippedOn" name="shippedOn" type="date" />
                    </Field>
                    <Field label="Carrier" htmlFor="shippingCarrier">
                      <Input id="shippingCarrier" name="shippingCarrier" />
                    </Field>
                    <Field label="Tracking" htmlFor="trackingNumber">
                      <Input id="trackingNumber" name="trackingNumber" />
                    </Field>
                    <Field label="Received On" htmlFor="receivedOn">
                      <Input id="receivedOn" name="receivedOn" type="date" />
                    </Field>
                    <Field
                      label="Condition on Arrival"
                      htmlFor="receivedCondition"
                      className="sm:col-span-2"
                      hint="Write what was observed, not a verdict. This is the sentence that gets quoted in a dispute."
                    >
                      <Input id="receivedCondition" name="receivedCondition" placeholder="Chilled, 4°C, motility 70% on arrival" />
                    </Field>
                  </div>

                  <p className="text-2xs uppercase tracking-widest text-ink-400">Insemination</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Field label="Inseminated On" htmlFor="inseminatedOn">
                      <Input id="inseminatedOn" name="inseminatedOn" type="date" />
                    </Field>
                    <Field label="By" htmlFor="inseminatedBy">
                      <Input id="inseminatedBy" name="inseminatedBy" />
                    </Field>
                    <Field label="Method" htmlFor="method">
                      <Select id="method" name="method" defaultValue="">
                        <option value="">—</option>
                        <option value="VAGINAL">Vaginal</option>
                        <option value="TCI">Transcervical (TCI)</option>
                        <option value="SURGICAL">Surgical</option>
                      </Select>
                    </Field>
                  </div>

                  <Field label="Notes" htmlFor="notes">
                    <Textarea id="notes" name="notes" rows={2} />
                  </Field>
                </DialogBody>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={busy}>
                    Save Record
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>

        {collections.length === 0 ? (
          <p className="mt-2 text-xs leading-relaxed text-ink-500">
            Nothing recorded. For a shipped or AI breeding, log the collection, the evaluation and
            the condition on arrival — if the breeding misses, this is the difference between a
            dispute about the stud and a dispute about the shipping.
          </p>
        ) : (
          <ul className="mt-3 space-y-3">
            {collections.map((c) => (
              <li key={c.id} className="rounded-md border border-bone-300 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-medium text-ink-800">
                    Collected {formatDate(c.collectedOn)}
                    {c.clinic ? ` · ${c.clinic}` : ''}
                  </p>
                  {c.method && (
                    <Badge tone="neutral" size="sm">
                      {titleCase(c.method)}
                    </Badge>
                  )}
                </div>

                {(c.motilityPercent !== null ||
                  c.concentrationMkml !== null ||
                  c.totalMotileMillions !== null) && (
                  <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-2xs text-ink-500">
                    {c.volumeMl !== null && (
                      <div>
                        <dt className="inline uppercase tracking-widest">Volume </dt>
                        <dd className="inline font-mono text-ink-700">{c.volumeMl} ml</dd>
                      </div>
                    )}
                    {c.concentrationMkml !== null && (
                      <div>
                        <dt className="inline uppercase tracking-widest">Conc. </dt>
                        <dd className="inline font-mono text-ink-700">{c.concentrationMkml} M/ml</dd>
                      </div>
                    )}
                    {c.motilityPercent !== null && (
                      <div>
                        <dt className="inline uppercase tracking-widest">Motility </dt>
                        <dd className="inline font-mono text-ink-700">{c.motilityPercent}%</dd>
                      </div>
                    )}
                    {c.morphologyPercent !== null && (
                      <div>
                        <dt className="inline uppercase tracking-widest">Normal Forms </dt>
                        <dd className="inline font-mono text-ink-700">{c.morphologyPercent}%</dd>
                      </div>
                    )}
                    {c.totalMotileMillions !== null && (
                      <div>
                        <dt className="inline uppercase tracking-widest">Total Motile </dt>
                        <dd className="inline font-mono text-ink-700">{c.totalMotileMillions} M</dd>
                      </div>
                    )}
                  </dl>
                )}

                {(c.shippedOn || c.receivedOn) && (
                  <p className="mt-2 flex items-start gap-1.5 text-2xs leading-relaxed text-ink-500">
                    <Truck className="mt-0.5 h-3 w-3 shrink-0" />
                    <span>
                      {c.shippedOn && `Shipped ${formatDate(c.shippedOn)}`}
                      {c.shippingCarrier && ` via ${c.shippingCarrier}`}
                      {c.trackingNumber && ` (${c.trackingNumber})`}
                      {c.receivedOn && ` · received ${formatDate(c.receivedOn)}`}
                      {c.receivedCondition && ` — ${c.receivedCondition}`}
                    </span>
                  </p>
                )}

                {c.inseminatedOn && (
                  <p className="mt-1 text-2xs text-ink-500">
                    Inseminated {formatDate(c.inseminatedOn)}
                    {c.inseminatedBy ? ` by ${c.inseminatedBy}` : ''}
                  </p>
                )}

                {c.notes && <p className="mt-2 text-xs leading-relaxed text-ink-600">{c.notes}</p>}
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

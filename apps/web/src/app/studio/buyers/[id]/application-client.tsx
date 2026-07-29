'use client';

import {
  AlertTriangle,
  Baby,
  Check,
  Clock,
  Dog,
  FileSignature,
  Home,
  Mail,
  MapPin,
  PawPrint,
  Phone,
  Stethoscope,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Checkbox,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Field,
  Input,
  Select,
  Textarea,
  cn,
  formatDate,
  formatDateTime,
  formatMoney,
  relativeTime,
} from '@stud/ui';
import { api, ApiError } from '@/lib/api';
import type { ApplicationDetailResponse, ApplicationStage } from '@/lib/types';

const STAGE_TONE: Record<string, 'brand' | 'neutral' | 'warning' | 'danger'> = {
  SUBMITTED: 'warning',
  IN_REVIEW: 'warning',
  APPROVED: 'brand',
  WAITLISTED: 'neutral',
  DEPOSIT_PAID: 'brand',
  MATCHED: 'brand',
  PAID_IN_FULL: 'brand',
  COMPLETED: 'brand',
  DECLINED: 'danger',
  WITHDRAWN: 'neutral',
};

export function ApplicationClient({ initial }: { initial: ApplicationDetailResponse }) {
  const router = useRouter();
  const [data, setData] = React.useState(initial);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    setData(await api<ApplicationDetailResponse>(`/applications/${initial.application.id}`));
    router.refresh();
  }, [initial.application.id, router]);

  const { application: a, pick, readiness } = data;
  const id = a.id;

  async function act<T>(fn: () => Promise<T>) {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  const setStage = (stage: ApplicationStage, note?: string) =>
    act(() => api(`/applications/${id}/stage`, { method: 'POST', json: { stage, note } }));

  const available = a.litterListing.litter.puppies.filter(
    (p) => p.status === 'AVAILABLE' || p.id === a.matchedPuppyId,
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_21rem]">
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        {/* ── Their own words first ────────────────────────────────── */}
        {a.message && (
          <Card>
            <CardContent className="pt-5">
              <p className="whitespace-pre-line text-md leading-relaxed text-ink-800">{a.message}</p>
            </CardContent>
          </Card>
        )}

        {/* ── The answers ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle as="h4" className="text-md">
              The household
            </CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-x-6 gap-y-3 sm:grid-cols-2">
              <Fact icon={<Home />} label="Home" value={a.homeType} />
              <Fact
                icon={<MapPin />}
                label="Where"
                value={[a.city, a.region].filter(Boolean).join(', ')}
              />
              <Fact icon={<PawPrint />} label="Wants the dog for" value={a.intendedHome} />
              <Fact
                icon={<Clock />}
                label="Alone on a weekday"
                value={a.hoursAloneDaily != null ? `${a.hoursAloneDaily} hours` : null}
              />
              <Fact
                icon={<Baby />}
                label="Children"
                value={a.hasChildren ? (a.childrenAges ? `Yes — ${a.childrenAges}` : 'Yes') : 'None'}
              />
              <Fact
                icon={<Dog />}
                label="Other pets"
                value={a.hasOtherPets ? (a.otherPetsDetail ?? 'Yes') : 'None'}
              />
              <Fact
                icon={<Check />}
                label="Fenced yard"
                value={a.hasFencedYard == null ? null : a.hasFencedYard ? 'Yes' : 'No'}
              />
              <Fact
                icon={<Stethoscope />}
                label="Their vet"
                value={[a.vetName, a.vetPhone].filter(Boolean).join(' · ')}
              />
            </dl>

            {a.previousDogs && (
              <Block label="Dogs they have had">{a.previousDogs}</Block>
            )}
            {a.activityPlans && <Block label="What the dog's life will look like">{a.activityPlans}</Block>}
            {(a.preferredSex || a.preferredColor) && (
              <Block label="What they hope for">
                {[
                  a.preferredSex && a.preferredSex !== 'EITHER'
                    ? `${a.preferredSex.toLowerCase()}`
                    : 'no preference on sex',
                  a.preferredColor,
                ]
                  .filter(Boolean)
                  .join(', ')}
                {/* Preferences, not promises. The breeder matches on temperament. */}
                <span className="mt-1 block text-2xs text-ink-400">
                  A preference, not a promise — you match on temperament.
                </span>
              </Block>
            )}
          </CardContent>
        </Card>

        {/* ── History ──────────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle as="h4" className="text-md">
              History
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-0">
              {a.events.map((e) => (
                <li key={e.id} className="flex gap-3 border-l-2 border-bone-300 py-2 pl-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-sm font-medium text-ink-800">
                      {e.toStage.replace(/_/g, ' ').toLowerCase()}
                      <span className="text-2xs font-normal text-ink-400">
                        {formatDateTime(e.occurredAt)}
                      </span>
                      {e.automatic && (
                        <Badge tone="neutral" size="sm">
                          automatic
                        </Badge>
                      )}
                    </p>
                    {e.note && <p className="mt-0.5 text-xs leading-relaxed text-ink-600">{e.note}</p>}
                  </div>
                </li>
              ))}
            </ul>
            {/* Append-only, and said so. */}
            <p className="mt-3 border-t border-bone-200 pt-2 text-2xs leading-relaxed text-ink-400">
              Every step is kept on record — nothing here can be edited or deleted.
            </p>
          </CardContent>
        </Card>

        {a.pickup && <HandoverCard pickup={a.pickup} />}
      </div>

      {/* ── The rail: what happens next ──────────────────────────────── */}
      <div className="space-y-4">
        <Card>
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Badge tone={STAGE_TONE[a.stage] ?? 'neutral'}>
                {a.stage.replace(/_/g, ' ').toLowerCase()}
              </Badge>
              {pick && (
                <span className="text-2xs text-ink-400">
                  pick {pick.position} of {pick.of}
                </span>
              )}
            </div>

            <p className="mt-3 text-2xs uppercase tracking-widest text-ink-400">Litter</p>
            <Link
              href={`/studio/litters/${a.litterListing.litterId}`}
              className="text-sm text-ink-800 hover:text-brand-600"
            >
              {a.litterListing.litter.dam.callName} × {a.litterListing.litter.sire.callName}
            </Link>

            <div className="mt-3 space-y-1 border-t border-bone-200 pt-3 text-2xs">
              <p className="flex items-center gap-1.5 text-ink-500">
                <Mail className="h-3 w-3" /> {a.email}
              </p>
              {a.phone && (
                <p className="flex items-center gap-1.5 text-ink-500">
                  <Phone className="h-3 w-3" /> {a.phone}
                </p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Actions, in the order the process runs. Only what is next. */}
        <Card className="border-brand-300">
          <CardContent className="space-y-3 pt-5">
            <p className="text-2xs uppercase tracking-widest text-ink-400">What happens next</p>

            {(a.stage === 'SUBMITTED' || a.stage === 'IN_REVIEW') && (
              <>
                <Button block loading={busy} onClick={() => setStage('APPROVED')}>
                  Approve
                </Button>
                <Button
                  block
                  variant="secondary"
                  loading={busy}
                  onClick={() => setStage('WAITLISTED')}
                >
                  Waitlist
                </Button>
                <DeclineDialog onDecline={(reason) => setStage('DECLINED', reason)} busy={busy} />
                <p className="text-2xs leading-relaxed text-ink-400">
                  Deposits can only be taken after you approve the application.
                </p>
              </>
            )}

            {a.stage === 'WAITLISTED' && (
              <Button block loading={busy} onClick={() => setStage('APPROVED')}>
                Move off the waitlist
              </Button>
            )}

            {a.stage === 'APPROVED' && (
              <>
                <Button
                  block
                  loading={busy}
                  onClick={() =>
                    act(() => api(`/applications/${id}/deposit`, { method: 'POST' }))
                  }
                >
                  Take the {a.litterListing.depositCents
                    ? formatMoney(a.litterListing.depositCents, { compact: true })
                    : ''}{' '}
                  deposit
                </Button>
                <Alert tone="info">
                  Payments run in test mode for now — everything is tracked, but no real money
                  moves yet.
                </Alert>
              </>
            )}

            {a.stage === 'DEPOSIT_PAID' && (
              <MatchDialog
                puppies={available}
                isNext={pick?.isNext ?? false}
                busy={busy}
                onMatch={(puppyId) =>
                  act(() => api(`/applications/${id}/match`, { method: 'POST', json: { puppyId } }))
                }
              />
            )}

            {a.stage === 'MATCHED' && !a.contract && (
              <ContractDialog
                priceCents={a.litterListing.priceCentsFrom ?? 0}
                depositCents={a.litterListing.depositCents ?? 0}
                hasAccount={Boolean(a.applicantUserId)}
                busy={busy}
                onCreate={(json) =>
                  act(() => api(`/applications/${id}/contract`, { method: 'POST', json }))
                }
              />
            )}

            {a.contract && (
              <Button block variant="secondary" asChild>
                <Link href={`/studio/contracts/${a.contract.id}`}>
                  <FileSignature /> {a.contract.status === 'SIGNED' ? 'View' : 'Finish'} the contract
                </Link>
              </Button>
            )}

            {a.stage === 'MATCHED' && a.contract?.status === 'SIGNED' && (
              <Button
                block
                loading={busy}
                onClick={() => act(() => api(`/applications/${id}/balance`, { method: 'POST' }))}
              >
                Take the balance
              </Button>
            )}

            {a.stage === 'PAID_IN_FULL' && (
              <HandoverDialog
                readiness={readiness}
                busy={busy}
                microchip={a.matchedPuppy?.microchip ?? ''}
                goHomeFrom={a.litterListing.goHomeFrom}
                onRecord={(json) =>
                  act(() => api(`/applications/${id}/handover`, { method: 'POST', json }))
                }
              />
            )}

            {a.stage === 'COMPLETED' && (
              <Alert tone="success" icon={<Check className="h-4 w-4" />}>
                Home with {a.name}.
              </Alert>
            )}
          </CardContent>
        </Card>

        {/* Readiness is shown from the moment a puppy is matched, not at the
            door — a blocker a breeder learns about on collection day is a
            blocker they cannot do anything about. */}
        {a.matchedPuppyId && a.stage !== 'COMPLETED' && (
          <Card>
            <CardContent className="pt-5">
              <p className="text-2xs uppercase tracking-widest text-ink-400">Before it goes home</p>
              <ul className="mt-2 space-y-1.5">
                {readiness.blockers.map((b) => (
                  <li key={b} className="flex gap-2 text-xs leading-relaxed text-danger-fg">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {b}
                  </li>
                ))}
                {readiness.warnings.map((w) => (
                  <li key={w} className="flex gap-2 text-xs leading-relaxed text-ink-500">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    {w}
                  </li>
                ))}
                {readiness.ready && readiness.warnings.length === 0 && (
                  <li className="flex gap-2 text-xs text-brand-700">
                    <Check className="mt-0.5 h-3.5 w-3.5 shrink-0" /> Everything is in place.
                  </li>
                )}
              </ul>
            </CardContent>
          </Card>
        )}

        {pick && a.stage === 'DEPOSIT_PAID' && (
          <Card>
            <CardContent className="pt-5">
              <p className="text-2xs uppercase tracking-widest text-ink-400">Pick order</p>
              <p className="mt-1 font-display text-2xl text-ink-900">
                #{pick.position}{' '}
                <span className="font-sans text-sm font-normal text-ink-400">of {pick.of}</span>
              </p>
              <p className="mt-1 text-2xs text-ink-500">{pick.reason}</p>
              <PickPositionForm
                id={id}
                current={a.manualPickPosition}
                busy={busy}
                onSet={(position) =>
                  act(() =>
                    api(`/applications/${id}/pick-position`, {
                      method: 'PATCH',
                      json: { position },
                    }),
                  )
                }
              />
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function Fact({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <div>
      <dt className="flex items-center gap-1.5 text-2xs uppercase tracking-widest text-ink-400">
        <span className="[&_svg]:h-3 [&_svg]:w-3">{icon}</span>
        {label}
      </dt>
      <dd className={cn('mt-0.5 text-sm', value ? 'text-ink-800' : 'text-ink-300')}>
        {value || 'Not answered'}
      </dd>
    </div>
  );
}

function Block({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="mt-4 border-t border-bone-200 pt-3">
      <p className="text-2xs uppercase tracking-widest text-ink-400">{label}</p>
      <p className="mt-1 whitespace-pre-line text-sm leading-relaxed text-ink-700">{children}</p>
    </div>
  );
}

function DeclineDialog({
  onDecline,
  busy,
}: {
  onDecline: (reason: string) => void;
  busy: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button block variant="ghost">
          Decline
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Decline this application</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onDecline(String(new FormData(e.currentTarget).get('reason') || ''));
            setOpen(false);
          }}
        >
          <DialogBody>
            <Field
              label="Why"
              htmlFor="reason"
              required
              hint="This stays on the application record."
            >
              <Textarea id="reason" name="reason" rows={4} required />
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Decline
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function MatchDialog({
  puppies,
  isNext,
  busy,
  onMatch,
}: {
  puppies: { id: string; name: string | null; collarColor: string | null; sex: string; status: string }[];
  isNext: boolean;
  busy: boolean;
  onMatch: (puppyId: string) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button block>Match a puppy</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Match a puppy</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            onMatch(String(new FormData(e.currentTarget).get('puppyId') || ''));
            setOpen(false);
          }}
        >
          <DialogBody>
            {/*
              Out of turn is allowed and recorded. A breeder may have a good
              reason — the buyer ahead wanted a female and this is the only
              male. Blocking it would be wrong; doing it silently worse.
            */}
            {!isNext && (
              <Alert tone="warning">
                This buyer isn&rsquo;t next in the pick order. You can still match them, and the
                skip will be noted on the application.
              </Alert>
            )}
            <Field label="Puppy" htmlFor="puppyId" required>
              <Select id="puppyId" name="puppyId" required defaultValue="">
                <option value="" disabled>
                  Choose…
                </option>
                {puppies.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name ?? p.collarColor} — {p.sex.toLowerCase()}
                  </option>
                ))}
              </Select>
            </Field>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy}>
              Match
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function ContractDialog({
  priceCents,
  depositCents,
  hasAccount,
  busy,
  onCreate,
}: {
  priceCents: number;
  depositCents: number;
  hasAccount: boolean;
  busy: boolean;
  onCreate: (json: { priceCents: number; depositCents: number }) => void;
}) {
  const [open, setOpen] = React.useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button block>
          <FileSignature /> Draw up the contract
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Puppy sale agreement</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const cents = (k: string) =>
              Math.round(Number(String(fd.get(k) ?? '0').replace(/[^0-9.]/g, '')) * 100);
            onCreate({ priceCents: cents('price'), depositCents: cents('deposit') });
            setOpen(false);
          }}
        >
          <DialogBody>
            {!hasAccount && (
              <Alert tone="warning">
                This buyer applied without an account. They&rsquo;ll need one to sign the
                contract.
              </Alert>
            )}
            <p className="text-sm leading-relaxed text-ink-600">
              The puppy, both parents, and every verified health result are read from the record.
              You are setting the money; everything else is already known.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Purchase price" htmlFor="price" required>
                <Input id="price" name="price" defaultValue={(priceCents / 100).toFixed(2)} required />
              </Field>
              <Field label="Deposit already paid" htmlFor="deposit" required>
                <Input
                  id="deposit"
                  name="deposit"
                  defaultValue={(depositCents / 100).toFixed(2)}
                  required
                />
              </Field>
            </div>
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={busy} disabled={!hasAccount}>
              Create draft
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function HandoverDialog({
  readiness,
  busy,
  microchip,
  goHomeFrom,
  onRecord,
}: {
  readiness: { ready: boolean; blockers: string[]; warnings: string[] };
  busy: boolean;
  microchip: string;
  goHomeFrom: string | null;
  onRecord: (json: Record<string, unknown>) => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [override, setOverride] = React.useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button block>
          <PawPrint /> Record the handover
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Going home</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const fd = new FormData(e.currentTarget);
            const bool = (k: string) => fd.get(k) === 'on';
            const str = (k: string) => {
              const v = String(fd.get(k) ?? '').trim();
              return v === '' ? undefined : v;
            };
            onRecord({
              collectedOn: str('collectedOn'),
              collectedBy: str('collectedBy'),
              microchipRegistered: bool('microchipRegistered'),
              registrationPapers: bool('registrationPapers'),
              healthCertificate: bool('healthCertificate'),
              vaccinationRecord: bool('vaccinationRecord'),
              wormingRecord: bool('wormingRecord'),
              microchipNumber: str('microchipNumber'),
              foodProvided: str('foodProvided'),
              itemsProvided: str('itemsProvided'),
              notes: str('notes'),
              overrideReason: override ? str('overrideReason') : undefined,
            });
            setOpen(false);
          }}
        >
          <DialogBody>
            {readiness.blockers.length > 0 && (
              <Alert tone="danger" icon={<AlertTriangle className="h-4 w-4" />}>
                <span className="font-semibold">This puppy is not ready to go home.</span>
                <ul className="mt-1.5 space-y-0.5">
                  {readiness.blockers.map((b) => (
                    <li key={b}>{b}</li>
                  ))}
                </ul>
              </Alert>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Collected on" htmlFor="collectedOn" required>
                <Input
                  id="collectedOn"
                  name="collectedOn"
                  type="date"
                  required
                  min={goHomeFrom?.slice(0, 10)}
                  defaultValue={new Date().toISOString().slice(0, 10)}
                />
              </Field>
              <Field label="Collected by" htmlFor="collectedBy">
                <Input id="collectedBy" name="collectedBy" />
              </Field>
            </div>

            {/*
              What physically leaves with the dog. This becomes the owner's
              copy of the record in Phase 8, so it is captured here rather
              than reconstructed later from memory.
            */}
            <p className="text-2xs uppercase tracking-widest text-ink-400">What goes with them</p>
            <div className="space-y-1.5">
              <Checkbox name="microchipRegistered" label="Microchip registered to the new owner" />
              <Checkbox name="registrationPapers" label="Registration paperwork" />
              <Checkbox name="healthCertificate" label="Health certificate from the vet" />
              <Checkbox name="vaccinationRecord" label="Vaccination record" />
              <Checkbox name="wormingRecord" label="Worming record" />
            </div>

            <Field label="Microchip number" htmlFor="microchipNumber">
              <Input id="microchipNumber" name="microchipNumber" defaultValue={microchip} />
            </Field>
            <Field label="Food sent with them" htmlFor="foodProvided">
              <Input id="foodProvided" name="foodProvided" placeholder="Two weeks of what they are on" />
            </Field>
            <Field label="Anything else that went with them" htmlFor="itemsProvided">
              <Textarea id="itemsProvided" name="itemsProvided" rows={2} />
            </Field>
            <Field label="Notes" htmlFor="notes">
              <Textarea id="notes" name="notes" rows={2} />
            </Field>

            {readiness.blockers.length > 0 && (
              <div className="rounded-md bg-warning-bg px-3 py-2.5">
                <Checkbox
                  checked={override}
                  onChange={(e) => setOverride(e.target.checked)}
                  label="Record this anyway"
                />
                {override && (
                  <Field label="Why" htmlFor="overrideReason" required className="mt-2">
                    <Textarea id="overrideReason" name="overrideReason" rows={2} required />
                  </Field>
                )}
                <p className="mt-1.5 text-2xs leading-relaxed text-warning-fg">
                  Your reason will be saved to the application history.
                </p>
              </div>
            )}
          </DialogBody>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="submit"
              loading={busy}
              disabled={readiness.blockers.length > 0 && !override}
            >
              Record
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function PickPositionForm({
  id,
  current,
  busy,
  onSet,
}: {
  id: string;
  current: number | null;
  busy: boolean;
  onSet: (position: number | null) => void;
}) {
  return (
    <form
      className="mt-3 flex items-end gap-2 border-t border-bone-200 pt-3"
      onSubmit={(e) => {
        e.preventDefault();
        const raw = String(new FormData(e.currentTarget).get('position') || '').trim();
        onSet(raw === '' ? null : Number(raw));
      }}
    >
      <Field label="Set position" htmlFor={`pos-${id}`} className="flex-1">
        <Input
          id={`pos-${id}`}
          name="position"
          type="number"
          min={1}
          inputSize="sm"
          defaultValue={current ?? ''}
          placeholder="auto"
        />
      </Field>
      <Button type="submit" size="sm" variant="secondary" loading={busy}>
        Save
      </Button>
    </form>
  );
}

function HandoverCard({ pickup }: { pickup: NonNullable<ApplicationDetailResponse['application']['pickup']> }) {
  const items = [
    ['Microchip registered', pickup.microchipRegistered],
    ['Registration paperwork', pickup.registrationPapers],
    ['Health certificate', pickup.healthCertificate],
    ['Vaccination record', pickup.vaccinationRecord],
    ['Worming record', pickup.wormingRecord],
  ] as const;

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h4" className="text-md">
          <span className="flex items-center gap-2">
            <PawPrint className="h-4 w-4 text-ink-400" /> Went home {formatDate(pickup.collectedOn)}
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {items.map(([label, done]) => (
            <li
              key={label}
              className={cn('flex items-center gap-2 text-sm', done ? 'text-ink-700' : 'text-ink-300')}
            >
              {done ? (
                <Check className="h-3.5 w-3.5 text-brand-600" />
              ) : (
                <span className="h-3.5 w-3.5 rounded-full border border-bone-400" />
              )}
              {label}
            </li>
          ))}
        </ul>

        {pickup.microchipNumber && (
          <p className="mt-3 font-mono text-2xs text-ink-500">chip {pickup.microchipNumber}</p>
        )}
        {pickup.vetExamDueBy && (
          <p className="mt-2 text-xs text-ink-600">
            Their vet check is due by {formatDate(pickup.vetExamDueBy)} — the window the health
            guarantee in the contract sets.
          </p>
        )}
        {pickup.itemsProvided && (
          <p className="mt-2 text-xs leading-relaxed text-ink-600">{pickup.itemsProvided}</p>
        )}
        {pickup.notes && <p className="mt-2 text-xs leading-relaxed text-ink-500">{pickup.notes}</p>}
        <p className="mt-3 border-t border-bone-200 pt-2 text-2xs text-ink-400">
          Recorded {relativeTime(pickup.collectedOn)}.
        </p>
      </CardContent>
    </Card>
  );
}

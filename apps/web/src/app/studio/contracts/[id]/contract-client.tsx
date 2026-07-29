'use client';

import {
  AlertTriangle,
  Check,
  FileSignature,
  Lock,
  PawPrint,
  Scale,
  Send,
  ShieldCheck,
} from 'lucide-react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import { Alert, Badge, Button, Card, CardContent, CardHeader, CardTitle, Checkbox, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger, Field, Input, Textarea, cn, formatDate, formatDateTime, formatMoney, titleCase } from '@stud/ui';
import { api, ApiError } from '@/lib/api';
import type { ContractDetailResponse, PaymentsResponse, RepeatClaimDto } from '@/lib/types';

export function ContractClient({
  initial,
  payments: initialPayments,
}: {
  initial: ContractDetailResponse;
  payments: PaymentsResponse | null;
}) {
  const router = useRouter();
  const [data, setData] = React.useState(initial);
  const [payments, setPayments] = React.useState(initialPayments);
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);

  const refresh = React.useCallback(async () => {
    const [c, p] = await Promise.all([
      api<ContractDetailResponse>(`/contracts/${initial.contract.id}`),
      api<PaymentsResponse>(`/contracts/${initial.contract.id}/payments`).catch(() => null),
    ]);
    setData(c);
    setPayments(p);
    router.refresh();
  }, [initial.contract.id, router]);

  const { contract, rendered, issues, editable, canSign, mySignature, integrityWarning, consentText } = data;
  const errors = issues.filter((i) => i.severity === 'error');
  const warnings = issues.filter((i) => i.severity === 'warning');

  async function send() {
    setBusy(true);
    setError(null);
    try {
      await api(`/contracts/${contract.id}/send`, { method: 'POST' });
      await refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not send.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_21rem]">
      <div className="space-y-4">
        {error && <Alert tone="danger">{error}</Alert>}

        {integrityWarning && (
          <Alert tone="danger" icon={<AlertTriangle className="h-4 w-4" />}>
            <span className="font-semibold">This document no longer matches its signature.</span> The
            stored text and the current clauses have diverged, which should not be possible. Do not
            rely on this contract until an admin has looked at it.
          </Alert>
        )}

        {errors.length > 0 && (
          <Alert tone="danger">
            <span className="font-semibold">
              {errors.length} thing{errors.length === 1 ? '' : 's'} to fix before sending
            </span>
            <ul className="mt-1.5 space-y-0.5">
              {errors.map((i, n) => (
                <li key={n}>{i.message}</li>
              ))}
            </ul>
          </Alert>
        )}

        {warnings.map((w, n) => (
          <Alert key={n} tone="warning">
            {w.message}
          </Alert>
        ))}

        {/* ── The document ────────────────────────────────────────── */}
        <Card>
          <CardHeader className="flex-row items-start justify-between">
            <div>
              <CardTitle>{contract.title}</CardTitle>
              <p className="mt-1 flex items-center gap-2 text-2xs text-ink-400">
                <StatusBadge status={contract.status} />
                {contract.contentHash && (
                  <span className="font-mono" title="Content hash — a signature binds to this">
                    <Lock className="mr-1 inline h-3 w-3" />
                    {contract.contentHash.slice(0, 16)}…
                  </span>
                )}
              </p>
            </div>
          </CardHeader>
          <CardContent>
            {!editable && (
              <p className="mb-4 flex items-center gap-2 rounded-md bg-bone-100 px-3 py-2 text-xs text-ink-600">
                <Lock className="h-3.5 w-3.5 shrink-0" />
                This contract is locked now that it&rsquo;s been sent. To change terms, create
                an amendment that supersedes it.
              </p>
            )}

            <article className="space-y-5">
              {rendered.clauses.map((c, i) => (
                <section key={`${c.clauseId}-${i}`}>
                  <h3 className="font-display text-md text-ink-900">
                    {i + 1}. {c.title}
                  </h3>
                  <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed text-ink-700">
                    {c.body}
                  </p>
                </section>
              ))}
            </article>

            {rendered.healthSchedule.length > 0 && (
              <section className="mt-6 border-t border-bone-300 pt-5">
                <h3 className="font-display text-md text-ink-900">
                  Schedule — health testing on record
                </h3>
                <ul className="mt-2 divide-y divide-bone-200 text-sm">
                  {rendered.healthSchedule.map((h, i) => (
                    <li key={i} className="flex flex-wrap items-baseline justify-between gap-2 py-2">
                      <span className="text-ink-700">
                        <span className="text-2xs uppercase tracking-widest text-ink-400">
                          {h.animal === 'SIRE' ? 'Sire' : 'Dam'}
                        </span>{' '}
                        {h.claimLabel} — {h.result}
                      </span>
                      {/* Invariant 5, all the way into the contract. */}
                      <Badge tone={h.tier === 'VERIFIED' ? 'brand' : 'neutral'} size="sm">
                        {h.tier === 'VERIFIED' ? `verified · ${h.source}` : 'reported, not verified'}
                      </Badge>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </CardContent>
        </Card>

        {/* ── Signatures ──────────────────────────────────────────── */}
        <Card>
          <CardHeader>
            <CardTitle as="h4" className="text-md">
              <span className="flex items-center gap-2">
                <FileSignature className="h-4 w-4 text-ink-400" /> Signatures
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-bone-200">
              {contract.parties.map((p) => {
                const sig = contract.signatures.find((s) => s.userId === p.userId);
                return (
                  <li key={p.id} className="flex flex-wrap items-start justify-between gap-3 py-3">
                    <div>
                      <p className="text-sm font-medium text-ink-800">{p.legalName}</p>
                      <p className="text-2xs text-ink-400">
                        {titleCase(p.role)} · {p.email}
                      </p>
                      {sig && (
                        <p className="mt-1 font-mono text-2xs text-ink-400">
                          signed &ldquo;{sig.typedName}&rdquo; · {formatDateTime(sig.signedAt)}
                          {sig.ipAddress ? ` · ${sig.ipAddress}` : ''}
                        </p>
                      )}
                    </div>
                    {sig ? (
                      <Badge tone="brand" size="sm">
                        <Check /> Signed
                      </Badge>
                    ) : (
                      <Badge tone="neutral" size="sm">
                        Awaiting
                      </Badge>
                    )}
                  </li>
                );
              })}
            </ul>

            <p className="mt-4 border-t border-bone-200 pt-3 text-2xs leading-relaxed text-ink-400">
              Each signature is tied to the signer&rsquo;s account, the consent text they
              agreed to, and a fingerprint of the document at the moment of signing. Any later
              edit would break that fingerprint. This is an electronic signature record, not
              legal advice.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Rail ───────────────────────────────────────────────────── */}
      <div className="space-y-4">
        {editable && (
          <Card>
            <CardContent className="pt-5">
              <Button block onClick={send} loading={busy} disabled={errors.length > 0}>
                <Send /> {contract.status === 'DRAFT' ? 'Freeze and send' : 'Re-send'}
              </Button>
              <p className="mt-2 text-2xs leading-relaxed text-ink-400">
                Sending renders the document, hashes it, and locks the clauses. Both parties then
                sign the same frozen text.
              </p>
            </CardContent>
          </Card>
        )}

        {canSign && (
          <SignCard
            contract={contract}
            hash={rendered.contentHash}
            consentText={consentText}
            onSigned={refresh}
          />
        )}

        {mySignature && (
          <Alert tone="success" icon={<Check className="h-4 w-4" />}>
            You signed this on {formatDateTime(mySignature.signedAt)}.
          </Alert>
        )}

        {payments?.schedule && <PaymentsCard payments={payments} contractId={contract.id} onDone={refresh} />}

        {contract.breeding && <BreedingLink breeding={contract.breeding} />}

        {contract.status === 'SIGNED' || contract.status === 'COMPLETED' ? (
          <RepeatClaimCard
            contractId={contract.id}
            claims={contract.repeatClaims}
            grantsRepeat={rendered.clauses.some((c) => c.clauseId === 'remedy.repeat_breeding')}
            onChanged={refresh}
          />
        ) : null}
      </div>
    </div>
  );
}

/** The last link in the chain — contract to breeding to litter. */
function BreedingLink({
  breeding,
}: {
  breeding: NonNullable<ContractDetailResponse['contract']['breeding']>;
}) {
  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-2xs uppercase tracking-widest text-ink-400">Linked Breeding</p>
        <Link
          href={`/studio/breedings/${breeding.id}`}
          className="mt-1 block font-display text-lg text-ink-900 hover:text-brand-600"
        >
          {titleCase(breeding.status)}
        </Link>
        {breeding.litter ? (
          <Link
            href={`/studio/litters/${breeding.litter.id}`}
            className="mt-2 flex items-center gap-1.5 text-sm text-brand-600 hover:underline"
          >
            <PawPrint className="h-3.5 w-3.5" />
            {breeding.litter.liveBorn ?? 0} live born
            {breeding.litter.whelpedOn ? ` · whelped ${formatDate(breeding.litter.whelpedOn)}` : ''}
          </Link>
        ) : (
          <p className="mt-2 text-xs text-ink-400">No litter recorded against this breeding yet.</p>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Repeat-breeding claims.
 *
 * The right exists only if a clause grants it — the API checks
 * `effects.grantsRepeatBreeding` and refuses otherwise. The UI says the same
 * thing up front rather than letting someone write out a claim and be told no.
 */
function RepeatClaimCard({
  contractId,
  claims,
  grantsRepeat,
  onChanged,
}: {
  contractId: string;
  claims: RepeatClaimDto[];
  grantsRepeat: boolean;
  onChanged: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [vetConfirmed, setVetConfirmed] = React.useState(false);

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const reason = String(new FormData(e.currentTarget).get('reason') || '');
    try {
      await api(`/contracts/${contractId}/repeat-claims`, {
        method: 'POST',
        json: { reason, vetConfirmed },
      });
      setOpen(false);
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit the claim.');
    } finally {
      setBusy(false);
    }
  }

  async function review(id: string, status: 'APPROVED' | 'DECLINED') {
    setBusy(true);
    try {
      await api(`/repeat-claims/${id}`, { method: 'PATCH', json: { status } });
      onChanged();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update the claim.');
    } finally {
      setBusy(false);
    }
  }

  if (!grantsRepeat && claims.length === 0) {
    return (
      <Card>
        <CardContent className="pt-5">
          <p className="text-2xs uppercase tracking-widest text-ink-400">Repeat Breeding</p>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-500">
            This contract has no repeat-breeding clause, so there is no right to claim under it. A
            repeat can still be agreed between the parties — it just is not something this agreement
            entitles anyone to.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-2xs uppercase tracking-widest text-ink-400">Repeat Breeding</p>

        {error && (
          <Alert tone="danger" className="mt-2">
            {error}
          </Alert>
        )}

        {claims.length > 0 && (
          <ul className="mt-2 space-y-2">
            {claims.map((c) => (
              <li key={c.id} className="rounded-md bg-bone-100 px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <Badge
                    tone={
                      c.status === 'APPROVED' || c.status === 'FULFILLED'
                        ? 'brand'
                        : c.status === 'DECLINED'
                          ? 'danger'
                          : 'warning'
                    }
                    size="sm"
                  >
                    {titleCase(c.status)}
                  </Badge>
                  <span className="text-2xs text-ink-400">{formatDate(c.createdAt)}</span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-600">{c.reason}</p>
                <p className="mt-1 text-2xs text-ink-400">
                  {c.vetConfirmed ? 'Veterinary confirmation provided' : 'No veterinary confirmation'}
                </p>
                {(c.status === 'SUBMITTED' || c.status === 'UNDER_REVIEW') && (
                  <div className="mt-2 flex gap-2">
                    <Button size="xs" disabled={busy} onClick={() => review(c.id, 'APPROVED')}>
                      Approve
                    </Button>
                    <Button
                      size="xs"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => review(c.id, 'DECLINED')}
                    >
                      Decline
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}

        {grantsRepeat && (
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="secondary" size="sm" block className="mt-3">
                Claim a Repeat Service
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Claim a Repeat Service</DialogTitle>
              </DialogHeader>
              <form onSubmit={submit}>
                <DialogBody>
                  <Field
                    label="What Happened"
                    htmlFor="reason"
                    required
                    hint="Dates, what was observed, and any veterinary findings. This is the record the other party responds to."
                  >
                    <Textarea id="reason" name="reason" rows={5} required minLength={10} />
                  </Field>
                  <Checkbox
                    checked={vetConfirmed}
                    onChange={(e) => setVetConfirmed(e.target.checked)}
                    label="A vet has confirmed the failure to conceive or the loss of the litter."
                  />
                </DialogBody>
                <DialogFooter>
                  <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" loading={busy}>
                    Submit Claim
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        )}
      </CardContent>
    </Card>
  );
}

function StatusBadge({ status }: { status: string }) {
  const tone =
    status === 'SIGNED' || status === 'COMPLETED'
      ? 'brand'
      : status === 'VOIDED'
        ? 'danger'
        : status === 'PARTIALLY_SIGNED'
          ? 'warning'
          : 'neutral';
  return (
    <Badge tone={tone as 'brand'} size="sm">
      {titleCase(status)}
    </Badge>
  );
}

/**
 * Signing.
 *
 * Deliberately not one click. The signer must read the consent language, tick
 * it, and type their name — the three things that make the record worth
 * anything if it is ever questioned.
 */
function SignCard({
  contract,
  hash,
  consentText,
  onSigned,
}: {
  contract: ContractDetailResponse['contract'];
  hash: string;
  consentText: string;
  onSigned: () => void;
}) {
  const [open, setOpen] = React.useState(false);
  const [affirmed, setAffirmed] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function sign(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const typedName = String(new FormData(e.currentTarget).get('typedName') || '');
    try {
      await api(`/contracts/${contract.id}/sign`, {
        method: 'POST',
        // The hash we showed them travels with the signature, so a document
        // that changed mid-read is refused rather than silently signed.
        json: { typedName, affirmed, hashShownToSigner: hash },
      });
      setOpen(false);
      onSigned();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not sign.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="border-brand-300">
      <CardContent className="pt-5">
        <p className="font-display text-lg text-ink-900">Your Signature Is Needed</p>
        <p className="mt-1 text-xs leading-relaxed text-ink-600">
          Read the whole agreement first. Once both parties sign, the terms are fixed and the
          deposit falls due.
        </p>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button block className="mt-3">
              <FileSignature /> Review and Sign
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sign {contract.title}</DialogTitle>
            </DialogHeader>
            <form onSubmit={sign}>
              <DialogBody>
                {error && <Alert tone="danger">{error}</Alert>}

                <p className="rounded-md bg-bone-100 px-3 py-3 text-sm leading-relaxed text-ink-700">
                  {consentText}
                </p>

                <Checkbox
                  checked={affirmed}
                  onChange={(e) => setAffirmed(e.target.checked)}
                  label="I have read the agreement and I agree to the statement above."
                />

                <Field
                  label="Type Your Full Name"
                  htmlFor="typedName"
                  required
                  hint="Must match the name on your account."
                >
                  <Input id="typedName" name="typedName" required autoComplete="off" inputSize="tap" />
                </Field>

                <p className="font-mono text-2xs text-ink-400">
                  Signing document {hash.slice(0, 24)}…
                </p>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={busy} disabled={!affirmed}>
                  Sign
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

function PaymentsCard({
  payments,
  contractId,
  onDone,
}: {
  payments: PaymentsResponse;
  contractId: string;
  onDone: () => void;
}) {
  const [busy, setBusy] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const { schedule, assessment } = payments;
  if (!schedule) return null;

  async function pay(key: string) {
    setBusy(key);
    setError(null);
    try {
      await api(`/contracts/${contractId}/pay/${key}`, { method: 'POST' });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Payment failed.');
    } finally {
      setBusy(null);
    }
  }

  async function settle() {
    setBusy('settle');
    setError(null);
    try {
      await api(`/contracts/${contractId}/escrow/settle`, { method: 'POST' });
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not settle.');
    } finally {
      setBusy(null);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle as="h4" className="text-md">
          <span className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-ink-400" /> Stud Fee
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        {/* The diligence gate, stated where the money would move. */}
        {!payments.provider?.isLive && (
          <Alert tone="info" className="mb-3">
            Payments run in test mode for now — schedules, escrow, and records all work, but no
            real money moves yet.
          </Alert>
        )}

        {error && <Alert tone="danger" className="mb-3">{error}</Alert>}

        <p className="font-display text-2xl text-ink-900">{formatMoney(schedule.totalCents)}</p>

        <ul className="mt-3 divide-y divide-bone-200">
          {schedule.instalments.map((i) => (
            <li key={i.id} className="flex items-center justify-between gap-3 py-2.5">
              <div className="min-w-0">
                <p className="text-sm font-medium text-ink-800">{i.label}</p>
                <p className="text-2xs text-ink-400">
                  {i.status === 'PAID'
                    ? `paid ${i.paidAt ? formatDateTime(i.paidAt) : ''}`
                    : i.status === 'DUE'
                      ? 'due now'
                      : `On ${titleCase(i.trigger.replace(/^ON_/, ''))}`}
                </p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <span className={cn('font-mono text-sm tabular-nums', i.status === 'PAID' ? 'text-ink-400' : 'text-ink-800')}>
                  {formatMoney(i.amountCents)}
                </span>
                {i.status === 'DUE' && (
                  <Button size="xs" loading={busy === i.key} onClick={() => pay(i.key)}>
                    Pay
                  </Button>
                )}
                {i.status === 'PAID' && <Check className="h-4 w-4 text-brand-600" />}
              </div>
            </li>
          ))}
        </ul>

        {schedule.escrow && schedule.escrow.heldCents > 0 && (
          <div className="mt-4 rounded-md bg-bone-100 px-3 py-3">
            <p className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-1.5 text-ink-600">
                <ShieldCheck className="h-3.5 w-3.5" /> Held in Escrow
              </span>
              <span className="font-mono tabular-nums text-ink-900">
                {formatMoney(schedule.escrow.heldCents)}
              </span>
            </p>
            {assessment && (
              <>
                <p className="mt-2 text-2xs leading-relaxed text-ink-500">{assessment.reason}</p>
                {assessment.requiresHuman ? (
                  <p className="mt-2 rounded-md bg-warning-bg px-2 py-1.5 text-2xs text-warning-fg">
                    This needs a decision from the parties or an admin.
                  </p>
                ) : assessment.decision !== 'HOLD' ? (
                  <Button size="sm" block className="mt-3" loading={busy === 'settle'} onClick={settle}>
                    {assessment.decision === 'RELEASE'
                      ? `Release ${formatMoney(assessment.releasableCents)}`
                      : `Refund ${formatMoney(assessment.refundableCents)}`}
                  </Button>
                ) : null}
              </>
            )}
          </div>
        )}

        {payments.ledger.length > 0 && (
          <details className="mt-4 border-t border-bone-200 pt-3">
            <summary className="cursor-pointer text-2xs uppercase tracking-widest text-ink-400">
              Ledger ({payments.ledger.length} entries)
            </summary>
            <ul className="mt-2 space-y-1 font-mono text-2xs">
              {payments.ledger.map((l) => (
                <li key={l.id} className="flex justify-between gap-2 text-ink-500">
                  <span className="truncate">
                    {l.accountKind}
                    {l.accountOwnerId ? `:${l.accountOwnerId.slice(0, 6)}` : ''} · {l.reason}
                  </span>
                  <span className={l.amountCents < 0 ? 'text-danger-fg' : 'text-brand-700'}>
                    {l.amountCents < 0 ? '' : '+'}
                    {formatMoney(l.amountCents)}
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-2xs leading-relaxed text-ink-400">
              Every entry is permanent. Corrections are added as new entries, so the full
              payment history is always available.
            </p>
          </details>
        )}
      </CardContent>
    </Card>
  );
}

'use client';

import { AlertTriangle, Check, Plus, RefreshCw, ShieldCheck, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  ClaimPanel,
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
  VerificationDensity,
  formatDateTime,
} from '@stud/ui';
import { expectedClaims } from '@stud/verify';
import { api, ApiError } from '@/lib/api';
import type { VerificationResponse } from '@/lib/types';

/** Claims we expect on a well-tested sporting dog, so absence is visible. */

const REPORTABLE = [
  { value: 'HIP', label: 'Hips' },
  { value: 'ELBOW', label: 'Elbows' },
  { value: 'EYE_CAER', label: 'Eyes (CAER)' },
  { value: 'CARDIAC', label: 'Cardiac' },
  { value: 'THYROID', label: 'Thyroid' },
  { value: 'PATELLA', label: 'Patellas' },
  { value: 'DNA_MARKER', label: 'Genetic Marker' },
  { value: 'TITLE_CONFORMATION', label: 'Conformation title' },
  { value: 'TITLE_FIELD', label: 'Field Trial Title' },
  { value: 'TITLE_HUNT_TEST', label: 'Hunt Test Title' },
];

export function VerifyClient({
  initial,
  dogId,
  breed,
}: {
  initial: VerificationResponse;
  dogId: string;
  /** Drives which tests show as expected — they differ by breed. */
  breed: string;
}) {
  const router = useRouter();
  const [data, setData] = React.useState(initial);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [lastRun, setLastRun] = React.useState<{ durationMs: number; checks: number } | null>(null);

  async function refresh() {
    setData(await api<VerificationResponse>(`/dogs/${dogId}/verification`));
  }

  async function runVerification() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ outcome: { durationMs: number; checks: unknown[] } }>(`/dogs/${dogId}/verify`,
        { method: 'POST', json: {} },
      );
      setLastRun({ durationMs: result.outcome.durationMs, checks: result.outcome.checks.length });
      await refresh();
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Verification failed.');
    } finally {
      setBusy(false);
    }
  }

  const hasRegistration = data.dog.registrations.length > 0;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-brand-600" /> Claims
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent>
            {error && (
              <Alert tone="danger" className="mb-4">
                {error}
              </Alert>
            )}

            {!hasRegistration && (
              <Alert tone="warning" icon={<AlertTriangle className="h-4 w-4" />} className="mb-4">
                No registration number on file. Verification keys on the registration number —
                without one, nothing about this dog can move past &ldquo;Reported&rdquo;.
              </Alert>
            )}

            <ClaimPanel
              verified={data.verified}
              reported={data.reported}
              expected={expectedClaims(breed)}
            />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle as="h4" className="text-md">
              Lookup History
            </CardTitle>
          </CardHeader>
          <CardContent>
            {data.recentChecks.length === 0 ? (
              <p className="text-sm text-ink-500">Nothing has been checked yet.</p>
            ) : (
              <ul className="divide-y divide-bone-200 text-sm">
                {data.recentChecks.slice(0, 12).map((c) => (
                  <li key={c.id} className="flex items-center justify-between gap-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <StatusDot status={c.status} />
                      <span className="font-medium text-ink-700">{c.source}</span>
                      <span className="truncate font-mono text-2xs text-ink-400">{c.identifier}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-3 text-2xs text-ink-400">
                      <span>{describeStatus(c.status, c.findingCount)}</span>
                      <span className="font-mono">{c.durationMs}ms</span>
                      <span>{formatDateTime(c.createdAt)}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="mt-3 border-t border-bone-200 pt-3 text-2xs leading-relaxed text-ink-400">
              Every lookup is recorded, including the ones that came back empty or could not reach
              the source. A check that found nothing is evidence too — it is the difference between
              &ldquo;we asked and there is nothing&rdquo; and &ldquo;nobody ever asked&rdquo;.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* ── Rail ─────────────────────────────────────────────────────── */}
      <div className="space-y-4">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <Button block loading={busy} onClick={runVerification} disabled={!hasRegistration}>
              <RefreshCw /> Run Verification
            </Button>
            {lastRun && (
              <p className="text-2xs text-ink-500">
                {lastRun.checks} sources queried in {lastRun.durationMs}ms.
              </p>
            )}
            <p className="text-2xs leading-relaxed text-ink-400">
              Queries every source that can speak to this dog&rsquo;s registration numbers. Results
              are recorded verbatim with the source and the timestamp.
            </p>
          </CardContent>
        </Card>

        <VerificationDensity summary={data.summary} />

        <ReportClaimCard dogId={dogId} onDone={refresh} />
      </div>
    </div>
  );
}

function StatusDot({ status }: { status: string }) {
  const tone =
    status === 'FOUND'
      ? 'bg-brand-600'
      : status === 'NOT_FOUND'
        ? 'bg-ink-300'
        : status === 'DISABLED'
          ? 'bg-bone-500'
          : 'bg-warning';
  return <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${tone}`} />;
}

function describeStatus(status: string, count: number): string {
  switch (status) {
    case 'FOUND':
      return `${count} finding${count === 1 ? '' : 's'}`;
    case 'NOT_FOUND':
      return 'no record';
    case 'DISABLED':
      return 'source off';
    case 'UNSUPPORTED_IDENTIFIER':
      return 'wrong registry';
    default:
      return 'unreachable';
  }
}

/**
 * Adding a reported claim.
 *
 * The copy here does real work: an owner about to type "hips are fine" needs
 * to understand up front that it will never read as verified, so they submit
 * the registration number instead.
 */
function ReportClaimCard({ dogId, onDone }: { dogId: string; onDone: () => void }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [claimType, setClaimType] = React.useState('HIP');

  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const f = new FormData(e.currentTarget);
    try {
      await api(`/dogs/${dogId}/reported-claims`, {
        method: 'POST',
        json: {
          claimType,
          markerName: String(f.get('markerName') || '') || undefined,
          statedResult: String(f.get('statedResult')),
          statedTestedAt: String(f.get('statedTestedAt') || '') || undefined,
          note: String(f.get('note') || '') || undefined,
        },
      });
      setOpen(false);
      onDone();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not save that.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardContent className="pt-5">
        <p className="text-2xs font-semibold uppercase tracking-widest text-ink-400">
          Owner-reported
        </p>
        <p className="mt-2 text-xs leading-relaxed text-ink-500">
          Something true that no source publishes? Record it here. It is stored separately, shown as
          &ldquo;Reported&rdquo;, and can never become verified — only a source lookup does that.
        </p>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogTrigger asChild>
            <Button variant="outline" size="sm" block className="mt-3">
              <Plus /> Add a Reported Claim
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add a Reported Claim</DialogTitle>
            </DialogHeader>
            <form onSubmit={submit}>
              <DialogBody>
                {error && <Alert tone="danger">{error}</Alert>}
                <Alert tone="info">
                  This will display as <strong>Reported</strong>, visually distinct from anything
                  verified. If the result is on OFA or a registry, add the registration number and
                  run a verification instead — it carries far more weight.
                </Alert>

                <Field label="What Is Being Claimed" htmlFor="claimType" required>
                  <Select id="claimType" value={claimType} onChange={(e) => setClaimType(e.target.value)}>
                    {REPORTABLE.map((r) => (
                      <option key={r.value} value={r.value}>
                        {r.label}
                      </option>
                    ))}
                  </Select>
                </Field>

                {claimType === 'DNA_MARKER' && (
                  <Field label="Marker Name" htmlFor="markerName" required>
                    <Input id="markerName" name="markerName" placeholder="prcd-PRA" maxLength={120} />
                  </Field>
                )}

                <Field label="Result, in Your Words" htmlFor="statedResult" required>
                  <Input id="statedResult" name="statedResult" required maxLength={200} />
                </Field>

                <Field label="Test Date" htmlFor="statedTestedAt">
                  <Input id="statedTestedAt" name="statedTestedAt" type="date" />
                </Field>

                <Field label="Note" htmlFor="note">
                  <Textarea id="note" name="note" rows={2} maxLength={2000} />
                </Field>
              </DialogBody>
              <DialogFooter>
                <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" loading={busy}>
                  Save as Reported
                </Button>
              </DialogFooter>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}

/** Admin conflict queue. */
export function ConflictQueue({ initial }: { initial: ConflictClaim[] }) {
  const router = useRouter();
  const [claims, setClaims] = React.useState(initial);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  async function resolve(id: string, action: 'ACCEPT_SOURCE' | 'KEEP_RECORD' | 'REVOKE') {
    setBusyId(id);
    setError(null);
    try {
      await api(`/verification/conflicts/${id}/resolve`, { method: 'POST', json: { action } });
      setClaims((prev) => prev.filter((c) => c.id !== id));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not resolve that.');
    } finally {
      setBusyId(null);
    }
  }

  if (claims.length === 0) {
    return (
      <div className="rounded-card border border-dashed border-bone-400 bg-bone-100/60 px-6 py-14 text-center">
        <Check className="mx-auto h-6 w-6 text-brand-600" />
        <p className="mt-3 font-display text-lg text-ink-800">No Conflicts Open</p>
        <p className="mt-1 text-sm text-ink-500">
          Every verified claim currently agrees with its source.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {error && <Alert tone="danger">{error}</Alert>}
      {claims.map((claim) => (
        <Card key={claim.id}>
          <CardContent className="pt-5">
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="font-display text-lg text-ink-900">
                {claim.dog.callName}
                <span className="ml-2 text-sm font-normal text-ink-500">
                  {claim.dog.registeredName}
                </span>
              </p>
              <span className="font-mono text-2xs text-ink-400">
                {claim.source} · {claim.matchedIdentifier}
              </span>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border-2 border-bone-400 bg-bone-100 p-3">
                <p className="text-2xs uppercase tracking-widest text-ink-400">What We Recorded</p>
                <p className="mt-1 font-mono text-lg text-ink-900">{claim.rawResult ?? '—'}</p>
                <p className="mt-1 text-2xs text-ink-400">
                  {claim.claimType}
                  {claim.markerName ? ` · ${claim.markerName}` : ''}
                </p>
              </div>
              <div className="rounded-md border-2 border-danger/30 bg-danger-bg p-3">
                <p className="text-2xs uppercase tracking-widest text-danger-fg/70">
                  What the source says now
                </p>
                <p className="mt-1 font-mono text-lg text-danger-fg">
                  {claim.conflictRawResult ?? '—'}
                </p>
                <p className="mt-1 text-2xs text-danger-fg/70">
                  detected {formatDateTime(claim.conflictedAt)}
                </p>
              </div>
            </div>

            {claim.conflictNote && (
              <p className="mt-3 rounded-md bg-bone-100 px-3 py-2 text-xs leading-relaxed text-ink-600">
                {claim.conflictNote}
              </p>
            )}

            <div className="mt-4 flex flex-wrap gap-2 border-t border-bone-200 pt-4">
              <Button size="sm" loading={busyId === claim.id} onClick={() => resolve(claim.id, 'ACCEPT_SOURCE')}>
                Accept the Source
              </Button>
              <Button size="sm" variant="outline" disabled={busyId === claim.id} onClick={() => resolve(claim.id, 'KEEP_RECORD')}>
                Keep What We Recorded
              </Button>
              <Button size="sm" variant="ghost" disabled={busyId === claim.id} onClick={() => resolve(claim.id, 'REVOKE')}>
                <X /> Revoke the Claim
              </Button>
            </div>
            <p className="mt-2 text-2xs leading-relaxed text-ink-400">
              Whichever you choose is written to the claim&rsquo;s permanent history with your name
              on it. Revoking returns the claim to unverified — it does not delete the evidence.
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}

export interface ConflictClaim {
  id: string;
  claimType: string;
  markerName: string | null;
  source: string;
  rawResult: string | null;
  conflictRawResult: string | null;
  conflictNote: string | null;
  conflictedAt: string | null;
  matchedIdentifier: string | null;
  dog: { id: string; slug: string; callName: string; registeredName: string | null };
}

'use client';

import { AlertTriangle, ArrowLeftRight, Check, RefreshCw, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import * as React from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  EmptyState,
  formatDate,
} from '@stud/ui';
import { api, ApiError } from '@/lib/api';
import type { MergeCandidate, MergeCandidateDog } from '@/lib/types';

/**
 * The merge queue.
 *
 * Merging is destructive-feeling and effectively irreversible from the user's
 * side, so the UI's job is to make the *consequences* legible before the
 * click: which record survives, how many descendants get re-pointed, and what
 * evidence argues against the merge.
 */
export function DuplicatesClient({ initial }: { initial: MergeCandidate[] }) {
  const router = useRouter();
  const [candidates, setCandidates] = React.useState(initial);
  const [busyId, setBusyId] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);
  const [scanning, setScanning] = React.useState(false);
  const [scanResult, setScanResult] = React.useState<string | null>(null);

  async function scan() {
    setScanning(true);
    setError(null);
    try {
      const r = await api<{ scanned: number; found: number }>('/dogs/duplicates/scan', {
        method: 'POST',
        json: {},
      });
      setScanResult(`Scanned ${r.scanned} records, found ${r.found} possible duplicate pairs.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Scan failed.');
    } finally {
      setScanning(false);
    }
  }

  async function merge(candidate: MergeCandidate, keep: MergeCandidateDog, drop: MergeCandidateDog) {
    setBusyId(candidate.id);
    setError(null);
    try {
      await api('/dogs/merge', {
        method: 'POST',
        json: { keepDogId: keep.id, mergeDogId: drop.id, candidateId: candidate.id },
      });
      setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Merge failed.');
    } finally {
      setBusyId(null);
    }
  }

  async function dismiss(candidate: MergeCandidate) {
    setBusyId(candidate.id);
    try {
      await api(`/dogs/duplicates/${candidate.id}/dismiss`, { method: 'POST' });
      setCandidates((prev) => prev.filter((c) => c.id !== candidate.id));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not dismiss.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="max-w-2xl text-sm leading-relaxed text-ink-600">
          A duplicated ancestor reads as two unrelated dogs, which{' '}
          <span className="font-medium text-ink-800">lowers</span> every COI it appears in. The
          failure is invisible unless something goes looking — this is that something.
        </p>
        <Button variant="outline" size="sm" onClick={scan} loading={scanning}>
          <RefreshCw /> Rescan
        </Button>
      </div>

      {scanResult && <Alert tone="info">{scanResult}</Alert>}
      {error && <Alert tone="danger">{error}</Alert>}

      {candidates.length === 0 ? (
        <EmptyState
          icon={<Check className="h-5 w-5" />}
          title="No open duplicates"
          description="Nothing in your ancestry graph looks like the same dog entered twice. Rescan after any import."
          action={
            <Button size="sm" variant="outline" onClick={scan} loading={scanning}>
              Rescan Now
            </Button>
          }
        />
      ) : (
        candidates.map((c) => (
          <CandidateCard
            key={c.id}
            candidate={c}
            busy={busyId === c.id}
            onMerge={merge}
            onDismiss={dismiss}
          />
        ))
      )}
    </div>
  );
}

function CandidateCard({
  candidate,
  busy,
  onMerge,
  onDismiss,
}: {
  candidate: MergeCandidate;
  busy: boolean;
  onMerge: (c: MergeCandidate, keep: MergeCandidateDog, drop: MergeCandidateDog) => void;
  onDismiss: (c: MergeCandidate) => void;
}) {
  const offspring = (d: MergeCandidateDog) => d._count.sireOffspring + d._count.damOffspring;

  // Default the survivor to the better-connected, better-identified record.
  const [keepId, setKeepId] = React.useState(() => {
    const a = candidate.dogA;
    const b = candidate.dogB;
    const scoreOf = (d: MergeCandidateDog) =>
      offspring(d) * 10 + d.registrations.length * 5 + (d.isAncestorStub ? 0 : 3);
    return scoreOf(a) >= scoreOf(b) ? a.id : b.id;
  });

  const keep = candidate.dogA.id === keepId ? candidate.dogA : candidate.dogB;
  const drop = candidate.dogA.id === keepId ? candidate.dogB : candidate.dogA;

  const tone =
    candidate.confidence === 'certain'
      ? 'brand'
      : candidate.confidence === 'likely'
        ? 'warning'
        : 'neutral';

  return (
    <Card>
      <CardContent className="pt-5">
        <div className="mb-4 flex flex-wrap items-center gap-2">
          <Badge tone={tone as 'brand'} size="md">
            {candidate.confidence} · {Math.round(candidate.score * 100)}%
          </Badge>
          {candidate.reasons.map((r) => (
            <span key={r} className="text-2xs text-ink-500">
              {r}
            </span>
          ))}
        </div>

        {candidate.conflicts.length > 0 && (
          <Alert tone="warning" icon={<AlertTriangle className="h-4 w-4" />} className="mb-4">
            <span className="font-medium">Evidence against merging: </span>
            {candidate.conflicts.join('; ')}
          </Alert>
        )}

        <div className="grid gap-3 sm:grid-cols-[1fr_auto_1fr]">
          <DogPanel dog={candidate.dogA} keeping={keepId === candidate.dogA.id} onKeep={() => setKeepId(candidate.dogA.id)} />
          <div className="flex items-center justify-center">
            <ArrowLeftRight className="h-4 w-4 text-ink-300" />
          </div>
          <DogPanel dog={candidate.dogB} keeping={keepId === candidate.dogB.id} onKeep={() => setKeepId(candidate.dogB.id)} />
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-bone-200 pt-4">
          <Button size="sm" loading={busy} onClick={() => onMerge(candidate, keep, drop)}>
            Merge into {keep.callName}
          </Button>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => onDismiss(candidate)}>
            <X /> Not a Duplicate
          </Button>
          <p className="text-2xs leading-relaxed text-ink-400">
            {offspring(drop)} descendant{offspring(drop) === 1 ? '' : 's'} will re-point to{' '}
            {keep.callName}. The other record is kept and marked superseded, never deleted — every
            link anyone already holds will still resolve.
          </p>
        </div>
      </CardContent>
    </Card>
  );
}

function DogPanel({
  dog,
  keeping,
  onKeep,
}: {
  dog: MergeCandidateDog;
  keeping: boolean;
  onKeep: () => void;
}) {
  const offspring = dog._count.sireOffspring + dog._count.damOffspring;
  return (
    <button
      type="button"
      onClick={onKeep}
      className={
        keeping
          ? 'rounded-md border-2 border-brand-500 bg-brand-50 p-3 text-left'
          : 'rounded-md border-2 border-bone-300 bg-bone-100 p-3 text-left opacity-70 transition-opacity hover:opacity-100'
      }
    >
      <div className="flex items-center justify-between gap-2">
        <p className="truncate text-sm font-medium text-ink-900">
          {dog.registeredName ?? dog.callName}
        </p>
        {keeping && (
          <Badge tone="brand" size="sm">
            Keep
          </Badge>
        )}
      </div>
      <dl className="mt-2 space-y-1 text-2xs text-ink-500">
        <Line label="Registration" value={dog.registrations[0] ? `${dog.registrations[0].body} ${dog.registrations[0].number}` : 'none'} />
        <Line label="Born" value={dog.dateOfBirth ? formatDate(dog.dateOfBirth, 'short') : 'unknown'} />
        <Line label="Microchip" value={dog.microchip ?? 'none'} />
        <Line label="Offspring" value={String(offspring)} />
        <Line label="Type" value={dog.isAncestorStub ? 'import stub' : 'maintained record'} />
      </dl>
    </button>
  );
}

function Line({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-2">
      <dt>{label}</dt>
      <dd className="truncate font-mono text-ink-700">{value}</dd>
    </div>
  );
}

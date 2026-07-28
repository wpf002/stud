'use client';

import { AlertTriangle, ArrowRight, Check, FileText, Link2, Upload } from 'lucide-react';
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
  Field,
  Input,
  Select,
  Textarea,
  formatCoi,
} from '@stud/ui';
import { api, ApiError } from '@/lib/api';
import type { ParsedDogDto, PreviewResponse } from '@/lib/types';

const SAMPLE = `Blackwater's Ranger Of The Marsh SR91234501
  Sire: CH Blackwater's Storm SR75110203
    Sire: Blackwater's Tern SR61220101
    Dam: Blackwater's Reed SR61220102
  Dam: Blackwater's Wren SR52883101
    Sire: Marshland Teal SR62009911
    Dam: Rivergate Thistle SR53001177`;

/**
 * Import is always preview-then-commit.
 *
 * The dangerous outcome is not a failed import — it is a successful one that
 * quietly creates a second copy of an ancestor you already have. Two copies
 * read as unrelated dogs and the COI drops. So the breeder sees every match
 * decision, and the projected COI, before anything is written.
 */
export function ImportClient({ kennelId }: { kennelId?: string }) {
  const router = useRouter();
  const [kind, setKind] = React.useState<'REGISTRY_TEXT' | 'CSV'>('REGISTRY_TEXT');
  const [input, setInput] = React.useState('');
  const [breed, setBreed] = React.useState('German Shorthaired Pointer');
  const [preview, setPreview] = React.useState<PreviewResponse | null>(null);
  const [linkTo, setLinkTo] = React.useState<Record<string, string>>({});
  const [skipKeys, setSkipKeys] = React.useState<Set<string>>(new Set());
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  async function runPreview() {
    setBusy(true);
    setError(null);
    try {
      const result = await api<PreviewResponse>('/pedigree/preview', {
        method: 'POST',
        json: { kind, input, breed },
      });
      setPreview(result);
      // Default to linking anything we are certain about; the breeder can undo.
      setLinkTo(
        Object.fromEntries(
          result.matches
            .filter((m) => m.existingDogId && m.confidence === 'certain')
            .map((m) => [m.key, m.existingDogId!]),
        ),
      );
      setSkipKeys(new Set());
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not read that pedigree.');
    } finally {
      setBusy(false);
    }
  }

  async function commit() {
    if (!preview) return;
    setBusy(true);
    setError(null);
    try {
      const result = await api<{ rootDogId: string | null; coi: number | null }>('/pedigree/import', {
        method: 'POST',
        json: { kind, input, breed, kennelId, linkTo, skipKeys: [...skipKeys] },
      });
      router.push(result.rootDogId ? `/dogs/${result.rootDogId}/pedigree` : '/dogs');
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Import failed.');
      setBusy(false);
    }
  }

  const errors = preview?.issues.filter((i) => i.severity === 'error') ?? [];
  const warnings = preview?.issues.filter((i) => i.severity === 'warning') ?? [];
  const linkedCount = Object.keys(linkTo).length;
  const newCount = (preview?.dogs.length ?? 0) - linkedCount - skipKeys.size;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_22rem]">
      <div className="space-y-4">
        <Card>
          <CardHeader>
            <CardTitle>
              <span className="flex items-center gap-2">
                <Upload className="h-4 w-4 text-ink-400" /> Paste or upload
              </span>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Format" htmlFor="kind">
                <Select
                  id="kind"
                  value={kind}
                  onChange={(e) => {
                    setKind(e.target.value as typeof kind);
                    setPreview(null);
                  }}
                >
                  <option value="REGISTRY_TEXT">Pedigree text (indented)</option>
                  <option value="CSV">CSV / spreadsheet export</option>
                </Select>
              </Field>
              <Field label="Breed" htmlFor="breed" hint="Applied to any ancestor with none of its own.">
                <Input id="breed" value={breed} onChange={(e) => setBreed(e.target.value)} />
              </Field>
            </div>

            <Field
              label={kind === 'CSV' ? 'CSV contents' : 'Pedigree text'}
              htmlFor="input"
              hint={
                kind === 'CSV'
                  ? 'Header row required. Recognised columns: id, name, sex, breed, dob, registration, sire, dam.'
                  : 'One dog per line. Indent each generation. "Sire:" and "Dam:" labels are optional.'
              }
            >
              <Textarea
                id="input"
                rows={12}
                value={input}
                onChange={(e) => {
                  setInput(e.target.value);
                  setPreview(null);
                }}
                placeholder={kind === 'CSV' ? 'id,name,sex,sire,dam\n1,Ranger,M,2,3' : SAMPLE}
                className="font-mono text-xs"
              />
            </Field>

            <div className="flex flex-wrap gap-2">
              <Button onClick={runPreview} loading={busy} disabled={!input.trim()}>
                Preview import <ArrowRight />
              </Button>
              {kind === 'REGISTRY_TEXT' && !input && (
                <Button variant="ghost" onClick={() => setInput(SAMPLE)}>
                  Use a sample
                </Button>
              )}
            </div>

            {error && <Alert tone="danger">{error}</Alert>}
          </CardContent>
        </Card>

        {preview && (
          <Card>
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-ink-400" /> {preview.dogs.length} dogs read
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {errors.map((i, n) => (
                <Alert key={n} tone="danger" icon={<AlertTriangle className="h-4 w-4" />}>
                  {i.line ? `Line ${i.line}: ` : ''}
                  {i.message}
                </Alert>
              ))}
              {warnings.map((i, n) => (
                <Alert key={n} tone="warning">
                  {i.line ? `Line ${i.line}: ` : ''}
                  {i.message}
                </Alert>
              ))}

              <ul className="divide-y divide-bone-200">
                {preview.dogs.map((d) => (
                  <ParsedRow
                    key={d.key}
                    dog={d}
                    match={preview.matches.find((m) => m.key === d.key)}
                    linked={Boolean(linkTo[d.key])}
                    skipped={skipKeys.has(d.key)}
                    onToggleLink={(on) =>
                      setLinkTo((prev) => {
                        const next = { ...prev };
                        const m = preview.matches.find((x) => x.key === d.key);
                        if (on && m?.existingDogId) next[d.key] = m.existingDogId;
                        else delete next[d.key];
                        return next;
                      })
                    }
                    onToggleSkip={(on) =>
                      setSkipKeys((prev) => {
                        const next = new Set(prev);
                        if (on) next.add(d.key);
                        else next.delete(d.key);
                        return next;
                      })
                    }
                  />
                ))}
              </ul>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Summary rail ────────────────────────────────────────────── */}
      <div className="space-y-4">
        {preview ? (
          <>
            <Card>
              <CardHeader>
                <CardTitle as="h4" className="text-md">
                  What will happen
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                <SummaryLine label="New records created" value={Math.max(0, newCount)} />
                <SummaryLine label="Linked to existing dogs" value={linkedCount} tone="brand" />
                <SummaryLine label="Skipped" value={skipKeys.size} tone="muted" />

                <div className="border-t border-bone-200 pt-3">
                  <p className="text-2xs uppercase tracking-widest text-ink-400">
                    Resulting COI
                  </p>
                  <p className="mt-1 font-mono text-2xl tabular-nums text-ink-900">
                    {preview.projectedCoi == null ? '—' : formatCoi(preview.projectedCoi)}
                  </p>
                  {preview.collapsedAncestors > 0 && (
                    <p className="mt-2 text-2xs leading-relaxed text-ink-500">
                      {preview.collapsedAncestors} ancestor reference
                      {preview.collapsedAncestors === 1 ? '' : 's'} resolved to a dog you already
                      have. Had they been imported as new records, they would have read as unrelated
                      animals and this COI would have come out lower than the truth.
                    </p>
                  )}
                </div>

                <Button
                  block
                  onClick={commit}
                  loading={busy}
                  disabled={errors.length > 0 || preview.dogs.length === 0}
                >
                  Commit import
                </Button>
                {errors.length > 0 && (
                  <p className="text-2xs text-danger">Fix the errors above before importing.</p>
                )}
              </CardContent>
            </Card>
          </>
        ) : (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm leading-relaxed text-ink-600">
                Nothing is written until you commit. The preview shows every ancestor we can match
                to a dog you already hold, so an import never quietly creates a second copy of the
                same animal.
              </p>
              <p className="mt-3 text-xs leading-relaxed text-ink-400">
                A duplicated ancestor is the one failure that silently corrupts a COI: two copies of
                the same dog look unrelated, and the number comes out lower than the truth.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}

function SummaryLine({
  label,
  value,
  tone = 'default',
}: {
  label: string;
  value: number;
  tone?: 'default' | 'brand' | 'muted';
}) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <span className="text-sm text-ink-600">{label}</span>
      <span
        className={
          tone === 'brand'
            ? 'font-mono text-md tabular-nums text-brand-700'
            : tone === 'muted'
              ? 'font-mono text-md tabular-nums text-ink-400'
              : 'font-mono text-md tabular-nums text-ink-900'
        }
      >
        {value}
      </span>
    </div>
  );
}

function ParsedRow({
  dog,
  match,
  linked,
  skipped,
  onToggleLink,
  onToggleSkip,
}: {
  dog: ParsedDogDto;
  match?: PreviewResponse['matches'][number];
  linked: boolean;
  skipped: boolean;
  onToggleLink: (on: boolean) => void;
  onToggleSkip: (on: boolean) => void;
}) {
  return (
    <li className={skipped ? 'py-3 opacity-45' : 'py-3'}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2">
            <span
              className="shrink-0 font-mono text-2xs text-ink-300"
              title={`Generation ${dog.generation}`}
            >
              G{dog.generation}
            </span>
            <span className="truncate text-sm font-medium text-ink-800">
              {dog.registeredName ?? dog.callName}
            </span>
            {dog.sex && (
              <Badge tone={dog.sex === 'MALE' ? 'brand' : 'clay'} size="sm">
                {dog.sex === 'MALE' ? 'M' : 'F'}
              </Badge>
            )}
          </p>
          <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-2xs text-ink-400">
            {dog.registrationNumber ? (
              <span className="font-mono">
                {dog.registryBody} {dog.registrationNumber}
              </span>
            ) : (
              <span className="text-warning-fg">no registration number</span>
            )}
            {dog.titlesPrefix && <span>titles: {dog.titlesPrefix}</span>}
            {dog.titlesSuffix && <span>{dog.titlesSuffix}</span>}
          </p>

          {match?.existingDogId && (
            <p className="mt-1.5 flex items-center gap-1.5 text-2xs text-brand-700">
              <Link2 className="h-3 w-3" />
              Matches an existing dog ({Math.round(match.score * 100)}% — {match.reasons.join(', ')})
            </p>
          )}
          {match?.conflicts && match.conflicts.length > 0 && (
            <p className="mt-1 text-2xs text-warning-fg">⚠ {match.conflicts.join(', ')}</p>
          )}
        </div>

        <div className="flex shrink-0 flex-col items-end gap-1.5">
          {match?.existingDogId && (
            <button
              type="button"
              onClick={() => onToggleLink(!linked)}
              className={
                linked
                  ? 'inline-flex items-center gap-1 rounded-pill bg-brand-100 px-2 py-0.5 text-2xs font-semibold text-brand-700 ring-1 ring-inset ring-brand-200'
                  : 'inline-flex items-center gap-1 rounded-pill bg-bone-200 px-2 py-0.5 text-2xs font-medium text-ink-500'
              }
            >
              {linked ? <Check className="h-3 w-3" /> : null}
              {linked ? 'Linked' : 'Create new'}
            </button>
          )}
          <button
            type="button"
            onClick={() => onToggleSkip(!skipped)}
            className="text-2xs text-ink-400 underline underline-offset-2 hover:text-ink-700"
          >
            {skipped ? 'Include' : 'Skip'}
          </button>
        </div>
      </div>
    </li>
  );
}

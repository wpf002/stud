'use client';

import { ArrowRight, Dna, GitBranch, Info, Repeat } from 'lucide-react';
import * as React from 'react';
import {
  Alert,
  Badge,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CoiReadout,
  EmptyState,
  Field,
  Select,
} from '@stud/ui';
import { api, ApiError } from '@/lib/api';
import type { DogSummary, PairingEvaluateResponse } from '@/lib/types';
import { GeneticRiskPanel, HealthComparison } from '@/components/genetic-risk-panel';

const RELATIONSHIP_COPY: Record<string, string> = {
  UNRELATED: 'No shared ancestors in the pedigree we hold',
  DISTANT: 'Distantly related',
  COUSINS: 'Cousin-level relationship',
  HALF_SIBLINGS: 'Half-sibling level relationship',
  FULL_SIBLINGS: 'Full-sibling level relationship',
  PARENT_OFFSPRING: 'Parent and offspring',
  GRANDPARENT_GRANDOFFSPRING: 'One is an ancestor of the other',
};

/**
 * Trial pairing — the feature nobody else in the category has.
 *
 * The design job here is restraint. It is very easy to make this read as a
 * verdict ("GOOD MATCH ✅"), and it is not one: a COI says nothing about
 * health testing, type or temperament. So the number is presented with its
 * confidence, its drivers, and no recommendation.
 */
export function PairingClient({
  dogs,
  initialSireId,
  initialDamId,
}: {
  dogs: DogSummary[];
  initialSireId?: string;
  initialDamId?: string;
}) {
  const sires = dogs.filter((d) => d.sex === 'MALE');
  const dams = dogs.filter((d) => d.sex === 'FEMALE');

  const [sireId, setSireId] = React.useState(initialSireId || sires[0]?.id || '');
  const [damId, setDamId] = React.useState(initialDamId || dams[0]?.id || '');
  const [result, setResult] = React.useState<PairingEvaluateResponse | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const run = React.useCallback(async () => {
    if (!sireId || !damId) return;
    setBusy(true);
    setError(null);
    try {
      // The full evaluation: COI, shared ancestors, genetic risk and a
      // side-by-side health comparison in one round trip.
      setResult(
        await api<PairingEvaluateResponse>(
          `/pairings/evaluate?sireId=${sireId}&damId=${damId}&generations=6`,
        ),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not evaluate that pairing.');
      setResult(null);
    } finally {
      setBusy(false);
    }
  }, [sireId, damId]);

  if (sires.length === 0 || dams.length === 0) {
    return (
      <EmptyState
        icon={<GitBranch className="h-5 w-5" />}
        title="You need at least one male and one female on file"
        description="Add or import both sides and you can model a litter before committing to it."
      />
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="pt-5">
          <div className="grid items-end gap-4 sm:grid-cols-[1fr_auto_1fr_auto]">
            <Field label="Sire" htmlFor="sire">
              <Select id="sire" value={sireId} onChange={(e) => setSireId(e.target.value)}>
                {sires.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.callName}
                    {d.registeredName ? ` — ${d.registeredName}` : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <span className="hidden pb-3 text-ink-300 sm:block">×</span>

            <Field label="Dam" htmlFor="dam">
              <Select id="dam" value={damId} onChange={(e) => setDamId(e.target.value)}>
                {dams.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.callName}
                    {d.registeredName ? ` — ${d.registeredName}` : ''}
                  </option>
                ))}
              </Select>
            </Field>

            <Button onClick={run} loading={busy} className="sm:mb-0">
              Evaluate <ArrowRight />
            </Button>
          </div>

          {error && (
            <Alert tone="danger" className="mt-4">
              {error}
            </Alert>
          )}
        </CardContent>
      </Card>

      {!result ? (
        <EmptyState
          icon={<GitBranch className="h-5 w-5" />}
          title="Pick two dogs and evaluate"
          description="You\u2019ll get the litter\u2019s projected COI, the ancestors driving it, and how complete the pedigrees behind the number are."
        />
      ) : (
        <Result result={result} />
      )}
    </div>
  );
}

function Result({ result }: { result: PairingEvaluateResponse }) {
  const { pairing, sire, dam, crossBreed, geneticRisk, healthComparison } = result;

  return (
    <div className="space-y-4">
      {/*
        Genetic risk sits above everything else, including the COI. A COI of
        3% on a pairing that would produce 25% affected puppies is not the
        headline, and laying it out as though it were would be a design
        decision with consequences.
      */}
      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Dna className="h-4 w-4 text-ink-400" /> Genetic Risk
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <GeneticRiskPanel risk={geneticRisk} />
        </CardContent>
      </Card>

    <div className="grid gap-4 lg:grid-cols-[22rem_1fr]">
      <div className="space-y-4">
        <CoiReadout
          coi={pairing.projectedCoi}
          band={pairing.coiBand}
          completeness={
            // Present the weaker side — that is what actually bounds trust.
            pairing.sireCompleteness.generationEquivalent <=
            pairing.damCompleteness.generationEquivalent
              ? pairing.sireCompleteness
              : pairing.damCompleteness
          }
          generations={pairing.generations}
          confidence={pairing.confidence}
          note={pairing.confidenceNote}
          size="lg"
        />

        <Card>
          <CardHeader>
            <CardTitle as="h4" className="text-md">
              The Two Dogs
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <SideRow
              role="Sire"
              name={sire.registeredName ?? sire.callName}
              coi={pairing.sireCoi}
              completeness={pairing.sireCompleteness}
            />
            <SideRow
              role="Dam"
              name={dam.registeredName ?? dam.callName}
              coi={pairing.damCoi}
              completeness={pairing.damCompleteness}
            />

            <div className="border-t border-bone-200 pt-3">
              <p className="text-2xs uppercase tracking-widest text-ink-400">Relationship</p>
              <p className="mt-1 text-sm text-ink-800">
                {RELATIONSHIP_COPY[pairing.relationship] ?? pairing.relationship}
              </p>
              <p className="mt-0.5 font-mono text-2xs text-ink-400">
                r = {pairing.relatedness.toFixed(4)} · they share roughly{' '}
                {(pairing.relatedness * 100).toFixed(1)}% of their genome
              </p>
            </div>

            {crossBreed && (
              <Alert tone="warning">
                These are recorded as different breeds — {crossBreed.sire} × {crossBreed.dam}. A
                pedigree COI across breeds is close to meaningless.
              </Alert>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>
            <span className="flex items-center gap-2">
              <Repeat className="h-4 w-4 text-ink-400" /> Shared Ancestors
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {pairing.contributions.length === 0 ? (
            <div className="space-y-3">
              <p className="text-sm leading-relaxed text-ink-600">
                No ancestor appears on both sides within {pairing.generations} generations.
              </p>
              {pairing.confidence !== 'HIGH' && (
                <Alert tone="warning" icon={<Info className="h-4 w-4" />}>
                  They may still be related. With gaps in these pedigrees, shared ancestry
                  above the known generations cannot be seen from here.
                </Alert>
              )}
            </div>
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[34rem] text-sm">
                  <thead>
                    <tr className="border-b border-bone-300 text-left text-2xs uppercase tracking-widest text-ink-400">
                      <th className="py-2 pr-3 font-semibold">Ancestor</th>
                      <th className="py-2 pr-3 font-semibold">Via Sire</th>
                      <th className="py-2 pr-3 font-semibold">Via Dam</th>
                      <th className="py-2 pr-3 font-semibold">Paths</th>
                      <th className="py-2 text-right font-semibold">Adds to COI</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pairing.contributions.map((c) => (
                      <tr key={c.id} className="border-b border-bone-200">
                        <td className="py-2.5 pr-3">
                          <span className="text-ink-800">{c.dog?.registeredName ?? c.name}</span>
                          {c.ownCoi > 0 && (
                            <Badge tone="warning" size="sm" className="ml-2">
                              itself {(c.ownCoi * 100).toFixed(1)}% inbred
                            </Badge>
                          )}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-ink-500">
                          gen {c.depthViaSire}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-ink-500">
                          gen {c.depthViaDam}
                        </td>
                        <td className="py-2.5 pr-3 font-mono text-xs tabular-nums text-ink-500">
                          {c.pathCount}
                        </td>
                        <td className="py-2.5 text-right font-mono text-sm tabular-nums text-clay-600">
                          {(c.contribution * 100).toFixed(3)}%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {pairing.contributionsTruncated && (
                <Alert tone="warning" className="mt-4">
                  This pedigree has more ancestral paths than we enumerate, so the breakdown above is
                  partial. The projected COI itself is still exact.
                </Alert>
              )}

              <p className="mt-4 border-t border-bone-200 pt-3 text-2xs leading-relaxed text-ink-400">
                An ancestor that is itself inbred contributes more than its position alone suggests
                — Wright&rsquo;s formula carries a (1 + F) term for exactly that reason. This is a
                genetic relatedness figure only; it says nothing about structure or temperament.
              </p>
            </>
          )}
        </CardContent>
      </Card>
    </div>

      <Card>
        <CardHeader>
          <CardTitle as="h4" className="text-md">
            Health, Side by Side
          </CardTitle>
        </CardHeader>
        <CardContent>
          <HealthComparison rows={healthComparison} />
          <p className="mt-4 border-t border-bone-200 pt-3 text-2xs leading-relaxed text-ink-400">
            Gaps are shown as prominently as results. A pairing where one dog is fully panelled and
            the other is not is a real finding.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}

function SideRow({
  role,
  name,
  coi,
  completeness,
}: {
  role: string;
  name: string;
  coi: number;
  completeness: { ratio: number; generationEquivalent: number };
}) {
  return (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-2xs uppercase tracking-widest text-ink-400">{role}</p>
        <p className="truncate text-sm text-ink-800">{name}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="font-mono text-sm tabular-nums text-ink-800">{(coi * 100).toFixed(2)}%</p>
        <p className="font-mono text-2xs tabular-nums text-ink-400">
          {(completeness.ratio * 100).toFixed(0)}% complete
        </p>
      </div>
    </div>
  );
}

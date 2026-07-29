import { ArrowLeft, GitBranch } from 'lucide-react';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  Alert,
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CoiReadout,
  PedigreeChart,
} from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { PedigreeResponse } from '@/lib/types';

export const dynamic = 'force-dynamic';

function bandFor(coi: number) {
  if (coi < 0.0325) return 'MINIMAL' as const;
  if (coi < 0.0625) return 'LOW' as const;
  if (coi < 0.125) return 'MODERATE' as const;
  if (coi < 0.25) return 'HIGH' as const;
  return 'VERY_HIGH' as const;
}

export default async function PedigreePage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ generations?: string }>;
}) {
  const { slug } = await params;
  const { generations } = await searchParams;
  const gen = Math.min(Math.max(Number(generations ?? 5) || 5, 3), 8);

  const data = await serverApiSafe<PedigreeResponse>(`/dogs/${slug}/pedigree?generations=${gen}`);
  if (!data) notFound();

  const { dog, chart, coi, completeness, contributions, contributionsTruncated } = data;
  const name = dog.registeredName ?? dog.callName;

  // Confidence mirrors the rule in @stud/pedigree's assessPairing so the
  // single-dog view and the trial pairing never disagree about the same data.
  const confidence =
    completeness.generationEquivalent < 1.5
      ? ('INSUFFICIENT' as const)
      : completeness.generationEquivalent < 3 || completeness.ratio < 0.5
        ? ('LOW' as const)
        : completeness.generationEquivalent < 4.5 || completeness.ratio < 0.8
          ? ('MODERATE' as const)
          : ('HIGH' as const);

  const note =
    confidence === 'INSUFFICIENT'
      ? 'Fewer than two complete generations on file. A COI of 0% here means "unknown", not "unrelated".'
      : confidence === 'LOW'
        ? 'Shallow pedigree. Treat this as a floor — shared ancestry above the known generations cannot be counted.'
        : confidence === 'MODERATE'
          ? 'Reasonable depth, with gaps. Filling missing ancestors can only move this number up, never down.'
          : 'Deep and near-complete over the generations shown.';

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title={`${dog.callName} — pedigree`}
        description={name}
        wide
        actions={
          <>
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/studio/dogs/${slug}`}>
                <ArrowLeft /> Back to dog
              </Link>
            </Button>
            <div className="flex rounded-md border border-bone-400 bg-bone-50 p-0.5">
              {[3, 4, 5, 6].map((g) => (
                <Link
                  key={g}
                  href={`/studio/dogs/${slug}/pedigree?generations=${g}`}
                  className={
                    g === gen
                      ? 'rounded-sm bg-brand-600 px-2.5 py-1 text-xs font-semibold text-bone-50'
                      : 'rounded-sm px-2.5 py-1 text-xs font-medium text-ink-500 hover:bg-bone-200'
                  }
                >
                  {g} gen
                </Link>
              ))}
            </div>
          </>
        }
      >
        <div className="grid gap-4 lg:grid-cols-[1fr_20rem]">
          <Card className="order-2 lg:order-1">
            <CardHeader>
              <CardTitle>
                <span className="flex items-center gap-2">
                  <GitBranch className="h-4 w-4 text-ink-400" /> {gen}-generation chart
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent className="pt-8">
              <PedigreeChart chart={chart} subjectName={dog.callName} />
            </CardContent>
          </Card>

          <div className="order-1 space-y-4 lg:order-2">
            <CoiReadout
              coi={coi}
              band={bandFor(coi)}
              completeness={completeness}
              generations={gen}
              confidence={confidence}
              note={note}
              size="lg"
            />

            <Card>
              <CardHeader>
                <CardTitle as="h4" className="text-md">
                  What is driving it
                </CardTitle>
              </CardHeader>
              <CardContent>
                {contributions.length === 0 ? (
                  <p className="text-sm leading-relaxed text-ink-500">
                    No ancestor appears on both the sire and dam sides within {gen} generations.
                    {completeness.ratio < 0.8 &&
                      ' With gaps in the pedigree, that is not proof of no relationship.'}
                  </p>
                ) : (
                  <ul className="space-y-2.5">
                    {contributions.map((c, i) => (
                      <li key={c.id} className="flex items-baseline justify-between gap-3">
                        <span className="min-w-0">
                          <span className="mr-1.5 font-mono text-2xs text-ink-300">
                            {String(i + 1).padStart(2, '0')}
                          </span>
                          <span className="text-sm text-ink-800">{c.name}</span>
                          <span className="ml-1.5 text-2xs text-ink-400">
                            gen {c.depthViaSire}/{c.depthViaDam}
                            {c.pathCount > 1 ? ` · ${c.pathCount} paths` : ''}
                            {c.ownCoi > 0 ? ` · itself ${(c.ownCoi * 100).toFixed(1)}% inbred` : ''}
                          </span>
                        </span>
                        <span className="shrink-0 font-mono text-sm tabular-nums text-clay-600">
                          {(c.contribution * 100).toFixed(3)}%
                        </span>
                      </li>
                    ))}
                  </ul>
                )}

                {contributionsTruncated && (
                  <Alert tone="warning" className="mt-4">
                    This pedigree has more ancestral paths than we enumerate. The COI above is still
                    exact — only this breakdown is partial.
                  </Alert>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle as="h4" className="text-md">
                  Coverage by generation
                </CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2">
                  {completeness.perGeneration.map((g) => (
                    <li key={g.generation} className="flex items-center gap-3">
                      <span className="w-12 shrink-0 text-2xs uppercase tracking-wide text-ink-400">
                        Gen {g.generation}
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-pill bg-bone-300">
                        <span
                          className="block h-full rounded-pill bg-brand-500"
                          style={{ width: `${g.ratio * 100}%` }}
                        />
                      </span>
                      <span className="w-14 shrink-0 text-right font-mono text-2xs tabular-nums text-ink-500">
                        {g.known}/{g.possible}
                      </span>
                    </li>
                  ))}
                </ul>
                <p className="mt-4 border-t border-bone-200 pt-3 text-2xs leading-relaxed text-ink-400">
                  {completeness.distinctAncestors} distinct animals fill {completeness.totalSlots}{' '}
                  slots — an ancestor-loss ratio of{' '}
                  {(completeness.ancestorLossRatio * 100).toFixed(0)}%. The lower that is, the more
                  the same names repeat.
                </p>
              </CardContent>
            </Card>
          </div>
        </div>
      </StudioPage>
    </StudioShell>
  );
}

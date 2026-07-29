import { Copy, GitBranch, Upload } from 'lucide-react';
import Link from 'next/link';
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  EmptyState,
  formatDateTime,
} from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';

export const dynamic = 'force-dynamic';

interface ImportRecord {
  id: string;
  kind: string;
  fileName: string | null;
  dogsCreated: number;
  dogsLinked: number;
  dogsSkipped: number;
  createdAt: string;
  rootDog: { id: string; slug: string; callName: string } | null;
}

export default async function PedigreesPage() {
  const [imports, dupes] = await Promise.all([
    serverApiSafe<{ imports: ImportRecord[] }>('/pedigree/imports'),
    serverApiSafe<{ candidates: unknown[] }>('/dogs/duplicates?status=OPEN'),
  ]);
  const openDupes = dupes?.candidates.length ?? 0;

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="Pedigrees"
        description="Import, analyse and keep the ancestry graph clean."
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/studio/pedigrees/duplicates">
                <Copy /> Duplicates{openDupes > 0 ? ` (${openDupes})` : ''}
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/studio/pedigrees/import">
                <Upload /> Import
              </Link>
            </Button>
          </>
        }
      >
        <div className="mb-4 grid gap-4 sm:grid-cols-2">
          <Card interactive>
            <Link href="/studio/pedigrees/pairing" className="block p-5">
              <GitBranch className="h-5 w-5 text-brand-600" />
              <p className="mt-3 font-display text-lg text-ink-900">Trial pairing</p>
              <p className="mt-1 text-sm leading-relaxed text-ink-500">
                Pick a dam and a prospective sire and get the projected litter COI, the shared
                ancestors, and how much to trust the number — for a litter that does not exist yet.
              </p>
            </Link>
          </Card>

          <Card interactive>
            <Link href="/studio/pedigrees/duplicates" className="block p-5">
              <Copy className="h-5 w-5 text-clay-500" />
              <p className="mt-3 font-display text-lg text-ink-900">
                Duplicate ancestors
                {openDupes > 0 && (
                  <span className="ml-2 rounded-pill bg-clay-100 px-2 py-0.5 text-xs text-clay-700">
                    {openDupes} open
                  </span>
                )}
              </p>
              <p className="mt-1 text-sm leading-relaxed text-ink-500">
                A duplicated ancestor reads as two unrelated dogs and quietly lowers every COI it
                appears in. This is the queue that catches it.
              </p>
            </Link>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Import history</CardTitle>
          </CardHeader>
          <CardContent>
            {!imports || imports.imports.length === 0 ? (
              <EmptyState
                icon={<Upload className="h-5 w-5" />}
                title="No imports yet"
                description="Paste a pedigree off a registry page and we will build the graph, match ancestors you already have, and show the COI before anything is saved."
                action={
                  <Button asChild size="sm">
                    <Link href="/studio/pedigrees/import">Import a pedigree</Link>
                  </Button>
                }
              />
            ) : (
              <ul className="divide-y divide-bone-200">
                {imports.imports.map((im) => (
                  <li key={im.id} className="flex items-center justify-between gap-4 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-ink-800">
                        {im.rootDog ? (
                          <Link href={`/studio/dogs/${im.rootDog.slug}`} className="hover:text-brand-700">
                            {im.rootDog.callName}
                          </Link>
                        ) : (
                          (im.fileName ?? 'Untitled import')
                        )}
                      </p>
                      <p className="mt-0.5 text-2xs text-ink-400">
                        {im.kind.replace('_', ' ').toLowerCase()} · {formatDateTime(im.createdAt)}
                      </p>
                    </div>
                    <p className="shrink-0 text-right font-mono text-2xs tabular-nums text-ink-500">
                      +{im.dogsCreated} new · {im.dogsLinked} linked
                      {im.dogsSkipped > 0 ? ` · ${im.dogsSkipped} skipped` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </StudioPage>
    </StudioShell>
  );
}

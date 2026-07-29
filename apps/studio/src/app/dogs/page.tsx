import { Dog as DogIcon, GitBranch, Plus, Upload } from 'lucide-react';
import Link from 'next/link';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  formatCoi,
  formatDate,
  formatDogAge,
} from '@stud/ui';
import { StudioPage, StudioShell } from '@/components/studio-shell';
import { serverApiSafe } from '@/lib/server-api';
import type { DogSummary } from '@/lib/types';

export const dynamic = 'force-dynamic';

export default async function DogsPage() {
  const data = await serverApiSafe<{ dogs: DogSummary[]; total: number }>('/dogs?mine=true&take=100');
  const dogs = data?.dogs ?? [];

  return (
    <StudioShell kennelName="Blackwater Kennels" userName="Jordan Hale">
      <StudioPage
        title="Dogs"
        description={`${dogs.length} in your program`}
        actions={
          <>
            <Button variant="outline" size="sm" asChild>
              <Link href="/pedigrees/import">
                <Upload /> Import Pedigree
              </Link>
            </Button>
            <Button size="sm" asChild>
              <Link href="/dogs/new">
                <Plus /> Add a Dog
              </Link>
            </Button>
          </>
        }
      >
        {dogs.length === 0 ? (
          <EmptyState
            icon={<DogIcon className="h-5 w-5" />}
            title="No dogs yet"
            description="Add a dog by hand, or paste a pedigree straight off a registry page and we will build the graph for you."
            action={
              <div className="flex gap-2">
                <Button asChild size="sm" variant="outline">
                  <Link href="/pedigrees/import">Import a Pedigree</Link>
                </Button>
                <Button asChild size="sm">
                  <Link href="/dogs/new">Add a Dog</Link>
                </Button>
              </div>
            }
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {dogs.map((dog) => (
              <DogCard key={dog.id} dog={dog} />
            ))}
          </div>
        )}
      </StudioPage>
    </StudioShell>
  );
}

function DogCard({ dog }: { dog: DogSummary }) {
  const reg = dog.registrations.find((r) => r.isPrimary) ?? dog.registrations[0];
  const stats = dog.pedigreeStats;

  const photo = dog.media[0]?.thumbUrl ?? dog.media[0]?.url;

  return (
    <Card interactive className="flex flex-col overflow-hidden">
      <Link href={`/dogs/${dog.slug}`} className="flex-1">
        {photo && (
          <div className="relative aspect-[5/3] overflow-hidden">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={photo}
              alt={dog.callName}
              className="h-full w-full object-cover transition-transform duration-500 hover:scale-105"
            />
          </div>
        )}
        <div className="p-4">
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="truncate font-display text-lg leading-tight text-ink-900">{dog.callName}</p>
            {dog.registeredName && (
              <p className="mt-0.5 truncate text-xs text-ink-500">{dog.registeredName}</p>
            )}
          </div>
          <Badge tone={dog.sex === 'MALE' ? 'brand' : 'clay'} size="sm">
            {dog.sex === 'MALE' ? 'Sire' : 'Dam'}
          </Badge>
        </div>

        <p className="mt-3 text-xs text-ink-500">
          {dog.breed} · {formatDogAge(dog.dateOfBirth)}
          {dog.dateOfBirth ? ` · b. ${formatDate(dog.dateOfBirth, 'short')}` : ''}
        </p>

        {reg && (
          <p className="mt-1 font-mono text-2xs text-ink-400">
            {reg.body} {reg.number}
          </p>
        )}

        <div className="mt-4 flex items-center justify-between gap-2 border-t border-bone-200 pt-3">
          <div>
            <p className="text-2xs uppercase tracking-widest text-ink-400">COI</p>
            <p className="font-mono text-md tabular-nums text-ink-800">
              {stats ? formatCoi(stats.coi) : '—'}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xs uppercase tracking-widest text-ink-400">Pedigree</p>
            <p className="font-mono text-md tabular-nums text-ink-800">
              {stats ? `${Math.round(stats.completenessRatio * 100)}%` : '—'}
            </p>
          </div>
        </div>
        </div>
      </Link>

      <div className="border-t border-bone-200 bg-bone-100 px-4 py-2">
        <Link
          href={`/dogs/${dog.slug}/pedigree`}
          className="inline-flex items-center gap-1.5 text-xs font-medium text-brand-700 hover:text-brand-800"
        >
          <GitBranch className="h-3.5 w-3.5" /> View Pedigree
        </Link>
      </div>
    </Card>
  );
}

import { MapPin, PawPrint, ShieldCheck } from 'lucide-react';
import type { Metadata } from 'next';
import Image from 'next/image';
import Link from 'next/link';
import { Badge, Card, EmptyState, formatCoi, formatMoney, titleCase } from '@stud/ui';
import { API_URL } from '@/lib/api';
import { Pagination, pageFrom } from '@/components/pagination';
import { redirect } from 'next/navigation';

const DESCRIPTION =
  'Find a stud whose hips, elbows, eyes and DNA panel were checked against the issuing registry — not typed into a listing. Filter by verified results, fee and distance.';

/** Paginated pages canonicalise to themselves — see the note on /puppies. */
export async function generateMetadata({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}): Promise<Metadata> {
  const page = pageFrom((await searchParams).page);
  return {
    title: page > 1 ? `Stud dogs with verified health testing — page ${page}` : 'Stud dogs with verified health testing',
    description: DESCRIPTION,
    alternates: { canonical: page > 1 ? `/studs?page=${page}` : '/studs' },
  };
}

/** Matches the stud API's own default page size. */
const PAGE_SIZE = 24;

/**
 * The public stud directory.
 *
 * A thin, cacheable page over the same search the breeder workspace uses.
 * The full tooling — trial pairings, projected COI against your own bitch —
 * lives in the studio; this page is the front door that ranks for the searches
 * a bitch owner actually types.
 */
interface StudRow {
  id: string;
  availability: string;
  studFeeCents: number | null;
  shipsSemen: boolean;
  semenTypes: string[];
  dog: {
    slug: string;
    callName: string;
    media?: { url: string }[];
    registeredName: string | null;
    breed: string;
    colorPattern: string | null;
    verificationSummary: {
      verifiedCount: number;
      healthNormalCount: number;
      verifiedTitleCount: number;
      hasChic: boolean;
    } | null;
    pedigreeStats: { coi: number } | null;
    kennel: { slug: string; name: string; city: string | null; region: string | null } | null;
  };
}

async function loadStuds(query: string) {
  const res = await fetch(`${API_URL}/v1/studs${query ? `?${query}` : ''}`, {
    next: { revalidate: 300 },
  });
  if (!res.ok) return null;
  return (await res.json()) as { studs: StudRow[]; total: number };
}

export default async function StudsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const qs = new URLSearchParams();
  for (const key of ['breed', 'search', 'maxFeeCents', 'shipsSemen', 'verifiedNormal'] as const) {
    const v = sp[key];
    if (typeof v === 'string' && v) qs.set(key, v);
  }
  const filterParams = Object.fromEntries(qs);
  const page = pageFrom(sp.page);
  qs.set('take', String(PAGE_SIZE));
  qs.set('skip', String((page - 1) * PAGE_SIZE));

  const data = await loadStuds(qs.toString());
  const studs = data?.studs ?? [];
  const total = data?.total ?? 0;

  // See /puppies: a page past the end redirects rather than rendering empty.
  const lastPage = Math.max(1, Math.ceil(total / PAGE_SIZE));
  if (total > 0 && page > lastPage) {
    const q = new URLSearchParams(filterParams);
    q.set('page', String(lastPage));
    redirect(`/studs?${q.toString()}`);
  }

  return (
    <div className="mx-auto max-w-content px-5 py-10 lg:px-8">
      <header className="max-w-2xl">
        <h1 className="font-display text-4xl leading-[1.1] tracking-tight text-ink-900">
          Stud Dogs
        </h1>
        <p className="mt-2 text-md leading-relaxed text-ink-600">
          Health tests and titles checked with the registry. Keep a female on Stud? Run a trial
          pairing against any of them.
        </p>
      </header>

      {studs.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={<PawPrint className="h-5 w-5" />}
          title="No studs match"
          description="Only dogs with a published listing appear here — a smaller list than a classified board, and every entry on it can be checked."
        />
      ) : (
        <ul className="mt-8 grid gap-4 md:grid-cols-2">
          {studs.map((s) => {
            const v = s.dog.verificationSummary;
            return (
              <li key={s.id}>
                <Card interactive className="h-full overflow-hidden">
                  <Link href={`/studs/${s.dog.slug}`} className="block">
                    {s.dog.media?.[0] && (
                      <div className="relative aspect-[5/2] overflow-hidden">
                        <Image
                          src={s.dog.media[0].url}
                          alt={s.dog.callName}
                          fill
                          className="object-cover transition-transform duration-500 hover:scale-105"
                          sizes="(min-width: 768px) 34rem, 100vw"
                        />
                      </div>
                    )}
                    <div className="p-5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-2xs font-semibold uppercase tracking-widest text-clay-600">
                          {s.dog.breed}
                        </p>
                        <p className="mt-1 font-display text-2xl leading-tight text-ink-900">
                          {s.dog.registeredName ?? s.dog.callName}
                        </p>
                        <p className="mt-1 flex flex-wrap items-center gap-x-3 text-2xs text-ink-400">
                          {s.dog.kennel?.city && (
                            <span className="flex items-center gap-1">
                              <MapPin className="h-3 w-3" /> {s.dog.kennel.city},{' '}
                              {s.dog.kennel.region}
                            </span>
                          )}
                          {s.dog.colorPattern && <span>{s.dog.colorPattern}</span>}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        {s.studFeeCents != null && (
                          <p className="font-display text-xl text-ink-900">
                            {formatMoney(s.studFeeCents, { compact: true })}
                          </p>
                        )}
                        <Badge
                          tone={s.availability === 'AVAILABLE' ? 'brand' : 'neutral'}
                          size="sm"
                        >
                          {titleCase(s.availability)}
                        </Badge>
                      </div>
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-bone-200 pt-3">
                      <Badge tone={(v?.verifiedCount ?? 0) > 0 ? 'brand' : 'neutral'} size="sm">
                        <ShieldCheck /> {v?.verifiedCount ?? 0} verified
                      </Badge>
                      {v?.hasChic && (
                        <Badge tone="brand" size="sm">
                          CHIC
                        </Badge>
                      )}
                      {(v?.verifiedTitleCount ?? 0) > 0 && (
                        <span className="text-2xs text-ink-500">
                          {v!.verifiedTitleCount} verified {v!.verifiedTitleCount === 1 ? 'title' : 'titles'}
                        </span>
                      )}
                      {s.dog.pedigreeStats && (
                        <span className="text-2xs text-ink-400">
                          {formatCoi(s.dog.pedigreeStats.coi)} COI
                        </span>
                      )}
                      {s.shipsSemen && <span className="text-2xs text-ink-400">Ships</span>}
                    </div>
                    </div>
                  </Link>
                </Card>
              </li>
            );
          })}
        </ul>
      )}

      <Pagination
        basePath="/studs"
        params={filterParams}
        page={page}
        pageSize={PAGE_SIZE}
        total={total}
      />
    </div>
  );
}

import type { ClaimPanel, VerificationDensity } from '@stud/ui';
import { API_URL } from './api';

/**
 * Server-side reads for the public marketplace.
 *
 * These pages are the ones that have to rank, so they are cached rather than
 * `force-dynamic`. A litter listing changes a few times over its life —
 * revalidating on a short window costs nothing and turns every crawl and every
 * shared link into a cache hit instead of six database queries.
 */
const REVALIDATE_SECONDS = 120;

/**
 * Taken from the components that render them, so a shape change in the UI
 * package breaks the build here rather than at runtime on a public page.
 */
export type ClaimRow = Parameters<typeof ClaimPanel>[0]['verified'][number];
export type ReportedRow = Parameters<typeof ClaimPanel>[0]['reported'][number];
export type VerificationSummary = NonNullable<Parameters<typeof VerificationDensity>[0]['summary']>;

export interface PublicParent {
  id: string;
  slug: string;
  media?: { url: string }[];
  callName: string;
  registeredName: string | null;
  breed: string;
  sex: 'MALE' | 'FEMALE';
  dateOfBirth: string | null;
  colorPattern: string | null;
  registrations: { id: string; body: string; number: string; isPrimary: boolean }[];
  verifiedClaims: ClaimRow[];
  reportedClaims: ReportedRow[];
  verificationSummary: VerificationSummary | null;
  pedigreeStats: { coi: number; generations: number; completenessRatio: number } | null;
  kennel: PublicKennel | null;
  sire: { slug: string; callName: string; registeredName: string | null } | null;
  damRel: { slug: string; callName: string; registeredName: string | null } | null;
}

export interface PublicKennel {
  id: string;
  slug: string;
  name: string;
  prefix: string | null;
  logoUrl?: string | null;
  coverUrl?: string | null;
  about: string | null;
  websiteUrl: string | null;
  city: string | null;
  region: string | null;
  country: string;
  latitude: number | null;
  longitude: number | null;
  foundedYear: number | null;
}

export interface PublicPuppy {
  id: string;
  birthOrder: number | null;
  name: string | null;
  collarColor: string | null;
  sex: 'MALE' | 'FEMALE';
  status: string;
  colorPattern: string | null;
  markings: string | null;
  priceCents: number | null;
  publicNotes: string | null;
  photoUrls: string[];
  latestWeightGrams: number | null;
}

export interface MarkerRisk {
  markerName: string;
  claimType: string;
  mode: string;
  sireStatus: string;
  damStatus: string;
  level: string;
  message: string;
  untestedSide: 'SIRE' | 'DAM' | 'BOTH' | null;
}

export interface LitterPage {
  listing: {
    id: string;
    slug: string;
    availability: string;
    priceCentsFrom: number | null;
    priceCentsTo: number | null;
    depositCents: number | null;
    priceNotes: string | null;
    headline: string | null;
    description: string | null;
    includedInPrice: string | null;
    buyerRequirements: string | null;
    goHomeFrom: string | null;
    photoUrls: string[];
    publishedAt: string | null;
    updatedAt: string;
  };
  litter: {
    id: string;
    letter: string | null;
    name: string | null;
    status: string;
    whelpedOn: string | null;
    expectedWhelpOn: string | null;
    liveBorn: number | null;
    totalBorn: number | null;
    neonatalDeaths: number;
  };
  sire: PublicParent;
  dam: PublicParent;
  kennel: PublicKennel | null;
  coi: {
    coi: number;
    band: string;
    relationship: string;
    sireCoi: number;
    damCoi: number;
    generations: number;
    confidence: string;
    confidenceNote: string;
    sireCompleteness: number;
    damCompleteness: number;
  };
  geneticRisk: {
    summary: string;
    worst: string;
    atRisk: MarkerRisk[];
    safe: MarkerRisk[];
    unknown: MarkerRisk[];
  };
  puppies: PublicPuppy[];
}

export interface BrowseRow {
  id: string;
  slug: string;
  availability: string;
  headline: string | null;
  priceCentsFrom: number | null;
  priceCentsTo: number | null;
  goHomeFrom: string | null;
  photoUrls: string[];
  publishedAt: string | null;
  cachedBreed: string | null;
  cachedRegion: string | null;
  cachedSireVerified: number;
  cachedDamVerified: number;
  cachedCoi: number | null;
  cachedAvailablePups: number;
  cachedTotalPups: number;
  distanceMiles: number | null;
  litter: {
    id: string;
    letter: string | null;
    status: string;
    whelpedOn: string | null;
    expectedWhelpOn: string | null;
    liveBorn: number | null;
    sire: { slug: string; callName: string; registeredName: string | null; breed: string };
    dam: {
      slug: string;
      callName: string;
      registeredName: string | null;
      breed: string;
      kennel: { slug: string; name: string; city: string | null; region: string | null } | null;
    };
    puppies: { id: string; status: string; sex: string }[];
  };
}

async function get<T>(path: string, revalidate = REVALIDATE_SECONDS): Promise<T | null> {
  const res = await fetch(`${API_URL}/v1${path}`, { next: { revalidate } });
  if (!res.ok) return null;
  return (await res.json()) as T;
}

export function browseLitters(query: string) {
  return get<{ listings: BrowseRow[]; total: number; note: string | null }>(
    `/litters/browse${query ? `?${query}` : ''}`,
  );
}

export function loadLitterPage(slug: string) {
  return get<LitterPage>(`/litters/public/${encodeURIComponent(slug)}`);
}

export function loadKennelPage(slug: string) {
  return get<KennelPage>(`/kennels/public/${encodeURIComponent(slug)}`);
}

export function loadPublicIndex() {
  return get<{
    listings: { slug: string; updatedAt: string; availability: string }[];
    kennels: { slug: string; updatedAt: string }[];
  }>('/litters/public-index', 3600);
}

export interface KennelPage {
  kennel: PublicKennel & { tagline: string | null; breeds: string[]; isPublished: boolean };
  dogs: {
    id: string;
    slug: string;
    callName: string;
    registeredName: string | null;
    breed: string;
    sex: 'MALE' | 'FEMALE';
    dateOfBirth: string | null;
    colorPattern: string | null;
    verificationSummary: VerificationSummary | null;
    pedigreeStats: { coi: number; generations: number } | null;
    studListing: { availability: string; studFeeCents: number | null } | null;
  }[];
  listings: (Pick<
    BrowseRow,
    'id' | 'slug' | 'availability' | 'headline' | 'priceCentsFrom' | 'priceCentsTo' | 'publishedAt'
  > & {
    litter: {
      whelpedOn: string | null;
      expectedWhelpOn: string | null;
      liveBorn: number | null;
      letter: string | null;
      sire: { slug: string; callName: string };
      dam: { slug: string; callName: string };
    };
  })[];
  stats: {
    dogCount: number;
    verifiedClaimCount: number;
    averageDensity: number;
    litterCount: number;
    breeds: string[];
  };
}

/** Human label for an availability value. Used in copy, titles and metadata. */
export const AVAILABILITY_LABEL: Record<string, string> = {
  PLANNED: 'Planned',
  EXPECTING: 'Expecting',
  AVAILABLE: 'Puppies Available',
  FULLY_RESERVED: 'Fully Reserved',
  PAST: 'Past Litter',
};

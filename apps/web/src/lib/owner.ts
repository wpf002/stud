import { cookies } from 'next/headers';
import type { ClaimPanel, VerificationDensity } from '@stud/ui';
import { API_URL } from './api';

/**
 * The owner portal reads.
 *
 * Never cached. This is a private record showing a specific person's dog, and
 * a shared cache entry on a page like this is how one owner ends up looking at
 * another's vet history.
 */
export type ClaimRow = Parameters<typeof ClaimPanel>[0]['verified'][number];
export type ReportedRow = Parameters<typeof ClaimPanel>[0]['reported'][number];
export type VerificationSummary = NonNullable<Parameters<typeof VerificationDensity>[0]['summary']>;

export interface HealthEvent {
  id: string;
  kind: string;
  occurredOn: string;
  title: string;
  detail: string | null;
  diagnosis: string | null;
  vetName: string | null;
  weightGrams: number | null;
  sharedWithBreeder: boolean;
  guaranteeRelevant: boolean;
  createdAt: string;
}

export interface Obligation {
  kind: string;
  party: 'BUYER' | 'BREEDER' | 'BOTH';
  title: string;
  detail: string;
  dueOn: string | null;
  expiresOn: string | null;
  active: boolean;
  overdue: boolean;
  clauseId: string;
}

export interface ParentSummary {
  id: string;
  slug: string;
  callName: string;
  registeredName: string | null;
  verifiedClaims: ClaimRow[];
  reportedClaims: ReportedRow[];
  verificationSummary: VerificationSummary | null;
}

export interface OwnedDog {
  id: string;
  slug: string;
  callName: string;
  registeredName: string | null;
  breed: string;
  sex: 'MALE' | 'FEMALE';
  dateOfBirth: string | null;
  colorPattern: string | null;
  markings: string | null;
  microchip: string | null;
  registrations: { id: string; body: string; number: string; isPrimary: boolean }[];
  verifiedClaims: ClaimRow[];
  reportedClaims: ReportedRow[];
  verificationSummary: VerificationSummary | null;
  healthEvents: HealthEvent[];
  sire: ParentSummary | null;
  damRel: ParentSummary | null;
  puppyRecord: {
    id: string;
    collarColor: string | null;
    birthOrder: number | null;
    birthWeightGrams: number | null;
    weights: { id: string; recordedOn: string; grams: number }[];
    litter: {
      id: string;
      letter: string | null;
      whelpedOn: string | null;
      liveBorn: number | null;
      dam: { slug: string; callName: string; kennel: { slug: string; name: string } | null };
      sire: { slug: string; callName: string };
    };
  } | null;
  ownerships: { userId: string; sharePercent: number; startedAt: string; reason: string | null }[];
}

export interface OwnedDogResponse {
  dog: OwnedDog;
  isOwner: boolean;
  breeder: { slug: string; name: string; city: string | null; region: string | null } | null;
  contract: {
    id: string;
    title: string;
    status: string;
    signedAt: string | null;
    contentHash: string | null;
    renderedText: string | null;
  } | null;
  handover: {
    collectedOn: string;
    collectedBy: string | null;
    microchipRegistered: boolean;
    registrationPapers: boolean;
    healthCertificate: boolean;
    vaccinationRecord: boolean;
    wormingRecord: boolean;
    microchipNumber: string | null;
    foodProvided: string | null;
    itemsProvided: string | null;
    vetExamDueBy: string | null;
  } | null;
  obligations: Obligation[];
  pedigree: {
    coi: number;
    band: string;
    confidence: string;
    confidenceNote: string;
    generations: number;
  } | null;
  growth: {
    latestGrams: number | null;
    ageDays: number | null;
    multipleOfBirthWeight: number | null;
    summary: string;
    flags: { kind: string; severity: string; message: string }[];
  } | null;
  earlyCare: { id: string; kind: string; title: string; dueOn: string; status: string }[];
  transferRule: { requiresReturnToBreeder: boolean; allowed: boolean; message: string };
}

export interface MyDogRow {
  id: string;
  slug: string;
  callName: string;
  registeredName: string | null;
  breed: string;
  sex: 'MALE' | 'FEMALE';
  dateOfBirth: string | null;
  colorPattern: string | null;
  microchip: string | null;
  verificationSummary: { verifiedCount: number; reportedCount: number; density: number } | null;
  sire: { slug: string; callName: string; registeredName: string | null } | null;
  damRel: { slug: string; callName: string; registeredName: string | null } | null;
  puppyRecord: {
    id: string;
    litter: { id: string; letter: string | null; dam: { kennel: { slug: string; name: string } | null } };
  } | null;
  healthEvents: HealthEvent[];
}

/** Returns `null` on 401 so a page can render its signed-out state. */
export async function ownerGet<T>(path: string): Promise<T | null | 'UNAUTHORIZED'> {
  const res = await fetch(`${API_URL}/v1${path}`, {
    headers: { cookie: (await cookies()).toString() },
    cache: 'no-store',
  });
  if (res.status === 401) return 'UNAUTHORIZED';
  if (!res.ok) return null;
  return (await res.json()) as T;
}

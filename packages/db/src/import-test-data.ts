/**
 * Import the synthetic test dataset (Phase 10 — seed at realistic scale).
 *
 *   pnpm db:import-test-data
 *
 * Reads fixtures/test-data.json, which is generated from the workbook by
 * scripts/xlsx-to-fixture.py. Idempotent: every write is an upsert keyed on a
 * slug derived from the workbook's own IDs, so re-running updates in place
 * rather than duplicating.
 *
 * This runs ALONGSIDE seed.ts, it does not replace it. seed.ts builds the
 * hand-authored demo (Blackwater, Cedar Run) that the walkthroughs depend on;
 * this adds volume so ranking, filtering and pagination are exercised against
 * ~280 dogs instead of ~35.
 *
 * Three mappings the workbook forces, none of them a straight copy:
 *
 *   · Litters.Status has four values against LitterAvailability's six.
 *     "Not Yet Ready (under 8 weeks)" is not a status — it is AVAILABLE with a
 *     goHomeFrom in the future, so it maps to a date, not an enum value.
 *   · Litter.sireId is required, but the workbook only names sires in prose
 *     ("Rocky (outside stud)"). Those become ancestor stubs, which is what
 *     isAncestorStub exists for.
 *   · StudListings carries "Booked through 2026-12-09". There is no column for
 *     that date until Phase 11 adds one; the parsed value is preserved in the
 *     fixture rather than discarded, and the listing is marked BOOKED here.
 */
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient, type Prisma } from '@prisma/client';
import { loadRootEnv } from './env.js';

loadRootEnv();
const db = new PrismaClient();

const HERE = dirname(fileURLToPath(import.meta.url));
const FIXTURE = join(HERE, '..', 'fixtures', 'test-data.json');
const PHOTOS = join(HERE, '..', 'fixtures', 'breed-photos.json');

interface BreedPhoto {
  wiki: string;
  url: string;
  file: string;
  license: string;
  artist: string;
}

interface BreederRow {
  breederId: string; businessName: string; contactName: string; city: string; state: string;
  primaryBreed: string; yearsInBusiness: number | null; registries: string[];
  credential: string | null; avgRating: number | null; reviewCount: number | null;
  stripeOnboarded: boolean;
}
interface StudOwnerRow {
  studOwnerId: string; ownerName: string; city: string; state: string; registries: string[];
  avgRating: number | null; reviewCount: number | null; stripeOnboarded: boolean;
}
interface DogRow {
  dogId: string; ownerType: 'Breeder' | 'StudOwner'; ownerId: string; name: string;
  breed: string; sex: 'Male' | 'Female'; dob: string | null; role: string; titles: string[];
}
interface HealthTestRow {
  testId: string; dogId: string; testType: string; result: string;
  certifyingBody: string; testDate: string | null; expiryDate: string | null;
}
interface LitterRow {
  litterId: string; breederId: string; damDogId: string; breed: string; sireName: string;
  whelpDate: string | null; puppiesTotal: number | null; puppiesAvailable: number | null;
  pricePerPuppy: number | null; status: string;
}
interface StudListingRow {
  listingId: string; dogId: string; studOwnerId: string; studFee: number | null;
  bookingStatus: string; bookedThrough: string | null; notes: string | null;
}
interface ReviewRow {
  reviewId: string; revieweeType: string; revieweeId: string; reviewerName: string;
  rating: number | null; comment: string; transactionType: string; reviewDate: string | null;
}

interface Fixture {
  breeds: { breed: string; group: string; rank: number | null }[];
  breeders: BreederRow[];
  studOwners: StudOwnerRow[];
  dogs: DogRow[];
  healthTests: HealthTestRow[];
  litters: LitterRow[];
  studListings: StudListingRow[];
  reviews: ReviewRow[];
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 80);
}

const date = (v: string | null | undefined) => (v ? new Date(`${v}T12:00:00Z`) : null);
const cents = (v: number | null | undefined) => (v == null ? null : Math.round(v * 100));

/** Workbook TestType -> the app's claimType vocabulary. */
const CLAIM_TYPE: Record<string, string> = {
  'OFA Hips': 'HIP',
  'OFA Elbows': 'ELBOW',
  'OFA Patella': 'PATELLA',
  'OFA Cardiac': 'CARDIAC',
  'OFA Eyes (CAER)': 'EYE_CAER',
  'DNA Health Panel': 'DNA_PANEL',
  Brucellosis: 'BRUCELLOSIS',
};

/**
 * Result string -> outcome. Grade I/II are elbow and patella dysplasia grades,
 * so they are abnormal findings, not passes — getting this backwards would
 * show a dysplastic dog as normal on a public listing.
 */
function outcomeOf(result: string): Prisma.VerifiedClaimCreateInput['outcome'] {
  const r = result.toLowerCase();
  if (r.startsWith('carrier')) return 'CARRIER';
  if (r.startsWith('grade')) return 'ABNORMAL';
  if (/^(normal|clear|negative|excellent|good|fair|pass)/.test(r)) return 'NORMAL';
  return 'INCONCLUSIVE';
}

const CATEGORY: Record<string, Prisma.VerifiedClaimCreateInput['category']> = {
  DNA_PANEL: 'GENETIC',
  BRUCELLOSIS: 'HEALTH',
};

/** Titles are performance/conformation records, not health results. */
const TITLE_CLAIM = 'TITLE_AWARD';

async function main() {
  const fx = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Fixture;
  const photos = JSON.parse(readFileSync(PHOTOS, 'utf8')) as Record<string, BreedPhoto>;

  /**
   * Attribution travels with the image. Most of these are CC BY-SA, which
   * requires credit wherever the photo is shown — storing it on the record
   * rather than in a doc nobody opens is the only version that survives.
   */
  const creditFor = (breed: string) => {
    const p = photos[breed];
    if (!p) return null;
    const who = p.artist || 'Unknown';
    return `${breed}. Photo: ${who}${p.license ? ` (${p.license})` : ''}, via Wikimedia Commons.`;
  };
  console.info('→ importing test dataset');

  // ── Kennels ───────────────────────────────────────────────────────────────
  // Stud owners become kennels too. In this schema a Dog hangs off a Kennel and
  // a review points at one, so an owner without a kennel has nowhere to put
  // either — a kennel of one is the honest mapping, not a workaround.
  const kennelIdBySourceId = new Map<string, string>();

  for (const b of fx.breeders) {
    const slug = slugify(`${b.breederId}-${b.businessName}`);
    const k = await db.kennel.upsert({
      where: { slug },
      update: { name: b.businessName, city: b.city, region: b.state, breeds: [b.primaryBreed] },
      create: {
        slug,
        name: b.businessName,
        city: b.city,
        region: b.state,
        breeds: [b.primaryBreed],
        foundedYear: b.yearsInBusiness ? new Date().getFullYear() - b.yearsInBusiness : null,
        isPublished: true,
        about: b.credential ? `${b.credential}. Registered with ${b.registries.join(', ')}.` : null,
      },
      select: { id: true },
    });
    kennelIdBySourceId.set(b.breederId, k.id);
  }

  for (const s of fx.studOwners) {
    const slug = slugify(`${s.studOwnerId}-${s.ownerName}`);
    const k = await db.kennel.upsert({
      where: { slug },
      update: { name: s.ownerName, city: s.city, region: s.state },
      create: {
        slug,
        name: s.ownerName,
        city: s.city,
        region: s.state,
        isPublished: true,
        about: s.registries.length ? `Registered with ${s.registries.join(', ')}.` : null,
      },
      select: { id: true },
    });
    kennelIdBySourceId.set(s.studOwnerId, k.id);
  }
  console.info(`  ✓ ${kennelIdBySourceId.size} kennels (breeders + stud owners)`);

  // ── Dogs ──────────────────────────────────────────────────────────────────
  const dogIdBySourceId = new Map<string, string>();
  for (const d of fx.dogs) {
    const slug = slugify(`${d.dogId}-${d.name}`);
    const dog = await db.dog.upsert({
      where: { slug },
      update: { breed: d.breed, kennelId: kennelIdBySourceId.get(d.ownerId) ?? null },
      create: {
        slug,
        callName: d.name,
        breed: d.breed,
        sex: d.sex === 'Male' ? 'MALE' : 'FEMALE',
        dateOfBirth: date(d.dob),
        kennelId: kennelIdBySourceId.get(d.ownerId) ?? null,
        isPublished: true,
      },
      select: { id: true },
    });
    dogIdBySourceId.set(d.dogId, dog.id);

    const photo = photos[d.breed];
    if (photo) {
      const existing = await db.dogMedia.findFirst({
        where: { dogId: dog.id, isPrimary: true },
        select: { id: true },
      });
      const data = { url: photo.url, caption: creditFor(d.breed) };
      if (existing) await db.dogMedia.update({ where: { id: existing.id }, data });
      else await db.dogMedia.create({ data: { dogId: dog.id, isPrimary: true, position: 0, ...data } });
    }
  }
  console.info(`  ✓ ${dogIdBySourceId.size} dogs (+ breed photos)`);

  // ── Titles ────────────────────────────────────────────────────────────────
  // Already filtered to the breed's own discipline by the converter.
  let titles = 0;
  for (const d of fx.dogs) {
    const dogId = dogIdBySourceId.get(d.dogId);
    if (!dogId) continue;
    for (const title of d.titles) {
      await db.verifiedClaim.upsert({
        where: {
          dogId_claimType_markerName_source: {
            dogId,
            claimType: TITLE_CLAIM,
            markerName: title,
            source: 'FIXTURE',
          },
        },
        update: {},
        create: {
          dogId,
          claimType: TITLE_CLAIM,
          markerName: title,
          category: 'TITLE',
          state: 'VERIFIED',
          source: 'FIXTURE',
          outcome: 'INFORMATIONAL',
          rawResult: title,
          lastCheckedAt: new Date(),
        },
      });
      titles += 1;
    }
  }
  console.info(`  ✓ ${titles} titles (breed-appropriate only)`);

  // ── Health tests ──────────────────────────────────────────────────────────
  let claims = 0;
  for (const t of fx.healthTests) {
    const dogId = dogIdBySourceId.get(t.dogId);
    const claimType = CLAIM_TYPE[t.testType];
    if (!dogId || !claimType) continue;
    await db.verifiedClaim.upsert({
      where: {
        dogId_claimType_markerName_source: { dogId, claimType, markerName: '', source: 'FIXTURE' },
      },
      update: { rawResult: t.result, outcome: outcomeOf(t.result) },
      create: {
        dogId,
        claimType,
        markerName: '',
        category: CATEGORY[claimType] ?? 'HEALTH',
        state: 'VERIFIED',
        source: 'FIXTURE',
        outcome: outcomeOf(t.result),
        rawResult: t.result,
        detail: t.certifyingBody,
        testedAt: date(t.testDate),
        // CAER eye exams and cardiac results expire; the workbook carries the
        // date and the schema already models it as staleAfter.
        staleAfter: date(t.expiryDate),
        lastCheckedAt: new Date(),
      },
    });
    claims += 1;
  }
  console.info(`  ✓ ${claims} health records`);

  // ── Litters ───────────────────────────────────────────────────────────────
  const AVAILABILITY: Record<string, Prisma.LitterListingCreateInput['availability']> = {
    Expected: 'EXPECTING',
    'Not Yet Ready (under 8 weeks)': 'AVAILABLE',
    'Available Now': 'AVAILABLE',
    'Sold Out': 'FULLY_RESERVED',
  };
  let litters = 0;
  for (const l of fx.litters) {
    const damId = dogIdBySourceId.get(l.damDogId);
    const kennelId = kennelIdBySourceId.get(l.breederId);
    if (!damId || !kennelId) continue;

    // Litter.sireId is required and the workbook only names the sire in prose.
    const sireSlug = slugify(`${l.litterId}-sire-${l.sireName}`);
    const sire = await db.dog.upsert({
      where: { slug: sireSlug },
      update: {},
      create: {
        slug: sireSlug,
        callName: l.sireName,
        breed: l.breed,
        sex: 'MALE',
        isAncestorStub: true,
      },
      select: { id: true },
    });

    const whelped = date(l.whelpDate);
    const isPast = whelped ? whelped.getTime() <= Date.now() : false;
    const litter = await db.litter.upsert({
      where: { id: `imp-${l.litterId}` },
      update: {},
      create: {
        id: `imp-${l.litterId}`,
        kennelId,
        sireId: sire.id,
        damId,
        status: isPast ? 'ON_THE_GROUND' : 'EXPECTED',
        expectedWhelpOn: isPast ? null : whelped,
        whelpedOn: isPast ? whelped : null,
        totalBorn: l.puppiesTotal,
        liveBorn: l.puppiesTotal,
      },
      select: { id: true },
    });

    // "Not Yet Ready" is a go-home date, not a status: eight weeks from whelp.
    const goHomeFrom =
      l.status === 'Not Yet Ready (under 8 weeks)' && whelped
        ? new Date(whelped.getTime() + 56 * 86_400_000)
        : whelped;

    await db.litterListing.upsert({
      where: { litterId: litter.id },
      update: {
        availability: AVAILABILITY[l.status] ?? 'NOT_LISTED',
        photoUrls: photos[l.breed] ? [photos[l.breed]!.url] : [],
      },
      create: {
        litterId: litter.id,
        slug: slugify(`${l.breed}-${l.litterId}`),
        availability: AVAILABILITY[l.status] ?? 'NOT_LISTED',
        priceCentsFrom: cents(l.pricePerPuppy),
        priceCentsTo: cents(l.pricePerPuppy),
        goHomeFrom,
        headline: `${l.breed} puppies`,
        photoUrls: photos[l.breed] ? [photos[l.breed]!.url] : [],
        // The listing has no field for a photo credit, so it rides in the
        // description, which is where a buyer actually sees the litter.
        description: creditFor(l.breed),
        cachedBreed: l.breed,
        cachedAvailablePups: l.puppiesAvailable ?? 0,
        cachedTotalPups: l.puppiesTotal ?? 0,
        publishedAt: new Date(),
      },
    });
    litters += 1;
  }
  console.info(`  ✓ ${litters} litters + listings`);

  // ── Stud listings ─────────────────────────────────────────────────────────
  let studs = 0;
  for (const s of fx.studListings) {
    const dogId = dogIdBySourceId.get(s.dogId);
    if (!dogId) continue;
    const semen: Prisma.StudListingCreateInput['semenTypes'] = (s.notes ?? '')
      .toLowerCase()
      .includes('chilled')
      ? ['NATURAL', 'CHILLED']
      : ['NATURAL'];
    await db.studListing.upsert({
      where: { dogId },
      update: { availability: s.bookingStatus === 'Booked' ? 'BOOKED' : 'AVAILABLE' },
      create: {
        dogId,
        availability: s.bookingStatus === 'Booked' ? 'BOOKED' : 'AVAILABLE',
        studFeeCents: cents(s.studFee),
        requirements: s.notes,
        semenTypes: semen,
        shipsSemen: (s.notes ?? '').toLowerCase().includes('chilled'),
        publishedAt: new Date(),
      },
    });
    studs += 1;
  }
  console.info(`  ✓ ${studs} stud listings`);

  // ── Reviews ───────────────────────────────────────────────────────────────
  // BreederReview needs a real author. Reviewers are synthetic, so they get
  // .invalid addresses — a reserved TLD that can never receive mail.
  let reviews = 0;
  for (const r of fx.reviews) {
    const kennelId = kennelIdBySourceId.get(r.revieweeId);
    if (!kennelId || r.rating == null) continue;
    const email = `reviewer-${r.reviewId.toLowerCase()}@seed.invalid`;
    const author = await db.user.upsert({
      where: { email },
      update: {},
      create: { email, name: r.reviewerName, displayName: r.reviewerName },
      select: { id: true },
    });
    await db.breederReview.upsert({
      where: { id: `imp-${r.reviewId}` },
      update: { overall: r.rating, body: r.comment },
      create: {
        id: `imp-${r.reviewId}`,
        kennelId,
        authorUserId: author.id,
        overall: r.rating,
        body: r.comment,
        title: r.transactionType,
        status: 'PUBLISHED',
        createdAt: date(r.reviewDate) ?? new Date(),
      },
    });
    reviews += 1;
  }
  console.info(`  ✓ ${reviews} reviews`);

  console.info('\n✓ import complete');
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await db.$disconnect();
  });

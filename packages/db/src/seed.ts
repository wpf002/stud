/**
 * Seed data. Grows with each phase; every phase's seed section is idempotent
 * so `pnpm db:seed` can be re-run against an existing database.
 *
 * The dogs here are fictional but the shape of the data is real: a GSP stud
 * with a documented five-generation pedigree, OFA panels and field titles is
 * exactly the wedge case the product was designed around.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
import {
  CONSENT_TEXT_V1,
  draftFromTemplate,
  renderContract,
} from '@stud/contracts';
import { buildSchedule, captureToEscrow } from '@stud/payments';
import { refreshListingCache } from './listing-service.js';
import { transferPuppyToOwner } from './transfer-service.js';
import { loadRootEnv } from './env.js';
import argon2 from 'argon2';

loadRootEnv();

const db = new PrismaClient();

const DEV_PASSWORD = 'studdev1234';

async function main() {
  console.info('→ seeding Stud');
  const passwordHash = await argon2.hash(DEV_PASSWORD, { type: argon2.argon2id });

  // ── Users ────────────────────────────────────────────────────────────────
  const breeder = await db.user.upsert({
    where: { email: 'breeder@stud.dev' },
    update: {},
    create: {
      email: 'breeder@stud.dev',
      passwordHash,
      emailVerified: new Date(),
      name: 'Jordan Hale',
      displayName: 'Jordan Hale',
      roles: ['BREEDER', 'OWNER'],
      city: 'Denton',
      region: 'TX',
      postalCode: '76201',
      latitude: 33.2148,
      longitude: -97.1331,
      bio: 'Third-generation GSP program. Hunt tests, NAVHDA, and a lot of early mornings.',
    },
  });

  const buyer = await db.user.upsert({
    where: { email: 'buyer@stud.dev' },
    update: {},
    create: {
      email: 'buyer@stud.dev',
      passwordHash,
      emailVerified: new Date(),
      name: 'Sam Ortiz',
      displayName: 'Sam Ortiz',
      roles: ['BUYER'],
      city: 'Fort Worth',
      region: 'TX',
      postalCode: '76102',
      latitude: 32.7555,
      longitude: -97.3308,
    },
  });

  const admin = await db.user.upsert({
    where: { email: 'admin@stud.dev' },
    update: {},
    create: {
      email: 'admin@stud.dev',
      passwordHash,
      emailVerified: new Date(),
      name: 'Stud Admin',
      displayName: 'Admin',
      roles: ['ADMIN'],
      city: 'Austin',
      region: 'TX',
    },
  });

  const studOwner = await db.user.upsert({
    where: { email: 'studowner@stud.dev' },
    update: {},
    create: {
      email: 'studowner@stud.dev',
      passwordHash,
      emailVerified: new Date(),
      name: 'Casey Lindqvist',
      displayName: 'Casey Lindqvist',
      roles: ['OWNER'],
      city: 'Tulsa',
      region: 'OK',
      latitude: 36.154,
      longitude: -95.9928,
      bio: 'One dog, one very good pedigree. Not a breeder — just an owner with a nice male.',
    },
  });

  console.info('  ✓ users');

  // ── Kennels ──────────────────────────────────────────────────────────────
  const blackwater = await db.kennel.upsert({
    where: { slug: 'blackwater-kennels' },
    update: {},
    create: {
      slug: 'blackwater-kennels',
      name: 'Blackwater Kennels',
      prefix: 'Blackwater',
      tagline: 'German Shorthaired Pointers bred for the marsh and the living room.',
      about:
        'We breed a small number of litters a year from proven hunting stock. Every breeding dog is OFA tested on hips, elbows, cardiac and eyes, and every dog in our program hunts.',
      city: 'Denton',
      region: 'TX',
      country: 'US',
      postalCode: '76201',
      latitude: 33.2148,
      longitude: -97.1331,
      breeds: ['German Shorthaired Pointer'],
      foundedYear: 2009,
      isPublished: true,
      memberships: { create: { userId: breeder.id, role: 'KENNEL_OWNER', acceptedAt: new Date() } },
    },
  });

  const cedarRun = await db.kennel.upsert({
    where: { slug: 'cedar-run-retrievers' },
    update: {},
    create: {
      slug: 'cedar-run-retrievers',
      name: 'Cedar Run Retrievers',
      prefix: 'Cedar Run',
      tagline: 'Golden Retrievers for service work and upland hunting.',
      city: 'Waco',
      region: 'TX',
      country: 'US',
      latitude: 31.5493,
      longitude: -97.1467,
      breeds: ['Golden Retriever'],
      foundedYear: 2016,
      isPublished: true,
      memberships: { create: { userId: breeder.id, role: 'KENNEL_OWNER', acceptedAt: new Date() } },
    },
  });

  console.info('  ✓ kennels');

  // ── Dogs ─────────────────────────────────────────────────────────────────
  type DogSeed = Omit<Prisma.DogCreateInput, 'kennel'> & {
    kennelId?: string;
    ownerId: string;
    registrations?: { body: Prisma.RegistrationCreateInput['body']; number: string; isPrimary?: boolean }[];
  };

  const dogSeeds: DogSeed[] = [
    {
      slug: 'blackwaters-ranger-of-the-marsh',
      callName: 'Ranger',
      registeredName: "Blackwater's Ranger Of The Marsh",
      breed: 'German Shorthaired Pointer',
      sex: 'MALE',
      dateOfBirth: new Date('2022-03-14'),
      colorPattern: 'Liver roan',
      markings: 'Liver head, ticked body, white blaze',
      heightCm: 63.5,
      weightKg: 29.5,
      microchip: '985141001234567',
      microchipIssuer: 'Datamars',
      temperamentNotes:
        'Biddable, high drive in the field, completely settled in the house. Good with children and other dogs.',
      isPublished: true,
      kennelId: blackwater.id,
      ownerId: breeder.id,
      registrations: [
        { body: 'AKC', number: 'SR91234501', isPrimary: true },
        { body: 'NAVHDA', number: 'NA-2023-4417' },
      ],
    },
    {
      slug: 'blackwaters-juniper',
      callName: 'Juniper',
      registeredName: "Blackwater's Juniper Wind",
      breed: 'German Shorthaired Pointer',
      sex: 'FEMALE',
      dateOfBirth: new Date('2021-09-02'),
      colorPattern: 'Liver and white ticked',
      heightCm: 59,
      weightKg: 25,
      temperamentNotes: 'Quieter than Ranger. Exceptional nose, softer handling.',
      isPublished: true,
      kennelId: blackwater.id,
      ownerId: breeder.id,
      registrations: [{ body: 'AKC', number: 'SR88451102', isPrimary: true }],
    },
    {
      slug: 'cedar-run-atlas',
      callName: 'Atlas',
      registeredName: "Cedar Run's Atlas Unbound",
      breed: 'Golden Retriever',
      sex: 'MALE',
      dateOfBirth: new Date('2021-05-21'),
      colorPattern: 'Mid golden',
      heightCm: 60,
      weightKg: 34,
      temperamentNotes: 'Placed two service prospects from his last litter. Extremely stable.',
      isPublished: true,
      kennelId: cedarRun.id,
      ownerId: breeder.id,
      registrations: [{ body: 'AKC', number: 'SS12009944', isPrimary: true }],
    },
    {
      slug: 'cedar-run-marigold',
      callName: 'Marigold',
      registeredName: "Cedar Run's Marigold",
      breed: 'Golden Retriever',
      sex: 'FEMALE',
      dateOfBirth: new Date('2022-01-08'),
      colorPattern: 'Light golden',
      heightCm: 55,
      weightKg: 28,
      isPublished: true,
      kennelId: cedarRun.id,
      ownerId: breeder.id,
      registrations: [{ body: 'AKC', number: 'SS14883201', isPrimary: true }],
    },
    {
      slug: 'lindqvists-jack-of-tulsa',
      callName: 'Jack',
      registeredName: "Lindqvist's Jack Of Tulsa",
      breed: 'German Shorthaired Pointer',
      sex: 'MALE',
      dateOfBirth: new Date('2021-11-30'),
      colorPattern: 'Solid liver',
      heightCm: 64,
      weightKg: 31,
      temperamentNotes:
        'Owned, not bred, by me. Complete pedigree back to his great-grandparents and a stack of hunt test ribbons.',
      isPublished: true,
      ownerId: studOwner.id,
      registrations: [{ body: 'AKC', number: 'SR94002218', isPrimary: true }],
    },
  ];

  for (const { kennelId, ownerId, registrations, ...dog } of dogSeeds) {
    const record = await db.dog.upsert({
      where: { slug: dog.slug },
      update: {},
      create: { ...dog, ...(kennelId ? { kennel: { connect: { id: kennelId } } } : {}) },
    });

    for (const reg of registrations ?? []) {
      await db.registration.upsert({
        where: { body_number: { body: reg.body, number: reg.number } },
        update: {},
        create: { dogId: record.id, body: reg.body, number: reg.number, isPrimary: reg.isPrimary ?? false },
      });
    }

    const owned = await db.dogOwnership.findFirst({ where: { dogId: record.id, endedAt: null } });
    if (!owned) {
      await db.dogOwnership.create({
        data: { dogId: record.id, userId: ownerId, reason: 'initial', sharePercent: 100 },
      });
    }
  }

  console.info('  ✓ dogs, registrations, ownerships');

  // ── Phase 1: a real five-generation pedigree ─────────────────────────────
  //
  // Ranger's papers, as a breeder would actually have them. Two ancestors are
  // line-bred on purpose so the COI is a real number rather than zero:
  //
  //   · Marshland Drake  appears as Ranger's paternal AND maternal
  //                      great-grandsire  → the main contributor
  //   · Rivergate Willow appears twice on the sire side
  //
  // Wright's formula over this graph gives a COI a human can check by hand,
  // which is exactly what the Phase 1 gate asks for.
  type Anc = {
    slug: string;
    call: string;
    registered: string;
    sex: 'MALE' | 'FEMALE';
    reg?: string;
    year: number;
    sire?: string;
    dam?: string;
  };

  const GSP = 'German Shorthaired Pointer';

  // Generation 6 → 1, ordered so every parent exists before its child. This
  // gives Ranger five genuinely populated generations.
  const ancestry: Anc[] = [
    // ── Gen 6 (foundation stock) ──
    { slug: 'harrow-lane-pike', call: 'Pike', registered: 'Harrow Lane Pike', sex: 'MALE', reg: 'SR15220301', year: 2005 },
    { slug: 'harrow-lane-juno', call: 'Juno', registered: 'Harrow Lane Juno', sex: 'FEMALE', reg: 'SR15220302', year: 2005 },
    { slug: 'cold-spring-basil', call: 'Basil', registered: 'Cold Spring Basil', sex: 'MALE', reg: 'SR16003311', year: 2006 },
    { slug: 'cold-spring-nettle', call: 'Nettle', registered: 'Cold Spring Nettle', sex: 'FEMALE', reg: 'SR16003312', year: 2006 },
    { slug: 'wideacre-colt', call: 'Colt', registered: 'Wideacre Colt', sex: 'MALE', reg: 'SR16880501', year: 2006 },
    { slug: 'wideacre-saffron', call: 'Saffron', registered: 'Wideacre Saffron', sex: 'FEMALE', reg: 'SR16880502', year: 2006 },
    { slug: 'longmeadow-rook', call: 'Rook', registered: 'Longmeadow Rook', sex: 'MALE', reg: 'SR17441101', year: 2007 },
    { slug: 'longmeadow-vesta', call: 'Vesta', registered: 'Longmeadow Vesta', sex: 'FEMALE', reg: 'SR17441102', year: 2007 },

    // ── Gen 5 ──
    { slug: 'old-mill-brandt', call: 'Brandt', registered: 'Old Mill Brandt', sex: 'MALE', reg: 'SR20114402', year: 2008, sire: 'harrow-lane-pike', dam: 'harrow-lane-juno' },
    { slug: 'old-mill-freya', call: 'Freya', registered: 'Old Mill Freya', sex: 'FEMALE', reg: 'SR20114403', year: 2008, sire: 'cold-spring-basil', dam: 'cold-spring-nettle' },
    { slug: 'kettle-creek-ash', call: 'Ash', registered: 'Kettle Creek Ash', sex: 'MALE', reg: 'SR21550801', year: 2009, sire: 'wideacre-colt', dam: 'wideacre-saffron' },
    { slug: 'kettle-creek-birdie', call: 'Birdie', registered: 'Kettle Creek Birdie', sex: 'FEMALE', reg: 'SR21550802', year: 2009, sire: 'longmeadow-rook', dam: 'longmeadow-vesta' },
    { slug: 'north-fork-gunner', call: 'Gunner', registered: 'North Fork Gunner', sex: 'MALE', reg: 'SR22901101', year: 2009, sire: 'harrow-lane-pike', dam: 'cold-spring-nettle' },
    { slug: 'north-fork-clover', call: 'Clover', registered: 'North Fork Clover', sex: 'FEMALE', reg: 'SR22901102', year: 2010, sire: 'wideacre-colt', dam: 'longmeadow-vesta' },
    { slug: 'stone-ridge-cass', call: 'Cass', registered: 'Stone Ridge Cass', sex: 'MALE', reg: 'SR23400501', year: 2010, sire: 'cold-spring-basil', dam: 'harrow-lane-juno' },
    { slug: 'stone-ridge-pearl', call: 'Pearl', registered: 'Stone Ridge Pearl', sex: 'FEMALE', reg: 'SR23400502', year: 2010, sire: 'longmeadow-rook', dam: 'wideacre-saffron' },

    // ── Gen 4 — the two line-bred ancestors ──
    { slug: 'marshland-drake', call: 'Drake', registered: 'FC Marshland Drake', sex: 'MALE', reg: 'SR51002288', year: 2012, sire: 'old-mill-brandt', dam: 'old-mill-freya' },
    { slug: 'rivergate-willow', call: 'Willow', registered: 'Rivergate Willow', sex: 'FEMALE', reg: 'SR51330904', year: 2012, sire: 'kettle-creek-ash', dam: 'kettle-creek-birdie' },
    { slug: 'north-fork-tessa', call: 'Tessa', registered: 'North Fork Tessa', sex: 'FEMALE', reg: 'SR52110307', year: 2013, sire: 'north-fork-gunner', dam: 'north-fork-clover' },
    { slug: 'stone-ridge-hoyt', call: 'Hoyt', registered: 'Stone Ridge Hoyt', sex: 'MALE', reg: 'SR52880110', year: 2013, sire: 'stone-ridge-cass', dam: 'stone-ridge-pearl' },

    // ── Gen 3 — Drake on both sides, Willow twice on the sire side ──
    { slug: 'blackwaters-tern', call: 'Tern', registered: "Blackwater's Tern", sex: 'MALE', reg: 'SR61220101', year: 2015, sire: 'marshland-drake', dam: 'rivergate-willow' },
    { slug: 'blackwaters-reed', call: 'Reed', registered: "Blackwater's Reed", sex: 'FEMALE', reg: 'SR61220102', year: 2015, sire: 'stone-ridge-hoyt', dam: 'rivergate-willow' },
    { slug: 'marshland-teal', call: 'Teal', registered: 'Marshland Teal', sex: 'MALE', reg: 'SR62009911', year: 2016, sire: 'marshland-drake', dam: 'north-fork-tessa' },
    { slug: 'rivergate-thistle', call: 'Thistle', registered: 'Rivergate Thistle', sex: 'FEMALE', reg: 'SR53001177', year: 2016, sire: 'stone-ridge-hoyt', dam: 'north-fork-tessa' },

    // ── Gen 2 ──
    { slug: 'blackwaters-storm', call: 'Storm', registered: "CH Blackwater's Storm", sex: 'MALE', reg: 'SR75110203', year: 2018, sire: 'blackwaters-tern', dam: 'blackwaters-reed' },
    { slug: 'blackwaters-wren', call: 'Wren', registered: "Blackwater's Wren", sex: 'FEMALE', reg: 'SR52883101', year: 2018, sire: 'marshland-teal', dam: 'rivergate-thistle' },
  ];

  const ancIds = new Map<string, string>();
  for (const a of ancestry) {
    const parents = {
      sireId: a.sire ? (ancIds.get(a.sire) ?? null) : null,
      damId: a.dam ? (ancIds.get(a.dam) ?? null) : null,
    };
    const record = await db.dog.upsert({
      where: { slug: a.slug },
      // Ancestry IS updated on re-seed. An empty `update` here would leave
      // rows from an earlier, shallower version of this fixture unlinked —
      // which silently produces a different COI than the one intended.
      update: parents,
      create: {
        slug: a.slug,
        callName: a.call,
        registeredName: a.registered,
        breed: GSP,
        sex: a.sex,
        dateOfBirth: new Date(`${a.year}-05-01`),
        isAncestorStub: true,
        isPublished: false,
        ...parents,
      },
    });
    ancIds.set(a.slug, record.id);

    if (a.reg) {
      await db.registration.upsert({
        where: { body_number: { body: 'AKC', number: a.reg } },
        update: {},
        create: { dogId: record.id, body: 'AKC', number: a.reg, nameOnRecord: a.registered, isPrimary: true },
      });
    }
  }

  // Ranger and Juniper are Storm × Wren siblings from Phase 0's seed; wire
  // their parents so the five-generation pedigree hangs off a real dog.
  await db.dog.update({
    where: { slug: 'blackwaters-ranger-of-the-marsh' },
    data: { sireId: ancIds.get('blackwaters-storm')!, damId: ancIds.get('blackwaters-wren')! },
  });
  await db.dog.update({
    where: { slug: 'blackwaters-juniper' },
    data: { sireId: ancIds.get('marshland-teal')!, damId: ancIds.get('blackwaters-reed')! },
  });

  // A deliberate near-duplicate for the merge tool to find: same dog, kennel
  // prefix dropped and one letter different. This is exactly the shape of the
  // record that quietly halves a COI in production.
  await db.dog.upsert({
    where: { slug: 'marshland-drake-dup' },
    update: {},
    create: {
      slug: 'marshland-drake-dup',
      callName: 'Drake',
      registeredName: 'Marshland Drake',
      breed: GSP,
      sex: 'MALE',
      dateOfBirth: new Date('2012-05-01'),
      isAncestorStub: true,
      isPublished: false,
    },
  });

  console.info('  ✓ five-generation pedigree + a planted duplicate');

  // ── Phase 2: verification ────────────────────────────────────────────────
  //
  // Runs the real engine against the fixture source, so the seeded database
  // contains genuine claims with genuine audit trails rather than hand-written
  // rows. Everything below went through the same state machine production uses.
  const { VerificationEngine } = await import('@stud/verify');
  const { runVerification, recomputeSummary } = await import('./verification-service.js');

  const engine = new VerificationEngine({ liveSources: false });

  const toVerify = await db.dog.findMany({
    where: { registrations: { some: {} }, supersededByDogId: null },
    select: { id: true, callName: true, registrations: { select: { number: true, body: true } } },
  });

  let claimTotal = 0;
  for (const dog of toVerify) {
    const outcome = await runVerification(db, engine, {
      dogId: dog.id,
      identifiers: dog.registrations.map((r) => ({ number: r.number, body: r.body })),
      actor: { id: null, type: 'system' },
    });
    claimTotal += outcome.claimsCreated;
  }
  console.info(`  ✓ verification — ${claimTotal} claims across ${toVerify.length} dogs`);

  // A real CONFLICTED claim, produced the honest way.
  //
  // The fixture's Atlas record carries an amendment: his hips read "Good" on
  // the original submission and "Fair" after a re-read. We rewind his stored
  // claim to the original value — as if we had verified it back then — and run
  // the engine again. The divergence is detected by the same code path a live
  // OFA amendment would hit, and the held value is preserved for the reviewer
  // rather than silently overwritten.
  const atlas = await db.dog.findUnique({
    where: { slug: 'cedar-run-atlas' },
    select: { id: true, registrations: { select: { number: true, body: true } } },
  });
  if (atlas) {
    await db.verifiedClaim.updateMany({
      where: { dogId: atlas.id, claimType: 'HIP' },
      data: { rawResult: 'Good', outcome: 'NORMAL' },
    });
    const conflicted = await runVerification(db, engine, {
      dogId: atlas.id,
      identifiers: atlas.registrations.map((r) => ({ number: r.number, body: r.body })),
      actor: { id: null, type: 'system' },
    });
    await recomputeSummary(db, atlas.id);
    console.info(`  ✓ seeded ${conflicted.conflicts} conflict for the admin queue`);
  }

  // Self-reported claims, so both tiers are visible side by side. These live
  // in a different table and can never become verified (invariant 5).
  const jack = await db.dog.findUnique({ where: { slug: 'lindqvists-jack-of-tulsa' }, select: { id: true } });
  if (jack) {
    for (const claim of [
      { claimType: 'HIP', statedResult: 'Vet says they look good', note: 'Not submitted to OFA yet.' },
      { claimType: 'TITLE_FIELD', statedResult: 'Placed 3rd at a local trial' },
    ]) {
      await db.reportedClaim.upsert({
        where: { dogId_claimType_markerName: { dogId: jack.id, claimType: claim.claimType, markerName: '' } },
        update: {},
        create: {
          dogId: jack.id,
          claimType: claim.claimType,
          category: claim.claimType === 'HIP' ? 'HEALTH' : 'PERFORMANCE',
          statedResult: claim.statedResult,
          note: 'note' in claim ? claim.note : null,
          reportedByUserId: studOwner.id,
        },
      });
    }
    await recomputeSummary(db, jack.id);
    console.info('  ✓ reported claims (owner-attested tier)');
  }

  // ── Phase 3: a full breeding cycle, whelp to eight weeks ─────────────────
  //
  // Seeded backwards from today so the workspace always shows a litter in the
  // middle of its life rather than a fixed date that goes stale.
  const DAY = 86_400_000;
  const today = new Date();
  const at = (daysAgo: number) => new Date(today.getTime() - daysAgo * DAY);

  const juniper = await db.dog.findUnique({ where: { slug: 'blackwaters-juniper' }, select: { id: true } });
  const ranger = await db.dog.findUnique({ where: { slug: 'blackwaters-ranger-of-the-marsh' }, select: { id: true } });
  const marigold = await db.dog.findUnique({ where: { slug: 'cedar-run-marigold' }, select: { id: true } });
  const atlasDog = await db.dog.findUnique({ where: { slug: 'cedar-run-atlas' }, select: { id: true } });

  if (juniper && ranger) {
    // Three prior heats, so the prediction has her own interval to work from
    // rather than a breed average.
    const priorHeats = [at(560), at(378), at(190)];
    for (const startedOn of priorHeats) {
      const exists = await db.heatCycle.findFirst({ where: { dogId: juniper.id, startedOn } });
      if (!exists) await db.heatCycle.create({ data: { dogId: juniper.id, startedOn } });
    }

    // The cycle she was bred on, with a real progesterone series that crosses
    // both thresholds — so the interpretation has something to interpret.
    const bredHeatStart = at(58 + 12);
    let bredHeat = await db.heatCycle.findFirst({ where: { dogId: juniper.id, startedOn: bredHeatStart } });
    if (!bredHeat) {
      bredHeat = await db.heatCycle.create({
        data: {
          dogId: juniper.id,
          startedOn: bredHeatStart,
          endedOn: at(58 - 6),
          notes: 'Straightforward cycle. Flagging by day 9.',
        },
      });
      const series: [number, number][] = [
        [58 + 6, 0.4],
        [58 + 4, 1.1],
        [58 + 2, 2.6],
        [58, 6.4],
      ];
      for (const [daysAgo, value] of series) {
        await db.progesteroneTest.create({
          data: { heatCycleId: bredHeat.id, takenOn: at(daysAgo), value, unit: 'NG_ML', lab: 'Denton Vet' },
        });
      }
    }

    // Ovulation 58 days ago → whelp at 63 days from ovulation, i.e. 5 days
    // from now. The litter below is the PREVIOUS one, already on the ground.
    let breeding = await db.breeding.findFirst({ where: { damId: juniper.id, sireId: ranger.id } });
    if (!breeding) {
      breeding = await db.breeding.create({
        data: {
          sireId: ranger.id,
          damId: juniper.id,
          heatCycleId: bredHeat.id,
          kennelId: blackwater.id,
          method: 'NATURAL',
          status: 'CONFIRMED_PREGNANT',
          ovulationDate: at(58),
          lhSurgeDate: at(60),
          ultrasoundOn: at(30),
          ultrasoundResult: 'Pregnancy confirmed, multiple sacs',
          xrayOn: at(3),
          xrayPuppyCount: 8,
        },
      });
      for (const daysAgo of [56, 54]) {
        await db.breedingEvent.create({
          data: { breedingId: breeding.id, occurredOn: at(daysAgo), method: 'NATURAL', tieMinutes: 22 },
        });
      }
      await db.litter.create({
        data: {
          breedingId: breeding.id,
          kennelId: blackwater.id,
          sireId: ranger.id,
          damId: juniper.id,
          letter: 'B',
          status: 'EXPECTED',
          expectedWhelpOn: new Date(at(58).getTime() + 63 * DAY),
        },
      });
    }
    console.info('  ✓ heat cycles, progesterone series, breeding (due in 5 days)');
  }

  // ── A litter on the ground at 18 days, mid growth-tracking ───────────────
  if (marigold && atlasDog) {
    const whelpedOn = at(18);
    let litter = await db.litter.findFirst({ where: { damId: marigold.id, letter: 'A' } });
    if (!litter) {
      litter = await db.litter.create({
        data: {
          kennelId: cedarRun.id,
          sireId: atlasDog.id,
          damId: marigold.id,
          letter: 'A',
          status: 'ON_THE_GROUND',
          whelpedOn,
          whelpingNotes: 'Straightforward whelp, six hours start to finish. One small male needed help latching.',
        },
      });

      const pups: { collar: string; sex: 'MALE' | 'FEMALE'; birth: number; struggling?: boolean }[] = [
        { collar: 'Green', sex: 'MALE', birth: 420 },
        { collar: 'Blue', sex: 'MALE', birth: 445 },
        { collar: 'Red', sex: 'FEMALE', birth: 398 },
        { collar: 'Yellow', sex: 'FEMALE', birth: 410 },
        { collar: 'Orange', sex: 'MALE', birth: 388 },
        // The runt. Seeded to actually trip the growth flags rather than to
        // look tidy — a demo where nothing is ever wrong teaches nothing.
        { collar: 'Purple', sex: 'FEMALE', birth: 330, struggling: true },
      ];

      for (const [i, pup] of pups.entries()) {
        const puppy = await db.puppy.create({
          data: {
            litterId: litter.id,
            birthOrder: i + 1,
            collarColor: pup.collar,
            sex: pup.sex,
            birthWeightGrams: pup.birth,
            colorPattern: 'Golden',
            bornAt: new Date(whelpedOn.getTime() + i * 40 * 60_000),
            status: i < 4 ? 'AVAILABLE' : 'RESERVED',
          },
        });

        // Daily weights. The healthy puppies track the band; the runt falls off it.
        for (let day = 0; day <= 18; day++) {
          const growth = pup.struggling
            ? 1 + day * 0.048 // reaches only ~1.9x by day 18 — fails to double
            : 1 + day * 0.085;
          await db.puppyWeight.create({
            data: {
              puppyId: puppy.id,
              recordedOn: new Date(whelpedOn.getTime() + day * DAY),
              grams: Math.round(pup.birth * growth),
            },
          });
        }
      }

      await db.litter.update({
        where: { id: litter.id },
        data: { totalBorn: pups.length, liveBorn: pups.length, stillborn: 0 },
      });

      for (const e of [
        { kind: 'contraction', note: 'Hard contractions started', mins: 0 },
        { kind: 'puppy_born', note: '#1 green male 420 g', mins: 35 },
        { kind: 'placenta', note: null, mins: 42 },
        { kind: 'rest', note: 'Settled for 40 minutes', mins: 80 },
        { kind: 'note', note: 'Purple female slow to latch — tube fed 2 ml', mins: 320 },
      ]) {
        await db.whelpingEvent.create({
          data: {
            litterId: litter.id,
            kind: e.kind,
            note: e.note,
            occurredAt: new Date(whelpedOn.getTime() + e.mins * 60_000),
          },
        });
      }
      console.info('  ✓ litter on the ground at 18 days, 6 puppies with daily weights');
    }

    // Generate the care schedule the same way the API does.
    const { generateCareSchedule } = await import('@stud/breeding');
    const tasks = generateCareSchedule(whelpedOn, today).filter((t) => t.kind !== 'WEIGHING');
    for (const t of tasks) {
      await db.careTask.upsert({
        where: { dedupeKey: `litter:${litter.id}:${t.key}` },
        update: { dueOn: t.dueOn },
        create: {
          litterId: litter.id,
          kind: t.kind,
          title: t.title,
          detail: t.detail,
          dueOn: t.dueOn,
          required: t.required,
          generatedKey: t.key,
          dedupeKey: `litter:${litter.id}:${t.key}`,
          // Everything already past is marked done except the most recent, so
          // the dashboard has exactly one honest overdue item.
          status: t.dueOn < new Date(today.getTime() - 2 * DAY) ? 'DONE' : 'PENDING',
          completedOn: t.dueOn < new Date(today.getTime() - 2 * DAY) ? t.dueOn : null,
        },
      });
    }
    console.info(`  ✓ care schedule — ${tasks.length} tasks`);
  }

  // ── Phase 4: stud listings and an inquiry ────────────────────────────────
  const studListings: {
    slug: string;
    feeCents: number;
    availability: 'AVAILABLE' | 'LIMITED' | 'BOOKED';
    semen: ('NATURAL' | 'FRESH' | 'CHILLED' | 'FROZEN')[];
    ships: boolean;
    radius: number;
    temperament: string;
    requirements: string;
  }[] = [
    {
      slug: 'blackwaters-ranger-of-the-marsh',
      feeCents: 220000,
      availability: 'AVAILABLE',
      semen: ['NATURAL', 'CHILLED', 'FROZEN'],
      ships: true,
      radius: 400,
      temperament:
        'Biddable, high drive in the field, completely settled in the house. Good with children and other dogs.',
      requirements:
        'OFA hips and elbows on the bitch, current brucellosis, and a signed stud contract. Happy to discuss co-ownership for the right home.',
    },
    {
      slug: 'lindqvists-jack-of-tulsa',
      feeCents: 120000,
      availability: 'LIMITED',
      semen: ['NATURAL'],
      ships: false,
      radius: 150,
      temperament:
        'Big personality, very handler-focused. Not a kennel dog — he lives in the house and behaves like it.',
      requirements:
        'I am not a breeder, so I lean on the bitch owner for the paperwork. Health testing required.',
    },
    {
      slug: 'cedar-run-atlas',
      feeCents: 175000,
      availability: 'AVAILABLE',
      semen: ['NATURAL', 'CHILLED'],
      ships: true,
      radius: 250,
      temperament: 'Placed two service prospects from his last litter. Extremely stable.',
      requirements: 'Health testing and a signed contract.',
    },
  ];

  for (const l of studListings) {
    const dog = await db.dog.findUnique({
      where: { slug: l.slug },
      select: { id: true, verificationSummary: true, pedigreeStats: true },
    });
    if (!dog) continue;
    await db.studListing.upsert({
      where: { dogId: dog.id },
      update: { availability: l.availability, studFeeCents: l.feeCents, publishedAt: new Date() },
      create: {
        dogId: dog.id,
        availability: l.availability,
        studFeeCents: l.feeCents,
        semenTypes: l.semen,
        shipsSemen: l.ships,
        travelRadiusMiles: l.radius,
        willTravel: l.radius > 200,
        temperamentNotes: l.temperament,
        requirements: l.requirements,
        cachedVerifiedCount: dog.verificationSummary?.verifiedCount ?? 0,
        cachedDensity: dog.verificationSummary?.density ?? 0,
        cachedCoi: dog.pedigreeStats?.coi ?? null,
        publishedAt: new Date(),
      },
    });
    await db.dog.update({ where: { id: dog.id }, data: { isPublished: true } });
  }
  console.info(`  ✓ ${studListings.length} stud listings published`);

  // A carrier × carrier pairing, so the genetic risk detector has something
  // real to catch. Ranger is Clear and Juniper is a Carrier for Cone
  // Degeneration in the fixture data, which is safe — so Atlas is given the
  // same carrier status to create a genuinely at-risk match with Juniper.
  const atlasForRisk = await db.dog.findUnique({ where: { slug: 'cedar-run-atlas' }, select: { id: true } });
  if (atlasForRisk) {
    const now = new Date();
    await db.verifiedClaim.upsert({
      where: {
        dogId_claimType_markerName_source: {
          dogId: atlasForRisk.id,
          claimType: 'DNA_MARKER',
          markerName: 'Cone Degeneration (CD)',
          source: 'FIXTURE',
        },
      },
      update: { outcome: 'CARRIER', rawResult: 'Carrier', state: 'VERIFIED' },
      create: {
        dogId: atlasForRisk.id,
        claimType: 'DNA_MARKER',
        markerName: 'Cone Degeneration (CD)',
        category: 'GENETIC',
        source: 'FIXTURE',
        state: 'VERIFIED',
        outcome: 'CARRIER',
        rawResult: 'Carrier',
        testedAt: new Date('2023-05-02'),
        lastCheckedAt: now,
        staleAfter: new Date(now.getTime() + 30 * 86_400_000),
        matchedIdentifier: 'SS12009944',
      },
    });
    await recomputeSummary(db, atlasForRisk.id);
    console.info('  ✓ seeded a carrier × carrier pairing for the risk detector');
  }

  // An inquiry in the stud owner's inbox, with the pairing numbers attached.
  const rangerListing = await db.studListing.findFirst({
    where: { dog: { slug: 'blackwaters-ranger-of-the-marsh' } },
    select: { id: true, dogId: true },
  });
  const marigoldForInquiry = await db.dog.findUnique({
    where: { slug: 'cedar-run-marigold' },
    select: { id: true, verificationSummary: true },
  });
  if (rangerListing && marigoldForInquiry) {
    const existing = await db.studInquiry.findFirst({
      where: { studListingId: rangerListing.id, damId: marigoldForInquiry.id },
    });
    if (!existing) {
      await db.studInquiry.create({
        data: {
          studListingId: rangerListing.id,
          damId: marigoldForInquiry.id,
          fromUserId: studOwner.id,
          message:
            "I have been watching Ranger's NAVHDA results for a while and think he would suit my Marigold well. She is due in season around October. Happy to travel or to use chilled — whichever suits you. I can send her full panel and her hip films.",
          proposedSeason: 'October 2026',
          proposedMethod: 'Chilled',
          projectedCoi: 0,
          coiGenerations: 6,
          geneticRiskSummary: 'Both dogs are tested and clear across all shared markers.',
          atRiskMarkerCount: 0,
          damVerifiedCount: marigoldForInquiry.verificationSummary?.verifiedCount ?? 0,
        },
      });
      console.info('  ✓ a stud inquiry waiting in the inbox');
    }
  }

  // ── Phase 5: the breeding transaction ────────────────────────────────────
  //
  // The inquiry above becomes an agreement. This section seeds the whole
  // lifecycle so the gate — template to signed to paid to litter-linked — is
  // visible in the app without anyone having to click through it first.
  //
  // Everything is built with the same pure functions the API uses, so the
  // seeded contract hashes to exactly what a real one would.
  const rangerForContract = await db.dog.findUnique({
    where: { slug: 'blackwaters-ranger-of-the-marsh' },
    select: { id: true, callName: true, registeredName: true },
  });
  const marigoldForContract = await db.dog.findUnique({
    where: { slug: 'cedar-run-marigold' },
    select: { id: true, callName: true, registeredName: true },
  });

  if (rangerForContract && marigoldForContract) {
    // The breeding the contract is about: chilled semen shipped from Blackwater
    // to Cedar Run, ovulation 35 days ago, pregnancy confirmed on ultrasound.
    let studBreeding = await db.breeding.findFirst({
      where: { sireId: rangerForContract.id, damId: marigoldForContract.id },
    });
    if (!studBreeding) {
      studBreeding = await db.breeding.create({
        data: {
          sireId: rangerForContract.id,
          damId: marigoldForContract.id,
          kennelId: cedarRun.id,
          method: 'AI_CHILLED',
          status: 'CONFIRMED_PREGNANT',
          ovulationDate: at(35),
          lhSurgeDate: at(37),
          ultrasoundOn: at(6),
          ultrasoundResult: 'Pregnancy confirmed, five to seven sacs',
        },
      });
      await db.breedingEvent.create({
        data: { breedingId: studBreeding.id, occurredOn: at(33), method: 'AI_CHILLED' },
      });
      // The chain of custody. If this breeding had missed, this record is the
      // difference between a dispute about the stud and one about the courier.
      await db.collectionRecord.create({
        data: {
          breedingId: studBreeding.id,
          collectedOn: at(34),
          collectedBy: 'Dr. Renata Vance',
          clinic: 'Denton Veterinary Reproduction',
          volumeMl: 4.2,
          concentrationMkml: 310,
          motilityPercent: 88,
          morphologyPercent: 91,
          totalMotileMillions: 1145,
          shippedOn: at(34),
          shippingCarrier: 'FedEx Priority Overnight',
          trackingNumber: '7749 2210 8834',
          receivedOn: at(33),
          receivedCondition: 'Arrived 06:40, coolant still firm, 4°C. Motility 82% on arrival.',
          inseminatedOn: at(33),
          inseminatedBy: 'Dr. Amara Iyer',
          method: 'TCI',
          notes: 'Second insemination not required — progesterone timing was clean.',
        },
      });
    }

    // ── The contract itself ──
    //
    // $2,200 stud fee: $800 on signing, $1,400 on confirmed pregnancy, with a
    // repeat service as the sole remedy if no live litter results. The remedy
    // is what the escrow logic reads — from the clause effect, never the prose.
    const FEE_CENTS = 220_000;
    const DEPOSIT_CENTS = 80_000;
    const BALANCE_CENTS = FEE_CENTS - DEPOSIT_CENTS;

    const draft = draftFromTemplate('STUD_SERVICE', {
      'parties.stud_service': {
        agreementDate: at(40).toISOString().slice(0, 10),
        studOwnerName: 'Jordan Hale, Blackwater Kennels',
        sireName: rangerForContract.registeredName ?? rangerForContract.callName,
        sireRegistration: 'AKC SR91234501',
        bitchOwnerName: 'Priya Raman, Cedar Run',
        damName: marigoldForContract.registeredName ?? marigoldForContract.callName,
        damRegistration: 'AKC SS10044821',
      },
      'fee.deposit_and_balance': {
        feeTotal: FEE_CENTS,
        depositAmount: DEPOSIT_CENTS,
        balanceAmount: BALANCE_CENTS,
        balanceTrigger: 'ON_CONFIRMED_PREGNANCY',
      },
      'service.method': {
        method: 'artificial insemination with chilled shipped semen',
        methodDetail: 'Collection and shipping arranged through Denton Veterinary Reproduction.',
        costBearer: 'the Bitch Owner',
      },
      'health.brucellosis': { testWindow: '30 days' },
      'remedy.repeat_breeding': {
        minimumPuppies: 1,
        survivalAge: '72 hours of age',
        notificationWindow: '14 days',
        feeDisposition: 'The stud fee is not refundable.',
      },
      'ownership.registration_papers': { paperworkWindow: '14 days', whelpNotification: '72 hours' },
      'general.governing_law': { jurisdiction: 'the State of Texas' },
    });

    if (draft) {
      // The health schedule as it stood when the contract was drawn — a later
      // verification change must not rewrite what the parties saw.
      const healthSchedule: {
        animal: 'SIRE' | 'DAM';
        claimLabel: string;
        result: string;
        tier: 'VERIFIED' | 'REPORTED';
        source?: string | null;
        testedOn?: string | null;
      }[] = [];
      for (const [animal, dogId] of [
        ['SIRE', rangerForContract.id],
        ['DAM', marigoldForContract.id],
      ] as const) {
        const verified = await db.verifiedClaim.findMany({
          where: { dogId, state: { in: ['VERIFIED', 'STALE'] } },
          select: { claimType: true, markerName: true, rawResult: true, source: true, testedAt: true },
        });
        for (const c of verified) {
          healthSchedule.push({
            animal,
            claimLabel: c.markerName || c.claimType,
            result: c.rawResult ?? '—',
            tier: 'VERIFIED',
            source: c.source,
            testedOn: c.testedAt?.toISOString().slice(0, 10) ?? null,
          });
        }
      }

      // The title is part of the hashed document, and the API recomputes the
      // hash from the stored `contract.title` — so render under the title this
      // contract will actually be stored with, not the template's.
      const CONTRACT_TITLE = 'Stud service agreement — Ranger × Marigold';
      const rendered = renderContract({ ...draft, title: CONTRACT_TITLE, healthSchedule });

      let contract = await db.contract.findFirst({
        where: { breedingId: studBreeding.id, kind: 'STUD_SERVICE' },
      });
      if (!contract) {
        contract = await db.contract.create({
          data: {
            kind: 'STUD_SERVICE',
            status: 'SIGNED',
            title: CONTRACT_TITLE,
            kennelId: blackwater.id,
            breedingId: studBreeding.id,
            sireId: rangerForContract.id,
            damId: marigoldForContract.id,
            clauses: draft.instances as unknown as Prisma.InputJsonValue,
            healthSchedule: healthSchedule as unknown as Prisma.InputJsonValue,
            renderedText: rendered.plainText,
            contentHash: rendered.contentHash,
            createdByUserId: breeder.id,
            sentAt: at(40),
            signedAt: at(38),
            parties: {
              create: [
                {
                  userId: breeder.id,
                  role: 'STUD_OWNER',
                  legalName: 'Jordan Hale',
                  email: 'breeder@stud.dev',
                },
                {
                  userId: studOwner.id,
                  role: 'BITCH_OWNER',
                  legalName: 'Priya Raman',
                  email: 'studowner@stud.dev',
                },
              ],
            },
            signatures: {
              create: [
                {
                  userId: breeder.id,
                  legalName: 'Jordan Hale',
                  email: 'breeder@stud.dev',
                  typedName: 'Jordan Hale',
                  consentText: CONSENT_TEXT_V1,
                  documentHash: rendered.contentHash,
                  ipAddress: '198.51.100.24',
                  signedAt: at(39),
                },
                {
                  userId: studOwner.id,
                  legalName: 'Priya Raman',
                  email: 'studowner@stud.dev',
                  typedName: 'Priya Raman',
                  consentText: CONSENT_TEXT_V1,
                  documentHash: rendered.contentHash,
                  ipAddress: '203.0.113.7',
                  signedAt: at(38),
                },
              ],
            },
          },
        });

        // ── The money ──
        const schedule = buildSchedule({
          totalCents: FEE_CENTS,
          depositCents: DEPOSIT_CENTS,
          balanceTrigger: 'ON_CONFIRMED_PREGNANCY',
        });
        const created = await db.paymentSchedule.create({
          data: {
            contractId: contract.id,
            totalCents: schedule.totalCents,
            depositCents: DEPOSIT_CENTS,
            balanceTrigger: 'ON_CONFIRMED_PREGNANCY',
            // From the clause effect, not the sentence.
            noLitterRemedy: 'REPEAT_ONLY',
            instalments: {
              create: schedule.instalments.map((i) => ({
                key: i.key,
                label: i.label,
                amountCents: i.amountCents,
                trigger: i.trigger,
                // The deposit is paid; pregnancy is confirmed, so the balance
                // has fallen due but has not been settled yet.
                status: i.key === 'deposit' ? 'PAID' : 'DUE',
                paidAt: i.key === 'deposit' ? at(38) : null,
                dueSince: i.key === 'deposit' ? at(38) : at(6),
                providerChargeId: i.key === 'deposit' ? 'ch_mock_seed_0001' : null,
              })),
            },
          },
        });
        await db.escrowHold.create({
          data: {
            scheduleId: created.id,
            status: 'HOLDING',
            heldCents: DEPOSIT_CENTS,
            payeeUserId: breeder.id,
            payerUserId: studOwner.id,
          },
        });

        // Double-entry, built by the same movement builder the API uses, so
        // the seeded books balance for exactly the same reason the real ones do.
        const legs = captureToEscrow(
          {
            transactionId: `seed_${contract.id}_deposit`,
            referenceType: 'Contract',
            referenceId: contract.id,
            occurredAt: at(38),
            memo: 'Deposit on signing',
          },
          { payerId: studOwner.id, amountCents: DEPOSIT_CENTS, isDeposit: true },
        );
        await db.ledgerEntry.createMany({
          data: legs.map((l) => ({
            transactionId: l.transactionId,
            accountKind: l.account.kind,
            accountOwnerId: l.account.ownerId ?? null,
            amountCents: l.amountCents,
            reason: l.reason,
            referenceType: l.referenceType,
            referenceId: l.referenceId,
            memo: l.memo ?? null,
            occurredAt: l.occurredAt,
          })),
        });
        console.info('  ✓ a signed stud contract, deposit paid, balance due, escrow holding');
      }
    }
  }

  // A second contract left in draft, so the builder and the send/freeze step
  // have something to open into.
  const juniperForDraft = await db.dog.findUnique({
    where: { slug: 'blackwaters-juniper' },
    select: { id: true, registeredName: true, callName: true },
  });
  const atlasForDraft = await db.dog.findUnique({
    where: { slug: 'cedar-run-atlas' },
    select: { id: true, registeredName: true, callName: true },
  });
  if (juniperForDraft && atlasForDraft) {
    const existingDraft = await db.contract.findFirst({
      where: { status: 'DRAFT', sireId: atlasForDraft.id, damId: juniperForDraft.id },
    });
    if (!existingDraft) {
      const draft = draftFromTemplate('STUD_SERVICE', {
        'parties.stud_service': {
          agreementDate: today.toISOString().slice(0, 10),
          studOwnerName: 'Priya Raman, Cedar Run',
          sireName: atlasForDraft.registeredName ?? atlasForDraft.callName,
          sireRegistration: 'AKC SS12009944',
          bitchOwnerName: 'Jordan Hale, Blackwater Kennels',
          damName: juniperForDraft.registeredName ?? juniperForDraft.callName,
          damRegistration: 'AKC SR88451102',
        },
        'fee.deposit_and_balance': {
          feeTotal: 175_000,
          depositAmount: 60_000,
          balanceAmount: 115_000,
          balanceTrigger: 'ON_CONFIRMED_PREGNANCY',
        },
        'service.method': {
          method: 'natural service',
          costBearer: 'the Bitch Owner',
        },
        'health.brucellosis': { testWindow: '30 days' },
        'remedy.repeat_breeding': {
          minimumPuppies: 1,
          survivalAge: '72 hours of age',
          notificationWindow: '14 days',
          feeDisposition:
            'The balance, but not the deposit, is refundable at the Bitch Owner’s election in place of a repeat service.',
        },
        'ownership.registration_papers': { paperworkWindow: '14 days', whelpNotification: '72 hours' },
        'general.governing_law': { jurisdiction: 'the State of Texas' },
      });
      if (draft) {
        await db.contract.create({
          data: {
            kind: 'STUD_SERVICE',
            status: 'DRAFT',
            title: 'Stud service agreement — Atlas × Juniper',
            kennelId: blackwater.id,
            sireId: atlasForDraft.id,
            damId: juniperForDraft.id,
            clauses: draft.instances as unknown as Prisma.InputJsonValue,
            createdByUserId: breeder.id,
            parties: {
              create: [
                { userId: breeder.id, role: 'BITCH_OWNER', legalName: 'Jordan Hale', email: 'breeder@stud.dev' },
                { userId: studOwner.id, role: 'STUD_OWNER', legalName: 'Priya Raman', email: 'studowner@stud.dev' },
              ],
            },
          },
        });
        console.info('  ✓ a second contract left in draft, unsent and still editable');
      }
    }
  }

  // ── Phase 6: the litter marketplace ──────────────────────────────────────
  //
  // Publishing is deliberately thin. Everything a buyer will read about the
  // parents — health results, titles, registrations, COI, pedigree — is read
  // live from the dog records at request time. What is stored here is a price,
  // a paragraph and a go-home date, which is genuinely all a listing is.
  const marigoldLitter = await db.litter.findFirst({
    where: { dam: { slug: 'cedar-run-marigold' }, letter: 'A' },
    include: {
      dam: {
        select: {
          breed: true,
          verificationSummary: true,
          kennel: { select: { region: true, country: true, latitude: true, longitude: true } },
        },
      },
      sire: { select: { verificationSummary: true } },
      puppies: { select: { id: true, status: true, isPublic: true, birthOrder: true } },
    },
  });

  if (marigoldLitter && !(await db.litterListing.findUnique({ where: { litterId: marigoldLitter.id } }))) {
    const whelped = marigoldLitter.whelpedOn ?? at(18);
    await db.litterListing.create({
      data: {
        litterId: marigoldLitter.id,
        slug: 'golden-retriever-marigold-x-atlas-a',
        availability: 'AVAILABLE',
        priceCentsFrom: 320_000,
        priceCentsTo: 380_000,
        depositCents: 50_000,
        priceNotes:
          'Show and performance prospects are at the top of the range. Every puppy in this litter is the same dog until eight weeks — the difference in price is structure at evaluation, not a difference in how they are raised.',
        headline: 'Golden Retriever puppies, raised in the house',
        description:
          "Marigold's first litter. Both parents are OFA tested — you can read every result on this page, checked against the issuing source rather than typed in by us, including the one on Atlas that is currently showing a conflict we are working through with OFA.\n\nRaised in the house, on the Puppy Culture protocol, with a full ENS programme from day three. They meet the vacuum, the stairs, the crate and at least ten strangers before they leave.\n\nWe are not the cheapest Goldens in Texas and we are not trying to be.",
        includedInPrice:
          'AKC limited registration, microchip registered to you, first vaccination and two deworming rounds, a health certificate from our vet, four weeks of insurance, the puppy on its current food, and a scent blanket from the litter. Lifetime phone access to us — we would much rather answer a question at 11pm than have a dog rehomed.',
        buyerRequirements:
          'A completed application and a phone call before we accept a deposit. Fenced yard or a serious plan for exercise. No puppies to homes intending to breed without a co-ownership agreement. We take a dog back at any point in its life, for any reason, no questions — that is a condition of sale, not a courtesy.',
        // Eight weeks and a day. The floor is 56 days and this respects it.
        goHomeFrom: new Date(whelped.getTime() + 57 * DAY),
        publishedAt: at(10),
      },
    });

    // Two already reserved, so the page shows a real mix rather than a tidy
    // one. A marketplace where everything is available looks abandoned.
    const ordered = [...marigoldLitter.puppies].sort((a, b) => (a.birthOrder ?? 0) - (b.birthOrder ?? 0));
    for (const [i, pup] of ordered.entries()) {
      await db.puppy.update({
        where: { id: pup.id },
        data: {
          status: i < 2 ? 'RESERVED' : pup.status,
          priceCents: i === 0 ? 380_000 : i === 1 ? 350_000 : 320_000,
          publicNotes:
            i === ordered.length - 1
              ? 'The smallest of the litter and the one we watch most closely. She was slow to gain in the first week and is now tracking with her siblings — her weights are on her record and we will share them with anyone who asks.'
              : null,
        },
      });
    }
    // Derived last, and by the same function the API uses — so the seeded
    // browse counts cannot disagree with the seeded puppy statuses.
    await refreshListingCache(db, marigoldLitter.id);
    console.info('  ✓ a published litter listing, priced, with puppies reserved');
  }

  // A buyer enquiry waiting in the breeder's inbox.
  const publishedListing = await db.litterListing.findFirst({
    where: { slug: 'golden-retriever-marigold-x-atlas-a' },
    include: { litter: { include: { puppies: { orderBy: { birthOrder: 'asc' } } } } },
  });
  if (publishedListing && (await db.litterInquiry.count({ where: { litterListingId: publishedListing.id } })) === 0) {
    await db.litterInquiry.create({
      data: {
        litterListingId: publishedListing.id,
        fromUserId: buyer.id,
        puppyId: publishedListing.litter.puppies[2]?.id ?? null,
        name: 'Dana Whitfield',
        email: 'buyer@stud.dev',
        phone: '(512) 555-0148',
        message:
          "We lost our Golden last spring at thirteen and we are finally ready. I have been reading about hip scores for a month and yours is the first litter I have found where I could actually check the results rather than take somebody's word for it. Red collar caught my eye but I would trust your read on which puppy suits us.",
        householdNotes:
          'Two of us, both work from home three days a week. Fenced half acre. We walk two to three miles a day and would like to try rally obedience.',
        hasOtherDogs: false,
        hasChildren: true,
        homeType: 'House with fenced yard',
      },
    });
    console.info('  ✓ a buyer enquiry waiting in the inbox');
  }

  // ── Phase 7: the buyer pipeline ──────────────────────────────────────────
  //
  // Two states, because one litter cannot show both. Blackwater's previous
  // litter is placed and archived — it carries a completed application all the
  // way through to a recorded handover, which is the phase gate end to end.
  // The Cedar Run litter on the ground carries live applications mid-pipeline.
  const junipersId = juniper?.id;
  const rangersId = ranger?.id;

  if (junipersId && rangersId) {
    const pastWhelp = at(112); // sixteen weeks ago
    let pastLitter = await db.litter.findFirst({ where: { damId: junipersId, letter: 'A' } });
    if (!pastLitter) {
      pastLitter = await db.litter.create({
        data: {
          kennelId: blackwater.id,
          sireId: rangersId,
          damId: junipersId,
          letter: 'A',
          status: 'PLACED',
          whelpedOn: pastWhelp,
          totalBorn: 7,
          liveBorn: 7,
          whelpingNotes: 'Seven, no intervention. Her first and an easy one.',
        },
      });

      const pastPups: { collar: string; sex: 'MALE' | 'FEMALE' }[] = [
        { collar: 'Slate', sex: 'MALE' },
        { collar: 'Rust', sex: 'FEMALE' },
        { collar: 'Moss', sex: 'MALE' },
        { collar: 'Cream', sex: 'FEMALE' },
        { collar: 'Navy', sex: 'MALE' },
        { collar: 'Amber', sex: 'FEMALE' },
        { collar: 'Fern', sex: 'FEMALE' },
      ];
      for (const [i, pup] of pastPups.entries()) {
        const birthWeight = 400 + i * 8;
        const created = await db.puppy.create({
          data: {
            litterId: pastLitter.id,
            birthOrder: i + 1,
            collarColor: pup.collar,
            sex: pup.sex,
            status: 'SOLD',
            birthWeightGrams: birthWeight,
            colorPattern: 'Liver roan',
            bornAt: pastWhelp,
            priceCents: 250_000,
            microchip: `98514100200000${i}`,
          },
        });
        // Eight weeks of weights, so the record a new owner opens carries the
        // growth curve from the whelping box rather than starting blank.
        for (const day of [0, 3, 7, 14, 21, 28, 35, 42, 49, 56]) {
          await db.puppyWeight.create({
            data: {
              puppyId: created.id,
              recordedOn: new Date(pastWhelp.getTime() + day * DAY),
              grams: Math.round(birthWeight * (1 + day * 0.16)),
            },
          });
        }
      }

      // Published and archived. A placed litter stays up — it is the best
      // evidence the program has, and taking it down throws that away.
      await db.litterListing.create({
        data: {
          litterId: pastLitter.id,
          slug: 'german-shorthaired-pointer-juniper-x-ranger-a',
          availability: 'PAST',
          priceCentsFrom: 250_000,
          priceCentsTo: 250_000,
          depositCents: 50_000,
          headline: 'German Shorthaired Pointers — Juniper × Ranger',
          description:
            "Juniper's first litter and one we were pleased with. All seven placed into hunting and companion homes, and we are still in touch with every one of them.\n\nBoth parents are OFA tested and NAVHDA titled, and every result on this page was checked against the issuing body rather than typed in by us.",
          includedInPrice:
            'AKC limited registration, microchip registered to you, first vaccination and worming, a health certificate, four weeks of insurance, and a take-back for the life of the dog.',
          buyerRequirements:
            'An application and a phone call. This is a hunting breed with a working line behind it — a dog from this litter needs a job or a great deal of exercise, and we would rather say so than place one badly.',
          goHomeFrom: new Date(pastWhelp.getTime() + 57 * DAY),
          publishedAt: at(120),
        },
      });
      await refreshListingCache(db, pastLitter.id);
      console.info('  ✓ a past litter, placed and archived, still indexed');
    }

    // The completed application: applied, approved, deposit, matched, contract
    // signed, balance paid, collected. The gate, in one record.
    const pastListing = await db.litterListing.findUnique({ where: { litterId: pastLitter.id } });
    const rustPuppy = await db.puppy.findFirst({ where: { litterId: pastLitter.id, collarColor: 'Rust' } });

    if (pastListing && rustPuppy && (await db.puppyApplication.count({ where: { litterListingId: pastListing.id } })) === 0) {
      const collectedOn = new Date(pastWhelp.getTime() + 58 * DAY);
      /**
       * The signed sale contract.
       *
       * Without it the owner portal has nothing to derive obligations from,
       * and the obligations are the point of the portal — a contract read once
       * at the kitchen table, turned into dated things somebody will actually
       * meet.
       */
      const saleDraft = draftFromTemplate('PUPPY_SALE', {
        'parties.puppy_sale': {
          agreementDate: at(70).toISOString().slice(0, 10),
          breederName: 'Jordan Hale, Blackwater Kennels',
          buyerName: 'Sam Ortiz',
          puppyDescription: 'a female German Shorthaired Pointer puppy, rust collar',
          dateOfBirth: pastWhelp.toISOString().slice(0, 10),
          damName: "Blackwater's Juniper Wind",
          sireName: "Blackwater's Ranger Of The Marsh",
        },
        'fee.purchase_price': {
          priceTotal: 250_000,
          depositAmount: 50_000,
          balanceAmount: 200_000,
          balanceTrigger: 'ON_PICKUP',
          depositTerms: 'REFUNDABLE_UNTIL_PICK',
        },
        'health.puppy_guarantee': {
          initialExamWindow: '72 hours',
          guaranteePeriod: 'TWENTY_FOUR_MONTHS',
          guaranteeRemedy: 'REPLACEMENT_PUPPY',
        },
        'ownership.puppy_registration': { registrationType: 'LIMITED', paperworkWindow: '14 days' },
        'care.spay_neuter': {
          alterationDeadline: 'eighteen months of age, or earlier on veterinary advice',
          confirmationWindow: '30 days',
        },
        'care.return_to_breeder': { refundOnReturn: 'NO_REFUND' },
        'general.governing_law': { jurisdiction: 'the State of Texas' },
      })!;

      const saleHealth: {
        animal: 'SIRE' | 'DAM';
        claimLabel: string;
        result: string;
        tier: 'VERIFIED' | 'REPORTED';
        source?: string | null;
      }[] = [];
      for (const [animal, dogId] of [['SIRE', rangersId], ['DAM', junipersId]] as const) {
        for (const c of await db.verifiedClaim.findMany({
          where: { dogId, state: { in: ['VERIFIED', 'STALE'] } },
          select: { claimType: true, markerName: true, rawResult: true, source: true },
        })) {
          saleHealth.push({
            animal,
            claimLabel: c.markerName || c.claimType,
            result: c.rawResult ?? '—',
            tier: 'VERIFIED',
            source: c.source,
          });
        }
      }

      const saleTitle = 'Puppy sale agreement — Rust to Sam Ortiz';
      const saleRendered = renderContract({ ...saleDraft, title: saleTitle, healthSchedule: saleHealth });

      const saleContract = await db.contract.create({
        data: {
          kind: 'PUPPY_SALE',
          status: 'SIGNED',
          title: saleTitle,
          sireId: rangersId,
          damId: junipersId,
          litterId: pastLitter.id,
          clauses: saleDraft.instances as unknown as Prisma.InputJsonValue,
          healthSchedule: saleHealth as unknown as Prisma.InputJsonValue,
          renderedText: saleRendered.plainText,
          contentHash: saleRendered.contentHash,
          createdByUserId: breeder.id,
          sentAt: at(72),
          signedAt: at(70),
          parties: {
            create: [
              { userId: breeder.id, role: 'SELLER', legalName: 'Jordan Hale', email: 'breeder@stud.dev' },
              { userId: buyer.id, role: 'BUYER', legalName: 'Sam Ortiz', email: 'buyer@stud.dev' },
            ],
          },
          signatures: {
            create: [
              {
                userId: breeder.id,
                legalName: 'Jordan Hale',
                email: 'breeder@stud.dev',
                typedName: 'Jordan Hale',
                consentText: CONSENT_TEXT_V1,
                documentHash: saleRendered.contentHash,
                signedAt: at(71),
              },
              {
                userId: buyer.id,
                legalName: 'Sam Ortiz',
                email: 'buyer@stud.dev',
                typedName: 'Sam Ortiz',
                consentText: CONSENT_TEXT_V1,
                documentHash: saleRendered.contentHash,
                signedAt: at(70),
              },
            ],
          },
        },
      });

      const application = await db.puppyApplication.create({
        data: {
          litterListingId: pastListing.id,
          applicantUserId: buyer.id,
          contractId: saleContract.id,
          stage: 'COMPLETED',
          name: 'Sam Ortiz',
          email: 'buyer@stud.dev',
          phone: '(512) 555-0148',
          city: 'Austin',
          region: 'TX',
          intendedHome: 'Hunting and companion',
          homeType: 'Farm or acreage',
          hasFencedYard: true,
          hoursAloneDaily: 3,
          hasChildren: false,
          hasOtherPets: true,
          otherPetsDetail: 'One older Lab, spayed, very tolerant.',
          previousDogs: 'Third pointer. The last one hunted until she was eleven.',
          vetName: 'Blanco River Veterinary',
          vetPhone: '(512) 555-0177',
          activityPlans: 'Quail and dove through the season, NAVHDA natural ability in the spring.',
          preferredSex: 'FEMALE',
          message: 'We have been on your list since Juniper was bred. No rush and no preference on markings.',
          reviewNote: 'Experienced pointer home with somewhere to run. Straightforward yes.',
          reviewedByUserId: breeder.id,
          reviewedAt: at(140),
          depositPaidAt: at(138),
          matchedPuppyId: rustPuppy.id,
          matchedAt: at(70),
          submittedAt: at(145),
        },
      });

      const stages: [string, string | null, string, number][] = [
        ['SUBMITTED', null, 'Application submitted.', 145],
        ['IN_REVIEW', 'SUBMITTED', 'Reading through it.', 143],
        ['APPROVED', 'IN_REVIEW', 'Experienced pointer home with somewhere to run. Straightforward yes.', 140],
        ['DEPOSIT_PAID', 'APPROVED', 'Deposit received.', 138],
        ['MATCHED', 'DEPOSIT_PAID', 'Matched to Rust.', 70],
        ['PAID_IN_FULL', 'MATCHED', 'Balance received.', 56],
        ['COMPLETED', 'PAID_IN_FULL', 'Collected.', 54],
      ];
      for (const [to, from, note, daysAgo] of stages) {
        await db.applicationEvent.create({
          data: {
            applicationId: application.id,
            fromStage: from as never,
            toStage: to as never,
            note,
            occurredAt: at(daysAgo),
          },
        });
      }

      await db.puppyHandover.create({
        data: {
          applicationId: application.id,
          puppyId: rustPuppy.id,
          collectedOn,
          collectedBy: 'Sam Ortiz',
          microchipRegistered: true,
          registrationPapers: true,
          healthCertificate: true,
          vaccinationRecord: true,
          wormingRecord: true,
          microchipNumber: rustPuppy.microchip,
          foodProvided: 'Two weeks of what she is already on.',
          itemsProvided: 'Scent blanket from the litter, her weight chart, worming and vaccination records, and the NAVHDA paperwork.',
          vetExamDueBy: new Date(collectedOn.getTime() + 3 * DAY),
          notes: 'Straightforward handover. They stayed an hour and met both parents.',
        },
      });

      /**
       * The puppy becomes a dog the buyer owns — through the same function the
       * API uses at handover, so the seeded state is exactly what the app
       * produces rather than an approximation of it.
       */
      const placed = await transferPuppyToOwner(db, {
        puppyId: rustPuppy.id,
        ownerUserId: buyer.id,
        callName: 'Juno',
        registeredName: "Blackwater's Juniper Rising",
        reason: 'purchase',
      });
      await db.ownershipTransfer.create({
        data: {
          dogId: placed.dogId,
          kind: 'PLACEMENT',
          status: 'ACCEPTED',
          fromUserId: breeder.id,
          toUserId: buyer.id,
          toEmail: 'buyer@stud.dev',
          toName: 'Sam Ortiz',
          applicationId: application.id,
          contractRequiresReturn: true,
          respondedAt: collectedOn,
        },
      });

      // What the owner has logged since. Shared with the breeder by default,
      // which is how a breeding program finds out what it produced.
      await db.healthEvent.createMany({
        data: [
          {
            dogId: placed.dogId,
            kind: 'VET_VISIT',
            occurredOn: new Date(collectedOn.getTime() + 2 * DAY),
            title: 'First vet check',
            detail: 'Clean bill of health. Weight 6.1kg, heart and hips felt normal for her age.',
            vetName: 'Blanco River Veterinary',
            reportedByUserId: buyer.id,
          },
          {
            dogId: placed.dogId,
            kind: 'VACCINATION',
            occurredOn: new Date(collectedOn.getTime() + 14 * DAY),
            title: 'Second DHPP',
            vetName: 'Blanco River Veterinary',
            reportedByUserId: buyer.id,
          },
          {
            dogId: placed.dogId,
            kind: 'WEIGHT',
            occurredOn: at(20),
            title: 'Weighed at home',
            weightGrams: 18_400,
            reportedByUserId: buyer.id,
          },
        ],
      });
      console.info('  ✓ a completed application — applied to collected, with the dog record transferred');
    }
  }

  // Two live applications on the litter that is on the ground, so the pipeline
  // has something in it and the pick order has something to order.
  const currentListing = await db.litterListing.findFirst({
    where: { slug: 'golden-retriever-marigold-x-atlas-a' },
  });
  if (currentListing && (await db.puppyApplication.count({ where: { litterListingId: currentListing.id } })) === 0) {
    const marcus = await db.puppyApplication.create({
      data: {
        litterListingId: currentListing.id,
        stage: 'APPROVED',
        name: 'Marcus Bell',
        email: 'marcus.bell@example.com',
        phone: '(214) 555-0132',
        city: 'Dallas',
        region: 'TX',
        intendedHome: 'Family companion',
        homeType: 'House with fenced yard',
        hasFencedYard: true,
        hoursAloneDaily: 5,
        hasChildren: true,
        childrenAges: '6 and 9',
        hasOtherPets: false,
        previousDogs: 'First dog for us as a family, though I grew up with Goldens.',
        vetName: 'Preston Road Animal Clinic',
        activityPlans: 'Daily walks, swimming in the summer, and we would like to try therapy work when he is older.',
        preferredSex: 'MALE',
        message:
          'We are not in a hurry and would rather wait for the right puppy than take the first available one.',
        reviewNote: 'Good home. First-time owners but realistic and asking the right questions.',
        reviewedByUserId: breeder.id,
        reviewedAt: at(6),
        submittedAt: at(8),
      },
    });
    await db.applicationEvent.createMany({
      data: [
        { applicationId: marcus.id, toStage: 'SUBMITTED', note: 'Application submitted.', occurredAt: at(8) },
        { applicationId: marcus.id, fromStage: 'SUBMITTED', toStage: 'IN_REVIEW', note: 'Reading through it.', occurredAt: at(7) },
        {
          applicationId: marcus.id,
          fromStage: 'IN_REVIEW',
          toStage: 'APPROVED',
          note: 'Good home. First-time owners but realistic and asking the right questions.',
          actorUserId: breeder.id,
          occurredAt: at(6),
        },
      ],
    });

    const elena = await db.puppyApplication.create({
      data: {
        litterListingId: currentListing.id,
        stage: 'SUBMITTED',
        name: 'Elena Fitzgerald',
        email: 'elena.f@example.com',
        city: 'Houston',
        region: 'TX',
        intendedHome: 'Companion',
        homeType: 'Apartment or condo',
        hasFencedYard: false,
        hoursAloneDaily: 9,
        hasChildren: false,
        hasOtherPets: false,
        message: 'Do you ship? I would like a light golden female, as pale as possible.',
        submittedAt: at(2),
      },
    });
    await db.applicationEvent.create({
      data: {
        applicationId: elena.id,
        toStage: 'SUBMITTED',
        note: 'Application submitted.',
        occurredAt: at(2),
      },
    });
    console.info('  ✓ two live applications waiting in the pipeline');
  }

  // ── Phase 9: trust and measurement ───────────────────────────────────────
  //
  // A verified-purchase review on the completed placement, with the breeder's
  // one reply. And a funnel history whose numbers are deliberately imperfect —
  // a demo where verification wins 10× on every metric teaches nobody to read
  // the dashboard critically.
  const completedApp = await db.puppyApplication.findFirst({
    where: { stage: 'COMPLETED', email: 'buyer@stud.dev' },
    select: { id: true, litterListingId: true },
  });
  if (completedApp && (await db.breederReview.count()) === 0) {
    await db.breederReview.create({
      data: {
        kennelId: blackwater.id,
        applicationId: completedApp.id,
        authorUserId: buyer.id,
        overall: 5,
        communication: 5,
        healthOfPuppy: 5,
        honestyAboutMatch: 4,
        supportAfterward: 5,
        title: 'Exactly the dog they said she would be',
        body: 'We were on the list before the litter was bred, and Jordan was straight with us the whole way — including about which puppy NOT to pick for our household, which is not something every breeder will do. Juno is everything the testing said her parents were. The one mark off honesty is that "moderate drive" undersold it; she is a lot of dog, in the best way. We knew her hip scores before we ever visited, which is why we drove three hours past a dozen closer litters.',
        daysAfterPlacement: 54,
        response:
          'Thank you, Sam. "A lot of dog" is fair — Juniper puppies keep their engines. Standing offer: if rally ever loses its shine, she has a NAVHDA natural ability title in her and I will run her with you.',
        respondedAt: at(40),
      },
    });
    console.info('  ✓ a verified-purchase review, with the breeder\'s reply');
  }

  // The funnel. Verified listings convert better here — but not absurdly, and
  // the sample is honest about its own size.
  if ((await db.funnelEvent.count()) === 0) {
    const listing = await db.litterListing.findFirst({
      where: { slug: 'golden-retriever-marigold-x-atlas-a' },
      select: { id: true, cachedSireVerified: true, cachedDamVerified: true, cachedParentDensity: true, litter: { select: { kennelId: true } } },
    });
    const rows: {
      step: 'LISTING_IMPRESSION' | 'LISTING_VIEW' | 'APPLY_STARTED' | 'APPLICATION_SUBMITTED';
      claims: number;
      density: number;
      n: number;
      channel: string;
      listingId?: string | null;
      kennelId?: string | null;
    }[] = [
      // The verified litter: real traffic, decent conversion.
      { step: 'LISTING_IMPRESSION', claims: 4, density: 0.75, n: 420, channel: 'organic', listingId: listing?.id, kennelId: listing?.litter.kennelId },
      { step: 'LISTING_VIEW', claims: 4, density: 0.75, n: 150, channel: 'organic', listingId: listing?.id, kennelId: listing?.litter.kennelId },
      { step: 'LISTING_VIEW', claims: 4, density: 0.75, n: 40, channel: 'direct', listingId: listing?.id, kennelId: listing?.litter.kennelId },
      { step: 'LISTING_VIEW', claims: 4, density: 0.75, n: 25, channel: 'social', listingId: listing?.id, kennelId: listing?.litter.kennelId },
      { step: 'APPLY_STARTED', claims: 4, density: 0.75, n: 18, channel: 'organic', listingId: listing?.id },
      { step: 'APPLICATION_SUBMITTED', claims: 4, density: 0.75, n: 9, channel: 'organic', listingId: listing?.id },
      // A hypothetical unverified cohort, for the baseline.
      { step: 'LISTING_IMPRESSION', claims: 0, density: 0, n: 380, channel: 'organic' },
      { step: 'LISTING_VIEW', claims: 0, density: 0, n: 90, channel: 'organic' },
      { step: 'LISTING_VIEW', claims: 0, density: 0, n: 30, channel: 'social' },
      { step: 'APPLY_STARTED', claims: 0, density: 0, n: 5, channel: 'organic' },
      { step: 'APPLICATION_SUBMITTED', claims: 0, density: 0, n: 2, channel: 'organic' },
      // A fully-panelled cohort with THIN traffic, so the dashboard's
      // "not yet evidence" honesty has something to be honest about.
      { step: 'LISTING_VIEW', claims: 12, density: 1, n: 14, channel: 'organic' },
      { step: 'APPLICATION_SUBMITTED', claims: 12, density: 1, n: 3, channel: 'organic' },
    ];
    for (const r of rows) {
      await db.funnelEvent.createMany({
        data: Array.from({ length: r.n }, (_, i) => ({
          step: r.step,
          litterListingId: r.listingId ?? null,
          kennelId: r.kennelId ?? null,
          verifiedParentClaims: r.claims,
          parentDensity: r.density,
          channel: r.channel,
          occurredAt: at(1 + ((i * 7) % 60)),
        })),
      });
    }
    console.info('  ✓ sixty days of funnel history, honest about its sample sizes');
  }

  // ── Photos ───────────────────────────────────────────────────────────────
  //
  // Unconditional upserts, so a reseed always leaves every listing, dog and
  // kennel with pictures. A dog marketplace without photographs is a
  // spreadsheet, whatever else it gets right.
  const U = (id: string, w = 1200) =>
    `https://images.unsplash.com/photo-${id}?q=80&w=${w}&auto=format&fit=crop`;

  const PHOTOS = {
    goldenPupTulip: U('1552053831-71594a27632d'),
    goldenAdult: U('1633722715463-d30f4f325e24'),
    goldenPupCollar: U('1591160690555-5debfba289f0'),
    goldenPupRed: U('1507146426996-ef05306b995a'),
    creamRetrieverField: U('1605897472359-85e4b94d685d'),
    tollerBeach: U('1530281700549-e82e7bf110d6'),
    pointerCity: U('1477884213360-7e9d7dcc1e48'),
    liverTongue: U('1518717758536-85ae29035b6d'),
    brownWhiteField: U('1587300003388-59208cc962cb'),
    terrierFace: U('1561037404-61cd46aa615b'),
  } as const;

  const dogPhotos: [string, string][] = [
    ['blackwaters-ranger-of-the-marsh', PHOTOS.pointerCity],
    ['blackwaters-juniper', PHOTOS.liverTongue],
    ['cedar-run-atlas', PHOTOS.goldenAdult],
    ['cedar-run-marigold', PHOTOS.creamRetrieverField],
    ['lindqvists-jack-of-tulsa', PHOTOS.terrierFace],
  ];
  for (const [slug, url] of dogPhotos) {
    const dog = await db.dog.findUnique({ where: { slug }, select: { id: true } });
    if (!dog) continue;
    const existing = await db.dogMedia.findFirst({ where: { dogId: dog.id, isPrimary: true } });
    if (existing) await db.dogMedia.update({ where: { id: existing.id }, data: { url } });
    else await db.dogMedia.create({ data: { dogId: dog.id, url, isPrimary: true, position: 0 } });
  }

  await db.litterListing.updateMany({
    where: { slug: 'golden-retriever-marigold-x-atlas-a' },
    data: { photoUrls: [PHOTOS.goldenPupCollar, PHOTOS.goldenPupTulip, PHOTOS.goldenPupRed] },
  });
  await db.litterListing.updateMany({
    where: { slug: 'german-shorthaired-pointer-juniper-x-ranger-a' },
    data: { photoUrls: [PHOTOS.brownWhiteField, PHOTOS.pointerCity] },
  });

  await db.kennel.updateMany({
    where: { slug: 'blackwater-kennels' },
    data: { coverUrl: PHOTOS.brownWhiteField, logoUrl: PHOTOS.pointerCity },
  });
  await db.kennel.updateMany({
    where: { slug: 'cedar-run-retrievers' },
    data: { coverUrl: PHOTOS.tollerBeach, logoUrl: PHOTOS.goldenAdult },
  });
  console.info('  ✓ photos on dogs, listings and kennels');

  console.info(`\n✓ seed complete`);
  console.info(`  breeder@stud.dev · buyer@stud.dev · studowner@stud.dev · admin@stud.dev`);
  console.info(`  password: ${DEV_PASSWORD}`);

  void buyer;
  void admin;
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => db.$disconnect());

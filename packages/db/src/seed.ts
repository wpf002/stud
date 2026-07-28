/**
 * Seed data. Grows with each phase; every phase's seed section is idempotent
 * so `pnpm db:seed` can be re-run against an existing database.
 *
 * The dogs here are fictional but the shape of the data is real: a GSP stud
 * with a documented five-generation pedigree, OFA panels and field titles is
 * exactly the wedge case the product was designed around.
 */
import { PrismaClient, type Prisma } from '@prisma/client';
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

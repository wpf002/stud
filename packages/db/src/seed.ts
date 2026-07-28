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

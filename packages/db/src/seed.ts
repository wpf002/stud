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

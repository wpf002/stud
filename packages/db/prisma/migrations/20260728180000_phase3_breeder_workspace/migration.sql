-- CreateEnum
CREATE TYPE "ProgesteroneUnit" AS ENUM ('NG_ML', 'NMOL_L');

-- CreateEnum
CREATE TYPE "BreedingMethod" AS ENUM ('NATURAL', 'AI_FRESH', 'AI_CHILLED', 'AI_FROZEN', 'AI_SURGICAL', 'TCI');

-- CreateEnum
CREATE TYPE "BreedingStatus" AS ENUM ('PLANNED', 'BRED', 'CONFIRMED_PREGNANT', 'CONFIRMED_EMPTY', 'WHELPED', 'ABANDONED');

-- CreateEnum
CREATE TYPE "LitterStatus" AS ENUM ('EXPECTED', 'WHELPING', 'ON_THE_GROUND', 'WEANED', 'PLACED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "PuppyStatus" AS ENUM ('AVAILABLE', 'RESERVED', 'SOLD', 'KEPT', 'DECEASED', 'STILLBORN');

-- CreateEnum
CREATE TYPE "CareTaskStatus" AS ENUM ('PENDING', 'DONE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "VaultDocumentKind" AS ENUM ('REGISTRATION_PAPER', 'HEALTH_CERTIFICATE', 'VET_RECORD', 'PEDIGREE', 'CONTRACT', 'INSURANCE', 'LICENCE', 'OTHER');

-- CreateTable
CREATE TABLE "heat_cycles" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "startedOn" TIMESTAMP(3) NOT NULL,
    "endedOn" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "heat_cycles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "progesterone_tests" (
    "id" TEXT NOT NULL,
    "heatCycleId" TEXT NOT NULL,
    "takenOn" TIMESTAMP(3) NOT NULL,
    "value" DOUBLE PRECISION NOT NULL,
    "unit" "ProgesteroneUnit" NOT NULL DEFAULT 'NG_ML',
    "lab" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "progesterone_tests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "heat_observations" (
    "id" TEXT NOT NULL,
    "heatCycleId" TEXT NOT NULL,
    "observedOn" TIMESTAMP(3) NOT NULL,
    "phase" TEXT,
    "dischargeColor" TEXT,
    "swelling" TEXT,
    "receptive" BOOLEAN,
    "temperatureC" DOUBLE PRECISION,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "heat_observations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breedings" (
    "id" TEXT NOT NULL,
    "kennelId" TEXT,
    "sireId" TEXT NOT NULL,
    "damId" TEXT NOT NULL,
    "heatCycleId" TEXT,
    "method" "BreedingMethod" NOT NULL,
    "status" "BreedingStatus" NOT NULL DEFAULT 'PLANNED',
    "ovulationDate" TIMESTAMP(3),
    "lhSurgeDate" TIMESTAMP(3),
    "ultrasoundOn" TIMESTAMP(3),
    "ultrasoundResult" TEXT,
    "xrayOn" TIMESTAMP(3),
    "xrayPuppyCount" INTEGER,
    "collectionDate" TIMESTAMP(3),
    "semenSource" TEXT,
    "shippingProvider" TEXT,
    "shippingTracking" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breedings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "breeding_events" (
    "id" TEXT NOT NULL,
    "breedingId" TEXT NOT NULL,
    "occurredOn" TIMESTAMP(3) NOT NULL,
    "method" "BreedingMethod" NOT NULL,
    "tieMinutes" INTEGER,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "breeding_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "litters" (
    "id" TEXT NOT NULL,
    "breedingId" TEXT,
    "kennelId" TEXT,
    "sireId" TEXT NOT NULL,
    "damId" TEXT NOT NULL,
    "name" TEXT,
    "letter" TEXT,
    "status" "LitterStatus" NOT NULL DEFAULT 'EXPECTED',
    "expectedWhelpOn" TIMESTAMP(3),
    "whelpedOn" TIMESTAMP(3),
    "totalBorn" INTEGER,
    "liveBorn" INTEGER,
    "stillborn" INTEGER,
    "neonatalDeaths" INTEGER NOT NULL DEFAULT 0,
    "whelpingNotes" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "litters_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puppies" (
    "id" TEXT NOT NULL,
    "litterId" TEXT NOT NULL,
    "birthOrder" INTEGER,
    "name" TEXT,
    "collarColor" TEXT,
    "sex" "Sex" NOT NULL,
    "status" "PuppyStatus" NOT NULL DEFAULT 'AVAILABLE',
    "birthWeightGrams" INTEGER,
    "colorPattern" TEXT,
    "markings" TEXT,
    "microchip" TEXT,
    "bornAt" TIMESTAMP(3),
    "diedAt" TIMESTAMP(3),
    "causeOfDeath" TEXT,
    "notes" TEXT,
    "dogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "puppies_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puppy_weights" (
    "id" TEXT NOT NULL,
    "puppyId" TEXT NOT NULL,
    "recordedOn" TIMESTAMP(3) NOT NULL,
    "grams" INTEGER NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "puppy_weights_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whelping_events" (
    "id" TEXT NOT NULL,
    "litterId" TEXT NOT NULL,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "kind" TEXT NOT NULL,
    "puppyId" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whelping_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "care_tasks" (
    "id" TEXT NOT NULL,
    "litterId" TEXT,
    "puppyId" TEXT,
    "dogId" TEXT,
    "kind" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "dueOn" TIMESTAMP(3) NOT NULL,
    "status" "CareTaskStatus" NOT NULL DEFAULT 'PENDING',
    "completedOn" TIMESTAMP(3),
    "completedByUserId" TEXT,
    "productUsed" TEXT,
    "dose" TEXT,
    "administeredBy" TEXT,
    "notes" TEXT,
    "required" BOOLEAN NOT NULL DEFAULT false,
    "dedupeKey" TEXT NOT NULL,
    "generatedKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "care_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "feed_routines" (
    "id" TEXT NOT NULL,
    "dogId" TEXT,
    "litterId" TEXT,
    "label" TEXT NOT NULL,
    "food" TEXT NOT NULL,
    "amount" TEXT,
    "frequency" TEXT,
    "notes" TEXT,
    "startedOn" TIMESTAMP(3),
    "endedOn" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "feed_routines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "vault_documents" (
    "id" TEXT NOT NULL,
    "kennelId" TEXT,
    "dogId" TEXT,
    "litterId" TEXT,
    "puppyId" TEXT,
    "kind" "VaultDocumentKind" NOT NULL DEFAULT 'OTHER',
    "title" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "notes" TEXT,
    "issuedOn" TIMESTAMP(3),
    "expiresOn" TIMESTAMP(3),
    "uploadedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "vault_documents_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "heat_cycles_dogId_startedOn_idx" ON "heat_cycles"("dogId", "startedOn");

-- CreateIndex
CREATE INDEX "progesterone_tests_heatCycleId_takenOn_idx" ON "progesterone_tests"("heatCycleId", "takenOn");

-- CreateIndex
CREATE INDEX "heat_observations_heatCycleId_observedOn_idx" ON "heat_observations"("heatCycleId", "observedOn");

-- CreateIndex
CREATE INDEX "breedings_kennelId_status_idx" ON "breedings"("kennelId", "status");

-- CreateIndex
CREATE INDEX "breedings_damId_createdAt_idx" ON "breedings"("damId", "createdAt");

-- CreateIndex
CREATE INDEX "breedings_sireId_idx" ON "breedings"("sireId");

-- CreateIndex
CREATE INDEX "breeding_events_breedingId_occurredOn_idx" ON "breeding_events"("breedingId", "occurredOn");

-- CreateIndex
CREATE UNIQUE INDEX "litters_breedingId_key" ON "litters"("breedingId");

-- CreateIndex
CREATE INDEX "litters_kennelId_status_idx" ON "litters"("kennelId", "status");

-- CreateIndex
CREATE INDEX "litters_damId_idx" ON "litters"("damId");

-- CreateIndex
CREATE INDEX "litters_expectedWhelpOn_idx" ON "litters"("expectedWhelpOn");

-- CreateIndex
CREATE UNIQUE INDEX "puppies_dogId_key" ON "puppies"("dogId");

-- CreateIndex
CREATE INDEX "puppies_litterId_birthOrder_idx" ON "puppies"("litterId", "birthOrder");

-- CreateIndex
CREATE INDEX "puppies_status_idx" ON "puppies"("status");

-- CreateIndex
CREATE INDEX "puppy_weights_puppyId_recordedOn_idx" ON "puppy_weights"("puppyId", "recordedOn");

-- CreateIndex
CREATE INDEX "whelping_events_litterId_occurredAt_idx" ON "whelping_events"("litterId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "care_tasks_dedupeKey_key" ON "care_tasks"("dedupeKey");

-- CreateIndex
CREATE INDEX "care_tasks_dueOn_status_idx" ON "care_tasks"("dueOn", "status");

-- CreateIndex
CREATE INDEX "care_tasks_litterId_dueOn_idx" ON "care_tasks"("litterId", "dueOn");

-- CreateIndex
CREATE INDEX "care_tasks_dogId_dueOn_idx" ON "care_tasks"("dogId", "dueOn");

-- CreateIndex
CREATE INDEX "feed_routines_dogId_idx" ON "feed_routines"("dogId");

-- CreateIndex
CREATE INDEX "feed_routines_litterId_idx" ON "feed_routines"("litterId");

-- CreateIndex
CREATE INDEX "vault_documents_kennelId_kind_idx" ON "vault_documents"("kennelId", "kind");

-- CreateIndex
CREATE INDEX "vault_documents_dogId_idx" ON "vault_documents"("dogId");

-- CreateIndex
CREATE INDEX "vault_documents_expiresOn_idx" ON "vault_documents"("expiresOn");

-- AddForeignKey
ALTER TABLE "heat_cycles" ADD CONSTRAINT "heat_cycles_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "progesterone_tests" ADD CONSTRAINT "progesterone_tests_heatCycleId_fkey" FOREIGN KEY ("heatCycleId") REFERENCES "heat_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "heat_observations" ADD CONSTRAINT "heat_observations_heatCycleId_fkey" FOREIGN KEY ("heatCycleId") REFERENCES "heat_cycles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breedings" ADD CONSTRAINT "breedings_sireId_fkey" FOREIGN KEY ("sireId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breedings" ADD CONSTRAINT "breedings_damId_fkey" FOREIGN KEY ("damId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breedings" ADD CONSTRAINT "breedings_heatCycleId_fkey" FOREIGN KEY ("heatCycleId") REFERENCES "heat_cycles"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeding_events" ADD CONSTRAINT "breeding_events_breedingId_fkey" FOREIGN KEY ("breedingId") REFERENCES "breedings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "litters" ADD CONSTRAINT "litters_breedingId_fkey" FOREIGN KEY ("breedingId") REFERENCES "breedings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "litters" ADD CONSTRAINT "litters_sireId_fkey" FOREIGN KEY ("sireId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "litters" ADD CONSTRAINT "litters_damId_fkey" FOREIGN KEY ("damId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puppies" ADD CONSTRAINT "puppies_litterId_fkey" FOREIGN KEY ("litterId") REFERENCES "litters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puppies" ADD CONSTRAINT "puppies_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "dogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puppy_weights" ADD CONSTRAINT "puppy_weights_puppyId_fkey" FOREIGN KEY ("puppyId") REFERENCES "puppies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whelping_events" ADD CONSTRAINT "whelping_events_litterId_fkey" FOREIGN KEY ("litterId") REFERENCES "litters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_tasks" ADD CONSTRAINT "care_tasks_litterId_fkey" FOREIGN KEY ("litterId") REFERENCES "litters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_tasks" ADD CONSTRAINT "care_tasks_puppyId_fkey" FOREIGN KEY ("puppyId") REFERENCES "puppies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "care_tasks" ADD CONSTRAINT "care_tasks_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "feed_routines" ADD CONSTRAINT "feed_routines_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "vault_documents" ADD CONSTRAINT "vault_documents_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


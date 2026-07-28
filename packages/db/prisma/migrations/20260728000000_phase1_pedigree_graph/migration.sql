-- CreateEnum
CREATE TYPE "PedigreeSourceKind" AS ENUM ('MANUAL', 'CSV', 'REGISTRY_TEXT', 'REGISTRY_API', 'MERGE');

-- CreateEnum
CREATE TYPE "MergeStatus" AS ENUM ('OPEN', 'MERGED', 'DISMISSED');

-- AlterTable
ALTER TABLE "dogs" ADD COLUMN     "damId" TEXT,
ADD COLUMN     "isAncestorStub" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "sireId" TEXT,
ADD COLUMN     "supersededByDogId" TEXT;

-- CreateTable
CREATE TABLE "pedigree_imports" (
    "id" TEXT NOT NULL,
    "kennelId" TEXT,
    "userId" TEXT,
    "rootDogId" TEXT,
    "kind" "PedigreeSourceKind" NOT NULL,
    "rawInput" TEXT,
    "fileName" TEXT,
    "dogsCreated" INTEGER NOT NULL DEFAULT 0,
    "dogsLinked" INTEGER NOT NULL DEFAULT 0,
    "dogsSkipped" INTEGER NOT NULL DEFAULT 0,
    "issues" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pedigree_imports_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dog_merge_candidates" (
    "id" TEXT NOT NULL,
    "dogAId" TEXT NOT NULL,
    "dogBId" TEXT NOT NULL,
    "score" DOUBLE PRECISION NOT NULL,
    "confidence" TEXT NOT NULL,
    "reasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "conflicts" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" "MergeStatus" NOT NULL DEFAULT 'OPEN',
    "resolvedByUserId" TEXT,
    "resolvedAt" TIMESTAMP(3),
    "keptDogId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dog_merge_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dog_supersessions" (
    "id" TEXT NOT NULL,
    "supersededDogId" TEXT NOT NULL,
    "survivingDogId" TEXT NOT NULL,
    "reason" TEXT NOT NULL DEFAULT 'merge',
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dog_supersessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dog_pedigree_stats" (
    "dogId" TEXT NOT NULL,
    "coi" DOUBLE PRECISION NOT NULL,
    "generations" INTEGER NOT NULL,
    "generationEquivalent" DOUBLE PRECISION NOT NULL,
    "completenessRatio" DOUBLE PRECISION NOT NULL,
    "distinctAncestors" INTEGER NOT NULL,
    "knownSlots" INTEGER NOT NULL,
    "deepestGeneration" INTEGER NOT NULL,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dog_pedigree_stats_pkey" PRIMARY KEY ("dogId")
);

-- CreateIndex
CREATE INDEX "pedigree_imports_kennelId_createdAt_idx" ON "pedigree_imports"("kennelId", "createdAt");

-- CreateIndex
CREATE INDEX "pedigree_imports_rootDogId_idx" ON "pedigree_imports"("rootDogId");

-- CreateIndex
CREATE INDEX "dog_merge_candidates_status_score_idx" ON "dog_merge_candidates"("status", "score");

-- CreateIndex
CREATE UNIQUE INDEX "dog_merge_candidates_dogAId_dogBId_key" ON "dog_merge_candidates"("dogAId", "dogBId");

-- CreateIndex
CREATE UNIQUE INDEX "dog_supersessions_supersededDogId_key" ON "dog_supersessions"("supersededDogId");

-- CreateIndex
CREATE INDEX "dog_supersessions_survivingDogId_idx" ON "dog_supersessions"("survivingDogId");

-- CreateIndex
CREATE INDEX "dog_pedigree_stats_coi_idx" ON "dog_pedigree_stats"("coi");

-- CreateIndex
CREATE INDEX "dog_pedigree_stats_computedAt_idx" ON "dog_pedigree_stats"("computedAt");

-- CreateIndex
CREATE INDEX "dogs_sireId_idx" ON "dogs"("sireId");

-- CreateIndex
CREATE INDEX "dogs_damId_idx" ON "dogs"("damId");

-- CreateIndex
CREATE INDEX "dogs_registeredName_idx" ON "dogs"("registeredName");

-- CreateIndex
CREATE INDEX "dogs_supersededByDogId_idx" ON "dogs"("supersededByDogId");

-- AddForeignKey
ALTER TABLE "dogs" ADD CONSTRAINT "dogs_sireId_fkey" FOREIGN KEY ("sireId") REFERENCES "dogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dogs" ADD CONSTRAINT "dogs_damId_fkey" FOREIGN KEY ("damId") REFERENCES "dogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dogs" ADD CONSTRAINT "dogs_supersededByDogId_fkey" FOREIGN KEY ("supersededByDogId") REFERENCES "dogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedigree_imports" ADD CONSTRAINT "pedigree_imports_rootDogId_fkey" FOREIGN KEY ("rootDogId") REFERENCES "dogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pedigree_imports" ADD CONSTRAINT "pedigree_imports_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dog_merge_candidates" ADD CONSTRAINT "dog_merge_candidates_dogAId_fkey" FOREIGN KEY ("dogAId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dog_merge_candidates" ADD CONSTRAINT "dog_merge_candidates_dogBId_fkey" FOREIGN KEY ("dogBId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dog_supersessions" ADD CONSTRAINT "dog_supersessions_supersededDogId_fkey" FOREIGN KEY ("supersededDogId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dog_supersessions" ADD CONSTRAINT "dog_supersessions_survivingDogId_fkey" FOREIGN KEY ("survivingDogId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dog_pedigree_stats" ADD CONSTRAINT "dog_pedigree_stats_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


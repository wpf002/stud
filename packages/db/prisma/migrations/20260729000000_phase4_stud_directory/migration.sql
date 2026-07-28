-- CreateEnum
CREATE TYPE "StudAvailability" AS ENUM ('AVAILABLE', 'LIMITED', 'BOOKED', 'RETIRED', 'NOT_LISTED');

-- CreateEnum
CREATE TYPE "SemenType" AS ENUM ('NATURAL', 'FRESH', 'CHILLED', 'FROZEN');

-- CreateEnum
CREATE TYPE "InquiryStatus" AS ENUM ('NEW', 'READ', 'REPLIED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "stud_listings" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "availability" "StudAvailability" NOT NULL DEFAULT 'NOT_LISTED',
    "studFeeCents" INTEGER,
    "pickOfLitter" BOOLEAN NOT NULL DEFAULT false,
    "feeNotes" TEXT,
    "semenTypes" "SemenType"[] DEFAULT ARRAY[]::"SemenType"[],
    "shipsSemen" BOOLEAN NOT NULL DEFAULT false,
    "travelRadiusMiles" INTEGER,
    "willTravel" BOOLEAN NOT NULL DEFAULT false,
    "temperamentNotes" TEXT,
    "producedNotes" TEXT,
    "requirements" TEXT,
    "requiresHealthTesting" BOOLEAN NOT NULL DEFAULT true,
    "requiresContract" BOOLEAN NOT NULL DEFAULT true,
    "requiresBrucellosis" BOOLEAN NOT NULL DEFAULT true,
    "cachedVerifiedCount" INTEGER NOT NULL DEFAULT 0,
    "cachedCoi" DOUBLE PRECISION,
    "cachedDensity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stud_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stud_inquiries" (
    "id" TEXT NOT NULL,
    "studListingId" TEXT NOT NULL,
    "damId" TEXT,
    "fromUserId" TEXT NOT NULL,
    "fromKennelId" TEXT,
    "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
    "message" TEXT NOT NULL,
    "projectedCoi" DOUBLE PRECISION,
    "coiGenerations" INTEGER,
    "geneticRiskSummary" TEXT,
    "atRiskMarkerCount" INTEGER NOT NULL DEFAULT 0,
    "damVerifiedCount" INTEGER NOT NULL DEFAULT 0,
    "proposedSeason" TEXT,
    "proposedMethod" TEXT,
    "replyMessage" TEXT,
    "repliedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stud_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "saved_pairings" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "kennelId" TEXT,
    "sireId" TEXT NOT NULL,
    "damId" TEXT NOT NULL,
    "label" TEXT,
    "notes" TEXT,
    "projectedCoi" DOUBLE PRECISION,
    "coiGenerations" INTEGER,
    "coiBand" TEXT,
    "coiConfidence" TEXT,
    "atRiskMarkerCount" INTEGER NOT NULL DEFAULT 0,
    "sharedAncestors" INTEGER NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "saved_pairings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stud_listings_dogId_key" ON "stud_listings"("dogId");

-- CreateIndex
CREATE INDEX "stud_listings_availability_studFeeCents_idx" ON "stud_listings"("availability", "studFeeCents");

-- CreateIndex
CREATE INDEX "stud_listings_publishedAt_idx" ON "stud_listings"("publishedAt");

-- CreateIndex
CREATE INDEX "stud_inquiries_studListingId_status_createdAt_idx" ON "stud_inquiries"("studListingId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "stud_inquiries_fromUserId_createdAt_idx" ON "stud_inquiries"("fromUserId", "createdAt");

-- CreateIndex
CREATE INDEX "saved_pairings_userId_createdAt_idx" ON "saved_pairings"("userId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "saved_pairings_userId_sireId_damId_key" ON "saved_pairings"("userId", "sireId", "damId");

-- AddForeignKey
ALTER TABLE "stud_listings" ADD CONSTRAINT "stud_listings_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stud_inquiries" ADD CONSTRAINT "stud_inquiries_studListingId_fkey" FOREIGN KEY ("studListingId") REFERENCES "stud_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stud_inquiries" ADD CONSTRAINT "stud_inquiries_damId_fkey" FOREIGN KEY ("damId") REFERENCES "dogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stud_inquiries" ADD CONSTRAINT "stud_inquiries_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_pairings" ADD CONSTRAINT "saved_pairings_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_pairings" ADD CONSTRAINT "saved_pairings_sireId_fkey" FOREIGN KEY ("sireId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "saved_pairings" ADD CONSTRAINT "saved_pairings_damId_fkey" FOREIGN KEY ("damId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


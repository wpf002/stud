-- CreateEnum
CREATE TYPE "LitterAvailability" AS ENUM ('NOT_LISTED', 'PLANNED', 'EXPECTING', 'AVAILABLE', 'FULLY_RESERVED', 'PAST');

-- AlterTable
ALTER TABLE "puppies" ADD COLUMN     "isPublic" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "priceCents" INTEGER,
ADD COLUMN     "publicNotes" TEXT;

-- CreateTable
CREATE TABLE "litter_listings" (
    "id" TEXT NOT NULL,
    "litterId" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "availability" "LitterAvailability" NOT NULL DEFAULT 'NOT_LISTED',
    "priceCentsFrom" INTEGER,
    "priceCentsTo" INTEGER,
    "depositCents" INTEGER,
    "priceNotes" TEXT,
    "headline" TEXT,
    "description" TEXT,
    "includedInPrice" TEXT,
    "buyerRequirements" TEXT,
    "goHomeFrom" TIMESTAMP(3),
    "photoUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cachedBreed" TEXT,
    "cachedRegion" TEXT,
    "cachedCountry" TEXT NOT NULL DEFAULT 'US',
    "cachedLatitude" DOUBLE PRECISION,
    "cachedLongitude" DOUBLE PRECISION,
    "cachedSireVerified" INTEGER NOT NULL DEFAULT 0,
    "cachedDamVerified" INTEGER NOT NULL DEFAULT 0,
    "cachedParentDensity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "cachedCoi" DOUBLE PRECISION,
    "cachedAvailablePups" INTEGER NOT NULL DEFAULT 0,
    "cachedTotalPups" INTEGER NOT NULL DEFAULT 0,
    "publishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "litter_listings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "litter_inquiries" (
    "id" TEXT NOT NULL,
    "litterListingId" TEXT NOT NULL,
    "fromUserId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "message" TEXT NOT NULL,
    "status" "InquiryStatus" NOT NULL DEFAULT 'NEW',
    "puppyId" TEXT,
    "householdNotes" TEXT,
    "hasOtherDogs" BOOLEAN,
    "hasChildren" BOOLEAN,
    "homeType" TEXT,
    "replyMessage" TEXT,
    "repliedAt" TIMESTAMP(3),
    "readAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "litter_inquiries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "litter_listings_litterId_key" ON "litter_listings"("litterId");

-- CreateIndex
CREATE UNIQUE INDEX "litter_listings_slug_key" ON "litter_listings"("slug");

-- CreateIndex
CREATE INDEX "litter_listings_availability_publishedAt_idx" ON "litter_listings"("availability", "publishedAt");

-- CreateIndex
CREATE INDEX "litter_listings_cachedBreed_availability_idx" ON "litter_listings"("cachedBreed", "availability");

-- CreateIndex
CREATE INDEX "litter_listings_cachedRegion_availability_idx" ON "litter_listings"("cachedRegion", "availability");

-- CreateIndex
CREATE INDEX "litter_listings_publishedAt_idx" ON "litter_listings"("publishedAt");

-- CreateIndex
CREATE INDEX "litter_inquiries_litterListingId_status_createdAt_idx" ON "litter_inquiries"("litterListingId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "litter_inquiries_email_createdAt_idx" ON "litter_inquiries"("email", "createdAt");

-- AddForeignKey
ALTER TABLE "litter_listings" ADD CONSTRAINT "litter_listings_litterId_fkey" FOREIGN KEY ("litterId") REFERENCES "litters"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "litter_inquiries" ADD CONSTRAINT "litter_inquiries_litterListingId_fkey" FOREIGN KEY ("litterListingId") REFERENCES "litter_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "litter_inquiries" ADD CONSTRAINT "litter_inquiries_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "litter_inquiries" ADD CONSTRAINT "litter_inquiries_puppyId_fkey" FOREIGN KEY ("puppyId") REFERENCES "puppies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- CreateEnum
CREATE TYPE "ReviewStatus" AS ENUM ('PUBLISHED', 'UNDER_REVIEW', 'REMOVED');

-- CreateEnum
CREATE TYPE "FunnelStep" AS ENUM ('LISTING_IMPRESSION', 'LISTING_VIEW', 'APPLY_STARTED', 'INQUIRY_SENT', 'APPLICATION_SUBMITTED', 'APPLICATION_APPROVED', 'DEPOSIT_PAID', 'PLACEMENT_COMPLETED');

-- CreateTable
CREATE TABLE "breeder_reviews" (
    "id" TEXT NOT NULL,
    "kennelId" TEXT NOT NULL,
    "applicationId" TEXT,
    "contractId" TEXT,
    "authorUserId" TEXT NOT NULL,
    "status" "ReviewStatus" NOT NULL DEFAULT 'PUBLISHED',
    "overall" INTEGER NOT NULL,
    "communication" INTEGER,
    "healthOfPuppy" INTEGER,
    "honestyAboutMatch" INTEGER,
    "supportAfterward" INTEGER,
    "title" TEXT,
    "body" TEXT NOT NULL,
    "daysAfterPlacement" INTEGER,
    "response" TEXT,
    "respondedAt" TIMESTAMP(3),
    "flaggedReason" TEXT,
    "flaggedAt" TIMESTAMP(3),
    "moderatedByUserId" TEXT,
    "moderationNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "breeder_reviews_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "funnel_events" (
    "id" TEXT NOT NULL,
    "step" "FunnelStep" NOT NULL,
    "litterListingId" TEXT,
    "kennelId" TEXT,
    "verifiedParentClaims" INTEGER NOT NULL DEFAULT 0,
    "parentDensity" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "hadConflict" BOOLEAN NOT NULL DEFAULT false,
    "sessionHash" TEXT,
    "channel" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "funnel_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "breeder_reviews_applicationId_key" ON "breeder_reviews"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "breeder_reviews_contractId_key" ON "breeder_reviews"("contractId");

-- CreateIndex
CREATE INDEX "breeder_reviews_kennelId_status_createdAt_idx" ON "breeder_reviews"("kennelId", "status", "createdAt");

-- CreateIndex
CREATE INDEX "breeder_reviews_authorUserId_idx" ON "breeder_reviews"("authorUserId");

-- CreateIndex
CREATE INDEX "funnel_events_step_occurredAt_idx" ON "funnel_events"("step", "occurredAt");

-- CreateIndex
CREATE INDEX "funnel_events_litterListingId_step_idx" ON "funnel_events"("litterListingId", "step");

-- CreateIndex
CREATE INDEX "funnel_events_occurredAt_idx" ON "funnel_events"("occurredAt");

-- AddForeignKey
ALTER TABLE "breeder_reviews" ADD CONSTRAINT "breeder_reviews_kennelId_fkey" FOREIGN KEY ("kennelId") REFERENCES "kennels"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeder_reviews" ADD CONSTRAINT "breeder_reviews_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeder_reviews" ADD CONSTRAINT "breeder_reviews_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "puppy_applications"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "breeder_reviews" ADD CONSTRAINT "breeder_reviews_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "funnel_events" ADD CONSTRAINT "funnel_events_litterListingId_fkey" FOREIGN KEY ("litterListingId") REFERENCES "litter_listings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

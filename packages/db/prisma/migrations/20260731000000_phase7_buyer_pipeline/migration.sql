-- CreateEnum
CREATE TYPE "ApplicationStage" AS ENUM ('SUBMITTED', 'IN_REVIEW', 'APPROVED', 'WAITLISTED', 'DEPOSIT_PAID', 'MATCHED', 'PAID_IN_FULL', 'COMPLETED', 'DECLINED', 'WITHDRAWN');

-- CreateTable
CREATE TABLE "puppy_applications" (
    "id" TEXT NOT NULL,
    "litterListingId" TEXT NOT NULL,
    "inquiryId" TEXT,
    "applicantUserId" TEXT,
    "stage" "ApplicationStage" NOT NULL DEFAULT 'SUBMITTED',
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT,
    "city" TEXT,
    "region" TEXT,
    "country" TEXT NOT NULL DEFAULT 'US',
    "intendedHome" TEXT,
    "homeType" TEXT,
    "hasFencedYard" BOOLEAN,
    "hoursAloneDaily" INTEGER,
    "hasChildren" BOOLEAN,
    "childrenAges" TEXT,
    "hasOtherPets" BOOLEAN,
    "otherPetsDetail" TEXT,
    "previousDogs" TEXT,
    "vetName" TEXT,
    "vetPhone" TEXT,
    "activityPlans" TEXT,
    "preferredSex" TEXT,
    "preferredColor" TEXT,
    "message" TEXT,
    "reviewNote" TEXT,
    "declineReason" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "manualPickPosition" INTEGER,
    "matchedPuppyId" TEXT,
    "matchedAt" TIMESTAMP(3),
    "depositPaidAt" TIMESTAMP(3),
    "contractId" TEXT,
    "submittedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "puppy_applications_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "application_events" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "fromStage" "ApplicationStage",
    "toStage" "ApplicationStage" NOT NULL,
    "note" TEXT,
    "actorUserId" TEXT,
    "automatic" BOOLEAN NOT NULL DEFAULT false,
    "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "application_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "puppy_handovers" (
    "id" TEXT NOT NULL,
    "applicationId" TEXT NOT NULL,
    "puppyId" TEXT NOT NULL,
    "collectedOn" TIMESTAMP(3) NOT NULL,
    "collectedBy" TEXT,
    "microchipRegistered" BOOLEAN NOT NULL DEFAULT false,
    "registrationPapers" BOOLEAN NOT NULL DEFAULT false,
    "healthCertificate" BOOLEAN NOT NULL DEFAULT false,
    "vaccinationRecord" BOOLEAN NOT NULL DEFAULT false,
    "wormingRecord" BOOLEAN NOT NULL DEFAULT false,
    "microchipNumber" TEXT,
    "foodProvided" TEXT,
    "itemsProvided" TEXT,
    "vetExamDueBy" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "puppy_handovers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "puppy_applications_inquiryId_key" ON "puppy_applications"("inquiryId");

-- CreateIndex
CREATE UNIQUE INDEX "puppy_applications_matchedPuppyId_key" ON "puppy_applications"("matchedPuppyId");

-- CreateIndex
CREATE UNIQUE INDEX "puppy_applications_contractId_key" ON "puppy_applications"("contractId");

-- CreateIndex
CREATE INDEX "puppy_applications_litterListingId_stage_submittedAt_idx" ON "puppy_applications"("litterListingId", "stage", "submittedAt");

-- CreateIndex
CREATE INDEX "puppy_applications_applicantUserId_submittedAt_idx" ON "puppy_applications"("applicantUserId", "submittedAt");

-- CreateIndex
CREATE INDEX "puppy_applications_email_idx" ON "puppy_applications"("email");

-- CreateIndex
CREATE INDEX "application_events_applicationId_occurredAt_idx" ON "application_events"("applicationId", "occurredAt");

-- CreateIndex
CREATE UNIQUE INDEX "puppy_handovers_applicationId_key" ON "puppy_handovers"("applicationId");

-- CreateIndex
CREATE UNIQUE INDEX "puppy_handovers_puppyId_key" ON "puppy_handovers"("puppyId");

-- CreateIndex
CREATE INDEX "puppy_handovers_collectedOn_idx" ON "puppy_handovers"("collectedOn");

-- AddForeignKey
ALTER TABLE "puppy_applications" ADD CONSTRAINT "puppy_applications_litterListingId_fkey" FOREIGN KEY ("litterListingId") REFERENCES "litter_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puppy_applications" ADD CONSTRAINT "puppy_applications_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "litter_inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puppy_applications" ADD CONSTRAINT "puppy_applications_applicantUserId_fkey" FOREIGN KEY ("applicantUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puppy_applications" ADD CONSTRAINT "puppy_applications_matchedPuppyId_fkey" FOREIGN KEY ("matchedPuppyId") REFERENCES "puppies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puppy_applications" ADD CONSTRAINT "puppy_applications_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "application_events" ADD CONSTRAINT "application_events_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "puppy_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puppy_handovers" ADD CONSTRAINT "puppy_handovers_applicationId_fkey" FOREIGN KEY ("applicationId") REFERENCES "puppy_applications"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "puppy_handovers" ADD CONSTRAINT "puppy_handovers_puppyId_fkey" FOREIGN KEY ("puppyId") REFERENCES "puppies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

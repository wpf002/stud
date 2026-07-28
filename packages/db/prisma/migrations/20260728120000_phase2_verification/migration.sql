-- CreateEnum
CREATE TYPE "VerificationState" AS ENUM ('UNVERIFIED', 'PENDING', 'VERIFIED', 'STALE', 'CONFLICTED');

-- CreateEnum
CREATE TYPE "VerificationSource" AS ENUM ('OFA', 'AKC', 'UKC', 'CKC', 'NAVHDA', 'AFTCA', 'PENNHIP', 'EMBARK', 'WISDOM', 'UC_DAVIS', 'PAW_PRINT', 'DOCUMENT', 'FIXTURE');

-- CreateEnum
CREATE TYPE "ClaimOutcome" AS ENUM ('NORMAL', 'CARRIER', 'AT_RISK', 'ABNORMAL', 'INCONCLUSIVE', 'INFORMATIONAL');

-- CreateEnum
CREATE TYPE "ClaimCategory" AS ENUM ('HEALTH', 'GENETIC', 'TITLE', 'REGISTRATION', 'PERFORMANCE');

-- CreateEnum
CREATE TYPE "LookupStatus" AS ENUM ('FOUND', 'NOT_FOUND', 'UNAVAILABLE', 'DISABLED', 'UNSUPPORTED_IDENTIFIER');

-- CreateEnum
CREATE TYPE "DocumentReviewStatus" AS ENUM ('QUEUED', 'IN_REVIEW', 'APPROVED', 'REJECTED');

-- CreateTable
CREATE TABLE "verified_claims" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "category" "ClaimCategory" NOT NULL,
    "markerName" TEXT NOT NULL DEFAULT '',
    "state" "VerificationState" NOT NULL DEFAULT 'UNVERIFIED',
    "source" "VerificationSource" NOT NULL,
    "outcome" "ClaimOutcome",
    "rawResult" TEXT,
    "sourceRecordId" TEXT,
    "sourceUrl" TEXT,
    "detail" TEXT,
    "testedAt" TIMESTAMP(3),
    "lastCheckedAt" TIMESTAMP(3),
    "staleAfter" TIMESTAMP(3),
    "matchedIdentifier" TEXT,
    "conflictRawResult" TEXT,
    "conflictOutcome" "ClaimOutcome",
    "conflictNote" TEXT,
    "conflictedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "verified_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "reported_claims" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "claimType" TEXT NOT NULL,
    "category" "ClaimCategory" NOT NULL,
    "markerName" TEXT NOT NULL DEFAULT '',
    "statedResult" TEXT NOT NULL,
    "statedTestedAt" TIMESTAMP(3),
    "note" TEXT,
    "reportedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "reported_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_checks" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "claimId" TEXT,
    "source" "VerificationSource" NOT NULL,
    "identifier" TEXT NOT NULL,
    "status" "LookupStatus" NOT NULL,
    "findingCount" INTEGER NOT NULL DEFAULT 0,
    "durationMs" INTEGER NOT NULL,
    "error" TEXT,
    "raw" JSONB,
    "actorType" TEXT NOT NULL DEFAULT 'user',
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_checks_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "verification_events" (
    "id" TEXT NOT NULL,
    "claimId" TEXT NOT NULL,
    "fromState" "VerificationState" NOT NULL,
    "toState" "VerificationState" NOT NULL,
    "trigger" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "source" "VerificationSource",
    "previousRawResult" TEXT,
    "observedRawResult" TEXT,
    "actorType" TEXT NOT NULL DEFAULT 'system',
    "actorUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "document_submissions" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "lab" TEXT NOT NULL,
    "documentUrl" TEXT NOT NULL,
    "fileName" TEXT,
    "mimeType" TEXT,
    "fileSize" INTEGER,
    "status" "DocumentReviewStatus" NOT NULL DEFAULT 'QUEUED',
    "ocrText" TEXT,
    "ocrSuggestions" JSONB,
    "reviewedFindings" JSONB,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "submittedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "document_submissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "dog_verification_summaries" (
    "dogId" TEXT NOT NULL,
    "verifiedCount" INTEGER NOT NULL DEFAULT 0,
    "reportedCount" INTEGER NOT NULL DEFAULT 0,
    "unverifiedCount" INTEGER NOT NULL DEFAULT 0,
    "staleCount" INTEGER NOT NULL DEFAULT 0,
    "conflictedCount" INTEGER NOT NULL DEFAULT 0,
    "healthNormalCount" INTEGER NOT NULL DEFAULT 0,
    "concerningCount" INTEGER NOT NULL DEFAULT 0,
    "verifiedTitleCount" INTEGER NOT NULL DEFAULT 0,
    "hasChic" BOOLEAN NOT NULL DEFAULT false,
    "density" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "computedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dog_verification_summaries_pkey" PRIMARY KEY ("dogId")
);

-- CreateIndex
CREATE INDEX "verified_claims_dogId_state_idx" ON "verified_claims"("dogId", "state");

-- CreateIndex
CREATE INDEX "verified_claims_state_staleAfter_idx" ON "verified_claims"("state", "staleAfter");

-- CreateIndex
CREATE INDEX "verified_claims_claimType_outcome_idx" ON "verified_claims"("claimType", "outcome");

-- CreateIndex
CREATE UNIQUE INDEX "verified_claims_dogId_claimType_markerName_source_key" ON "verified_claims"("dogId", "claimType", "markerName", "source");

-- CreateIndex
CREATE INDEX "reported_claims_dogId_idx" ON "reported_claims"("dogId");

-- CreateIndex
CREATE UNIQUE INDEX "reported_claims_dogId_claimType_markerName_key" ON "reported_claims"("dogId", "claimType", "markerName");

-- CreateIndex
CREATE INDEX "verification_checks_dogId_createdAt_idx" ON "verification_checks"("dogId", "createdAt");

-- CreateIndex
CREATE INDEX "verification_checks_source_status_createdAt_idx" ON "verification_checks"("source", "status", "createdAt");

-- CreateIndex
CREATE INDEX "verification_events_claimId_createdAt_idx" ON "verification_events"("claimId", "createdAt");

-- CreateIndex
CREATE INDEX "document_submissions_status_createdAt_idx" ON "document_submissions"("status", "createdAt");

-- CreateIndex
CREATE INDEX "document_submissions_dogId_idx" ON "document_submissions"("dogId");

-- CreateIndex
CREATE INDEX "dog_verification_summaries_density_idx" ON "dog_verification_summaries"("density");

-- CreateIndex
CREATE INDEX "dog_verification_summaries_healthNormalCount_idx" ON "dog_verification_summaries"("healthNormalCount");

-- AddForeignKey
ALTER TABLE "verified_claims" ADD CONSTRAINT "verified_claims_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reported_claims" ADD CONSTRAINT "reported_claims_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reported_claims" ADD CONSTRAINT "reported_claims_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_checks" ADD CONSTRAINT "verification_checks_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_checks" ADD CONSTRAINT "verification_checks_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "verified_claims"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "verification_events" ADD CONSTRAINT "verification_events_claimId_fkey" FOREIGN KEY ("claimId") REFERENCES "verified_claims"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_submissions" ADD CONSTRAINT "document_submissions_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_submissions" ADD CONSTRAINT "document_submissions_reviewedByUserId_fkey" FOREIGN KEY ("reviewedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "document_submissions" ADD CONSTRAINT "document_submissions_submittedByUserId_fkey" FOREIGN KEY ("submittedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "dog_verification_summaries" ADD CONSTRAINT "dog_verification_summaries_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;


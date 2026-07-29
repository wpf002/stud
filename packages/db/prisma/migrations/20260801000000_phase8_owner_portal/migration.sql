-- CreateEnum
CREATE TYPE "TransferKind" AS ENUM ('PLACEMENT', 'REHOME', 'RETURN_TO_BREEDER', 'CO_OWNERSHIP_CHANGE');

-- CreateEnum
CREATE TYPE "TransferStatus" AS ENUM ('PENDING', 'ACCEPTED', 'DECLINED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "HealthEventKind" AS ENUM ('VET_VISIT', 'VACCINATION', 'ILLNESS', 'INJURY', 'SURGERY', 'MEDICATION', 'ALTERATION', 'WEIGHT', 'DEATH', 'OTHER');

-- CreateTable
CREATE TABLE "ownership_transfers" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "kind" "TransferKind" NOT NULL,
    "status" "TransferStatus" NOT NULL DEFAULT 'PENDING',
    "fromUserId" TEXT,
    "toUserId" TEXT,
    "toEmail" TEXT NOT NULL,
    "toName" TEXT,
    "applicationId" TEXT,
    "handoverId" TEXT,
    "reason" TEXT,
    "contractId" TEXT,
    "contractRequiresReturn" BOOLEAN NOT NULL DEFAULT false,
    "breederNotifiedAt" TIMESTAMP(3),
    "breederAcknowledgedAt" TIMESTAMP(3),
    "proposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ownership_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "health_events" (
    "id" TEXT NOT NULL,
    "dogId" TEXT NOT NULL,
    "kind" "HealthEventKind" NOT NULL,
    "occurredOn" TIMESTAMP(3) NOT NULL,
    "title" TEXT NOT NULL,
    "detail" TEXT,
    "diagnosis" TEXT,
    "vetName" TEXT,
    "vetPhone" TEXT,
    "documentUrl" TEXT,
    "weightGrams" INTEGER,
    "sharedWithBreeder" BOOLEAN NOT NULL DEFAULT true,
    "guaranteeRelevant" BOOLEAN NOT NULL DEFAULT false,
    "reportedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "health_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ownership_transfers_dogId_proposedAt_idx" ON "ownership_transfers"("dogId", "proposedAt");

-- CreateIndex
CREATE INDEX "ownership_transfers_toEmail_status_idx" ON "ownership_transfers"("toEmail", "status");

-- CreateIndex
CREATE INDEX "ownership_transfers_toUserId_status_idx" ON "ownership_transfers"("toUserId", "status");

-- CreateIndex
CREATE INDEX "health_events_dogId_occurredOn_idx" ON "health_events"("dogId", "occurredOn");

-- CreateIndex
CREATE INDEX "health_events_kind_occurredOn_idx" ON "health_events"("kind", "occurredOn");

-- AddForeignKey
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_fromUserId_fkey" FOREIGN KEY ("fromUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_toUserId_fkey" FOREIGN KEY ("toUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ownership_transfers" ADD CONSTRAINT "ownership_transfers_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_dogId_fkey" FOREIGN KEY ("dogId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "health_events" ADD CONSTRAINT "health_events_reportedByUserId_fkey" FOREIGN KEY ("reportedByUserId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

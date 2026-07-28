-- CreateEnum
CREATE TYPE "ContractStatus" AS ENUM ('DRAFT', 'SENT', 'PARTIALLY_SIGNED', 'SIGNED', 'VOIDED', 'COMPLETED');

-- CreateEnum
CREATE TYPE "ContractKind" AS ENUM ('STUD_SERVICE', 'STUD_SERVICE_PICK_OF_LITTER', 'CO_OWNERSHIP', 'REPEAT_BREEDING_ONLY', 'PUPPY_SALE');

-- CreateEnum
CREATE TYPE "PartyRole" AS ENUM ('STUD_OWNER', 'BITCH_OWNER', 'CO_OWNER', 'BUYER', 'SELLER', 'WITNESS');

-- CreateEnum
CREATE TYPE "InstalmentStatus" AS ENUM ('PENDING', 'DUE', 'PAID', 'WAIVED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "EscrowStatus" AS ENUM ('EMPTY', 'HOLDING', 'PARTIALLY_RELEASED', 'RELEASED', 'REFUNDED', 'DISPUTED');

-- CreateEnum
CREATE TYPE "RepeatClaimStatus" AS ENUM ('SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'DECLINED', 'FULFILLED');

-- CreateTable
CREATE TABLE "contracts" (
    "id" TEXT NOT NULL,
    "kennelId" TEXT,
    "kind" "ContractKind" NOT NULL,
    "status" "ContractStatus" NOT NULL DEFAULT 'DRAFT',
    "title" TEXT NOT NULL,
    "clauses" JSONB NOT NULL,
    "renderedText" TEXT,
    "contentHash" TEXT,
    "healthSchedule" JSONB,
    "breedingId" TEXT,
    "sireId" TEXT,
    "damId" TEXT,
    "litterId" TEXT,
    "sentAt" TIMESTAMP(3),
    "signedAt" TIMESTAMP(3),
    "voidedAt" TIMESTAMP(3),
    "voidReason" TEXT,
    "completedAt" TIMESTAMP(3),
    "supersedesContractId" TEXT,
    "createdByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "contracts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_parties" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "role" "PartyRole" NOT NULL,
    "legalName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mustSign" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_parties_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "contract_signatures" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "legalName" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "typedName" TEXT NOT NULL,
    "consentText" TEXT NOT NULL,
    "documentHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "signedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "contract_signatures_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "payment_schedules" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "totalCents" INTEGER NOT NULL,
    "depositCents" INTEGER NOT NULL DEFAULT 0,
    "balanceTrigger" TEXT NOT NULL DEFAULT 'ON_CONFIRMED_PREGNANCY',
    "noLitterRemedy" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "payment_schedules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "instalments" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amountCents" INTEGER NOT NULL,
    "trigger" TEXT NOT NULL,
    "status" "InstalmentStatus" NOT NULL DEFAULT 'PENDING',
    "dueSince" TIMESTAMP(3),
    "paidAt" TIMESTAMP(3),
    "providerChargeId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "instalments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "escrow_holds" (
    "id" TEXT NOT NULL,
    "scheduleId" TEXT NOT NULL,
    "status" "EscrowStatus" NOT NULL DEFAULT 'EMPTY',
    "heldCents" INTEGER NOT NULL DEFAULT 0,
    "releasedCents" INTEGER NOT NULL DEFAULT 0,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "payeeUserId" TEXT,
    "payerUserId" TEXT,
    "disputeOpenedAt" TIMESTAMP(3),
    "disputeReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "escrow_holds_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ledger_entries" (
    "id" TEXT NOT NULL,
    "transactionId" TEXT NOT NULL,
    "accountKind" TEXT NOT NULL,
    "accountOwnerId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "reason" TEXT NOT NULL,
    "referenceType" TEXT NOT NULL,
    "referenceId" TEXT NOT NULL,
    "memo" TEXT,
    "reversesTransactionId" TEXT,
    "occurredAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ledger_entries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "repeat_breeding_claims" (
    "id" TEXT NOT NULL,
    "contractId" TEXT NOT NULL,
    "status" "RepeatClaimStatus" NOT NULL DEFAULT 'SUBMITTED',
    "reason" TEXT NOT NULL,
    "vetConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "vetDocumentUrl" TEXT,
    "failedBreedingId" TEXT,
    "repeatBreedingId" TEXT,
    "reviewedByUserId" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "submittedByUserId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "repeat_breeding_claims_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "collection_records" (
    "id" TEXT NOT NULL,
    "breedingId" TEXT NOT NULL,
    "collectedOn" TIMESTAMP(3) NOT NULL,
    "collectedBy" TEXT,
    "clinic" TEXT,
    "volumeMl" DOUBLE PRECISION,
    "concentrationMkml" DOUBLE PRECISION,
    "motilityPercent" INTEGER,
    "morphologyPercent" INTEGER,
    "totalMotileMillions" DOUBLE PRECISION,
    "shippedOn" TIMESTAMP(3),
    "shippingCarrier" TEXT,
    "trackingNumber" TEXT,
    "receivedOn" TIMESTAMP(3),
    "receivedCondition" TEXT,
    "inseminatedOn" TIMESTAMP(3),
    "inseminatedBy" TEXT,
    "method" TEXT,
    "documentUrl" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "collection_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "contracts_kennelId_status_idx" ON "contracts"("kennelId", "status");

-- CreateIndex
CREATE INDEX "contracts_breedingId_idx" ON "contracts"("breedingId");

-- CreateIndex
CREATE INDEX "contracts_status_createdAt_idx" ON "contracts"("status", "createdAt");

-- CreateIndex
CREATE INDEX "contract_parties_userId_idx" ON "contract_parties"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_parties_contractId_userId_key" ON "contract_parties"("contractId", "userId");

-- CreateIndex
CREATE INDEX "contract_signatures_contractId_idx" ON "contract_signatures"("contractId");

-- CreateIndex
CREATE UNIQUE INDEX "contract_signatures_contractId_userId_key" ON "contract_signatures"("contractId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "payment_schedules_contractId_key" ON "payment_schedules"("contractId");

-- CreateIndex
CREATE INDEX "instalments_status_dueSince_idx" ON "instalments"("status", "dueSince");

-- CreateIndex
CREATE UNIQUE INDEX "instalments_scheduleId_key_key" ON "instalments"("scheduleId", "key");

-- CreateIndex
CREATE UNIQUE INDEX "escrow_holds_scheduleId_key" ON "escrow_holds"("scheduleId");

-- CreateIndex
CREATE INDEX "escrow_holds_status_idx" ON "escrow_holds"("status");

-- CreateIndex
CREATE INDEX "ledger_entries_transactionId_idx" ON "ledger_entries"("transactionId");

-- CreateIndex
CREATE INDEX "ledger_entries_referenceType_referenceId_idx" ON "ledger_entries"("referenceType", "referenceId");

-- CreateIndex
CREATE INDEX "ledger_entries_accountKind_accountOwnerId_idx" ON "ledger_entries"("accountKind", "accountOwnerId");

-- CreateIndex
CREATE INDEX "repeat_breeding_claims_contractId_status_idx" ON "repeat_breeding_claims"("contractId", "status");

-- CreateIndex
CREATE INDEX "collection_records_breedingId_collectedOn_idx" ON "collection_records"("breedingId", "collectedOn");

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_breedingId_fkey" FOREIGN KEY ("breedingId") REFERENCES "breedings"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_sireId_fkey" FOREIGN KEY ("sireId") REFERENCES "dogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contracts" ADD CONSTRAINT "contracts_damId_fkey" FOREIGN KEY ("damId") REFERENCES "dogs"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_parties" ADD CONSTRAINT "contract_parties_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "contract_signatures" ADD CONSTRAINT "contract_signatures_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "payment_schedules" ADD CONSTRAINT "payment_schedules_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "instalments" ADD CONSTRAINT "instalments_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "payment_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "escrow_holds" ADD CONSTRAINT "escrow_holds_scheduleId_fkey" FOREIGN KEY ("scheduleId") REFERENCES "payment_schedules"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "repeat_breeding_claims" ADD CONSTRAINT "repeat_breeding_claims_contractId_fkey" FOREIGN KEY ("contractId") REFERENCES "contracts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "collection_records" ADD CONSTRAINT "collection_records_breedingId_fkey" FOREIGN KEY ("breedingId") REFERENCES "breedings"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- CreateEnum
CREATE TYPE "StudBookingStatus" AS ENUM ('REQUESTED', 'ACCEPTED', 'DECLINED', 'WITHDRAWN', 'CANCELLED', 'COMPLETED');

-- AlterTable
ALTER TABLE "stud_listings" ADD COLUMN     "bookedThrough" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "stud_bookings" (
    "id" TEXT NOT NULL,
    "studListingId" TEXT NOT NULL,
    "inquiryId" TEXT,
    "damId" TEXT NOT NULL,
    "requestedByUserId" TEXT NOT NULL,
    "fromKennelId" TEXT,
    "windowStart" DATE NOT NULL,
    "windowEnd" DATE NOT NULL,
    "status" "StudBookingStatus" NOT NULL DEFAULT 'REQUESTED',
    "method" "BreedingMethod",
    "message" TEXT,
    "depositCents" INTEGER,
    "depositPaidAt" TIMESTAMP(3),
    "depositChargeId" TEXT,
    "respondedAt" TIMESTAMP(3),
    "declineReason" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "stud_bookings_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "stud_bookings_inquiryId_key" ON "stud_bookings"("inquiryId");

-- CreateIndex
CREATE INDEX "stud_bookings_studListingId_status_windowStart_idx" ON "stud_bookings"("studListingId", "status", "windowStart");

-- CreateIndex
CREATE INDEX "stud_bookings_requestedByUserId_createdAt_idx" ON "stud_bookings"("requestedByUserId", "createdAt");

-- AddForeignKey
ALTER TABLE "stud_bookings" ADD CONSTRAINT "stud_bookings_studListingId_fkey" FOREIGN KEY ("studListingId") REFERENCES "stud_listings"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stud_bookings" ADD CONSTRAINT "stud_bookings_inquiryId_fkey" FOREIGN KEY ("inquiryId") REFERENCES "stud_inquiries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stud_bookings" ADD CONSTRAINT "stud_bookings_damId_fkey" FOREIGN KEY ("damId") REFERENCES "dogs"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stud_bookings" ADD CONSTRAINT "stud_bookings_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

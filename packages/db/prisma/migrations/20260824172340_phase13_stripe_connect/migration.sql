-- AlterTable
ALTER TABLE "kennels" ADD COLUMN     "payoutsEnabled" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "stripeAccountId" TEXT,
ADD COLUMN     "stripeCheckedAt" TIMESTAMP(3);

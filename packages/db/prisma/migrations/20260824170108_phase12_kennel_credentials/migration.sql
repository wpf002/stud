-- AlterTable
ALTER TABLE "kennels" ADD COLUMN     "credentials" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Biller" ADD COLUMN     "refillMode" TEXT NOT NULL DEFAULT 'DISCOUNT';

-- AlterTable
ALTER TABLE "BillerTxn" ADD COLUMN     "commission" BIGINT NOT NULL DEFAULT 0;

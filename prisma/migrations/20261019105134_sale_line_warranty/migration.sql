-- AlterTable
ALTER TABLE "SaleLine" ADD COLUMN     "warranty" TEXT,
ADD COLUMN     "warrantyDays" INTEGER NOT NULL DEFAULT 0;

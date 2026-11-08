-- AlterTable
ALTER TABLE "ItemSerial" ADD COLUMN     "batteryHealth" INTEGER,
ADD COLUMN     "qcAt" TIMESTAMP(3),
ADD COLUMN     "qcNote" TEXT,
ADD COLUMN     "repairCost" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "repairJobId" TEXT;

-- AlterTable
ALTER TABLE "Purchase" ADD COLUMN     "tradeIn" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "RepairJob" ADD COLUMN     "laborCost" BIGINT NOT NULL DEFAULT 0,
ADD COLUMN     "serialId" TEXT;

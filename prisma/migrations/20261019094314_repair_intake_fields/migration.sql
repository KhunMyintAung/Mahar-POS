-- AlterTable
ALTER TABLE "RepairJob" ADD COLUMN     "intakeCondition" TEXT,
ADD COLUMN     "priority" TEXT NOT NULL DEFAULT 'NORMAL';

-- CreateIndex
CREATE INDEX "RepairJob_businessId_imei_idx" ON "RepairJob"("businessId", "imei");

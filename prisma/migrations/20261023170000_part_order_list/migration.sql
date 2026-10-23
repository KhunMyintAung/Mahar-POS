-- The per-repair note is replaced by a list of its own.
ALTER TABLE "RepairJob" DROP COLUMN "orderItems";

-- The shop's order list: parts customers asked the shop to get.
CREATE TABLE "PartOrder" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "item" TEXT NOT NULL,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "deposit" BIGINT NOT NULL DEFAULT 0,
    "note" TEXT,
    "status" TEXT NOT NULL DEFAULT 'WAITING',
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PartOrder_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "PartOrder_businessId_status_createdAt_idx" ON "PartOrder"("businessId", "status", "createdAt");

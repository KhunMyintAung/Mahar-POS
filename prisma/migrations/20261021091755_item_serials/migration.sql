-- AlterTable
ALTER TABLE "Item" ADD COLUMN     "trackSerial" BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE "ItemSerial" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "imei" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_STOCK',
    "purchaseId" TEXT,
    "saleId" TEXT,
    "saleLineId" TEXT,
    "notes" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "soldAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ItemSerial_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ItemSerial_businessId_itemId_status_idx" ON "ItemSerial"("businessId", "itemId", "status");

-- CreateIndex
CREATE INDEX "ItemSerial_saleId_idx" ON "ItemSerial"("saleId");

-- CreateIndex
CREATE INDEX "ItemSerial_purchaseId_idx" ON "ItemSerial"("purchaseId");

-- CreateIndex
CREATE UNIQUE INDEX "ItemSerial_businessId_imei_key" ON "ItemSerial"("businessId", "imei");

-- AddForeignKey
ALTER TABLE "ItemSerial" ADD CONSTRAINT "ItemSerial_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "Contact" ADD COLUMN     "mspAddress" TEXT;

-- CreateTable
CREATE TABLE "MspAward" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "saleId" TEXT NOT NULL,
    "customerId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "batchId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MspAward_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MspBatch" (
    "id" SERIAL NOT NULL,
    "recipients" TEXT NOT NULL,
    "total" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "txHash" TEXT,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MspBatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "MspAward_saleId_key" ON "MspAward"("saleId");

-- CreateIndex
CREATE INDEX "MspAward_status_idx" ON "MspAward"("status");

-- CreateIndex
CREATE INDEX "MspAward_customerId_idx" ON "MspAward"("customerId");

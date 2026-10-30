-- AlterTable
ALTER TABLE "MspReward" ALTER COLUMN "status" SET DEFAULT 'CREDITED';

-- CreateTable
CREATE TABLE "MspTransfer" (
    "id" TEXT NOT NULL,
    "fromBusinessId" TEXT NOT NULL,
    "toBusinessId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "note" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "MspTransfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MspWithdrawal" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL,
    "address" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "nonce" INTEGER,
    "txHash" TEXT,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MspWithdrawal_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MspTransfer_fromBusinessId_idx" ON "MspTransfer"("fromBusinessId");

-- CreateIndex
CREATE INDEX "MspTransfer_toBusinessId_idx" ON "MspTransfer"("toBusinessId");

-- CreateIndex
CREATE INDEX "MspWithdrawal_businessId_idx" ON "MspWithdrawal"("businessId");

-- CreateIndex
CREATE INDEX "MspWithdrawal_status_idx" ON "MspWithdrawal"("status");

-- Rewards not yet paid out now sit in the shop's MSP wallet.
UPDATE "MspReward" SET "status" = 'CREDITED' WHERE "status" = 'PENDING';

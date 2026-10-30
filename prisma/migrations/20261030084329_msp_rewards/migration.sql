-- CreateTable
CREATE TABLE "MspReward" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "day" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "address" TEXT,
    "nonce" INTEGER,
    "txHash" TEXT,
    "sentAt" TIMESTAMP(3),
    "lastError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MspReward_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "MspReward_status_idx" ON "MspReward"("status");

-- CreateIndex
CREATE UNIQUE INDEX "MspReward_businessId_kind_day_key" ON "MspReward"("businessId", "kind", "day");

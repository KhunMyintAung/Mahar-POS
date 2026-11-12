-- CreateTable
CREATE TABLE "VpnPlan" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "limitBytes" BIGINT,
    "price" BIGINT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VpnPlan_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VpnOrder" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "customerName" TEXT NOT NULL,
    "username" TEXT,
    "planId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "days" INTEGER NOT NULL,
    "limitBytes" BIGINT,
    "price" BIGINT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "renewKeyId" TEXT,
    "keySent" BOOLEAN NOT NULL DEFAULT false,
    "decidedById" TEXT,
    "decidedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VpnOrder_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "VpnPlan_businessId_idx" ON "VpnPlan"("businessId");

-- CreateIndex
CREATE INDEX "VpnOrder_businessId_createdAt_idx" ON "VpnOrder"("businessId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "VpnOrder_businessId_orderNo_key" ON "VpnOrder"("businessId", "orderNo");

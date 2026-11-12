-- VPN keys sold on one shop's Telegram bot; the keys themselves live on its Outline server.
-- CreateTable
CREATE TABLE "VpnKey" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "outlineKeyId" TEXT NOT NULL,
    "planName" TEXT NOT NULL,
    "dataLimitBytes" BIGINT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "remindedAt" TIMESTAMP(3),
    "disabledAt" TIMESTAMP(3),
    "deletedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "VpnKey_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "VpnKey_orderId_key" ON "VpnKey"("orderId");

-- CreateIndex
CREATE INDEX "VpnKey_businessId_chatId_idx" ON "VpnKey"("businessId", "chatId");

-- CreateIndex
CREATE INDEX "VpnKey_expiresAt_idx" ON "VpnKey"("expiresAt");

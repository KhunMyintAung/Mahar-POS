-- Customers who checked a repair on the shop's Telegram bot, told when it is ready.
-- CreateTable
CREATE TABLE "RepairWatch" (
    "id" TEXT NOT NULL,
    "repairJobId" TEXT NOT NULL,
    "ownerUserId" TEXT NOT NULL,
    "chatId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairWatch_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "RepairWatch_repairJobId_chatId_key" ON "RepairWatch"("repairJobId", "chatId");

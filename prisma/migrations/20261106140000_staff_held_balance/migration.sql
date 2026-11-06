-- Advances are no longer expenses: new ones have no expense record.
ALTER TABLE "StaffAdvance" ALTER COLUMN "expenseId" DROP NOT NULL;

-- The no days off bonus goes into the held balance at payday.
ALTER TABLE "StaffSalaryPayment" ADD COLUMN "bonusHeld" BIGINT NOT NULL DEFAULT 0;

-- Profit bonuses kept in the held balance.
ALTER TABLE "StaffBonus" ALTER COLUMN "walletId" DROP NOT NULL;
ALTER TABLE "StaffBonus" ALTER COLUMN "expenseId" DROP NOT NULL;
ALTER TABLE "StaffBonus" ADD COLUMN "held" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "StaffBonus" ADD COLUMN "month" TEXT;

-- Withdrawals from the held balance: a profit part (withdrawal) and an expense part.
ALTER TABLE "StaffDepositReturn" ALTER COLUMN "expenseId" DROP NOT NULL;
ALTER TABLE "StaffDepositReturn" ADD COLUMN "profitAmount" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "StaffDepositReturn" ADD COLUMN "withdrawId" TEXT;

CREATE TABLE "BossShareTake" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "shares" JSONB NOT NULL,
    "walletId" TEXT NOT NULL,
    "withdrawId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    CONSTRAINT "BossShareTake_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "BossShareTake_businessId_month_idx" ON "BossShareTake"("businessId", "month");

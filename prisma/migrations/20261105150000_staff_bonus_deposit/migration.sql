-- Staff: a bonus for a month with no days off, and a deposit kept from each salary
-- (paid back after six months).
ALTER TABLE "Staff" ADD COLUMN "attendanceBonus" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "Staff" ADD COLUMN "deposit" BIGINT NOT NULL DEFAULT 0;

ALTER TABLE "StaffSalaryPayment" ADD COLUMN "attendanceBonus" BIGINT NOT NULL DEFAULT 0;
ALTER TABLE "StaffSalaryPayment" ADD COLUMN "deposit" BIGINT NOT NULL DEFAULT 0;

-- A bonus paid on its own (year end, Thingyan…).
CREATE TABLE "StaffBonus" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "date" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    CONSTRAINT "StaffBonus_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StaffBonus_businessId_staffId_idx" ON "StaffBonus"("businessId", "staffId");

-- Deposit paid back to a member of staff.
CREATE TABLE "StaffDepositReturn" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "date" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    CONSTRAINT "StaffDepositReturn_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StaffDepositReturn_businessId_staffId_idx" ON "StaffDepositReturn"("businessId", "staffId");

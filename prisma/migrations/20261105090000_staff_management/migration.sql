-- Staff Management: staff, attendance, advances and salary payments.
CREATE TABLE "Staff" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT,
    "position" TEXT,
    "salary" BIGINT NOT NULL DEFAULT 0,
    "startDate" TEXT,
    "userId" TEXT,
    "note" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Staff_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "Staff_businessId_active_idx" ON "Staff"("businessId", "active");

CREATE TABLE "StaffAttendance" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StaffAttendance_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "StaffAttendance_staffId_date_key" ON "StaffAttendance"("staffId", "date");
CREATE INDEX "StaffAttendance_businessId_date_idx" ON "StaffAttendance"("businessId", "date");

CREATE TABLE "StaffAdvance" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "date" TEXT NOT NULL,
    "walletId" TEXT NOT NULL,
    "expenseId" TEXT NOT NULL,
    "salaryPaymentId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "StaffAdvance_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StaffAdvance_businessId_staffId_idx" ON "StaffAdvance"("businessId", "staffId");

CREATE TABLE "StaffSalaryPayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "staffId" TEXT NOT NULL,
    "month" TEXT NOT NULL,
    "baseSalary" BIGINT NOT NULL,
    "absentDays" DECIMAL(5,1) NOT NULL DEFAULT 0,
    "absentDeduction" BIGINT NOT NULL DEFAULT 0,
    "advanceDeduction" BIGINT NOT NULL DEFAULT 0,
    "commission" BIGINT NOT NULL DEFAULT 0,
    "bonus" BIGINT NOT NULL DEFAULT 0,
    "otherDeduction" BIGINT NOT NULL DEFAULT 0,
    "net" BIGINT NOT NULL,
    "walletId" TEXT NOT NULL,
    "expenseId" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),

    CONSTRAINT "StaffSalaryPayment_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "StaffSalaryPayment_businessId_month_idx" ON "StaffSalaryPayment"("businessId", "month");
CREATE INDEX "StaffSalaryPayment_staffId_month_idx" ON "StaffSalaryPayment"("staffId", "month");

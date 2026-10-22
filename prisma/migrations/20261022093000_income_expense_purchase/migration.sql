-- AlterTable
ALTER TABLE "IncomeExpense" ADD COLUMN "purchaseId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "IncomeExpense_purchaseId_key" ON "IncomeExpense"("purchaseId");

-- AlterTable
ALTER TABLE "IncomeExpense" ADD COLUMN "billerTxnId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "IncomeExpense_billerTxnId_key" ON "IncomeExpense"("billerTxnId");

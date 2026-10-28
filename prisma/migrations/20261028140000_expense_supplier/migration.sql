-- An expense can name the supplier it was paid to, so a month's payments add up per supplier.
ALTER TABLE "IncomeExpense" ADD COLUMN "supplierId" TEXT;
CREATE INDEX "IncomeExpense_businessId_supplierId_date_idx" ON "IncomeExpense"("businessId", "supplierId", "date");

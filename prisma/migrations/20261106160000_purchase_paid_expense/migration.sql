-- What a purchase was bought for (SALE / SERVICE), kept so its expense can go in when the
-- supplier is paid later.
ALTER TABLE "Purchase" ADD COLUMN "line" TEXT;

-- The expense of a payment to a supplier for a purchase on credit: the payment moved the
-- money, the entry records the cost.
ALTER TABLE "IncomeExpense" ADD COLUMN "payablePaymentId" TEXT;
ALTER TABLE "IncomeExpense" ADD COLUMN "fromPurchaseId" TEXT;
CREATE UNIQUE INDEX "IncomeExpense_payablePaymentId_key" ON "IncomeExpense"("payablePaymentId");
CREATE INDEX "IncomeExpense_fromPurchaseId_idx" ON "IncomeExpense"("fromPurchaseId");

-- Purchases already in expense keep the side they were filed under.
UPDATE "Purchase" p SET "line" = CASE WHEN c."systemKey" = 'DAILY_SERVICE' THEN 'SERVICE' ELSE 'SALE' END
FROM "IncomeExpense" e LEFT JOIN "Category" c ON c.id = e."categoryId"
WHERE e."purchaseId" = p.id AND e.status = 'COMPLETED';

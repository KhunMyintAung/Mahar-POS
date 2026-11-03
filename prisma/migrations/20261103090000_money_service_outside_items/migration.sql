-- Money transfer / cash-out done for customers, with the shop's fee.
CREATE TABLE "MoneyService" (
    "id" TEXT NOT NULL,
    "txnNo" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "branchId" TEXT,
    "kind" TEXT NOT NULL,
    "accountWalletId" TEXT NOT NULL,
    "cashWalletId" TEXT NOT NULL,
    "amount" BIGINT NOT NULL,
    "fee" BIGINT NOT NULL DEFAULT 0,
    "feeIncomeId" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "note" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "voidedAt" TIMESTAMP(3),
    "voidedById" TEXT,
    "voidReason" TEXT,

    CONSTRAINT "MoneyService_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MoneyService_businessId_txnNo_key" ON "MoneyService"("businessId", "txnNo");
CREATE INDEX "MoneyService_businessId_createdAt_idx" ON "MoneyService"("businessId", "createdAt");

-- A sale of goods fetched from another shop: what the shop owes that shop for them.
ALTER TABLE "Sale" ADD COLUMN "outsidePayableId" TEXT;

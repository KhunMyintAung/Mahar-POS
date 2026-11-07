-- The fee on a transfer between the shop's own wallets is filed as an expense (Transfer Fee);
-- the transfer keeps a link to it so reversing the transfer reverses the fee too.
ALTER TABLE "WalletTransfer" ADD COLUMN "feeExpenseId" TEXT;
CREATE UNIQUE INDEX "WalletTransfer_feeExpenseId_key" ON "WalletTransfer"("feeExpenseId");

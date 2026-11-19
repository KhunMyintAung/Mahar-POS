-- Two paid levels (Pro, Fully Access) and a second way to pay (Thai PromptPay, in baht).
ALTER TABLE "Business" ADD COLUMN "proTier" TEXT;
ALTER TABLE "ProPayment" ADD COLUMN "tier" TEXT NOT NULL DEFAULT 'PRO';
ALTER TABLE "ProPayment" ADD COLUMN "amountThb" INTEGER;
ALTER TABLE "ProPayment" ADD COLUMN "revertProTier" TEXT;

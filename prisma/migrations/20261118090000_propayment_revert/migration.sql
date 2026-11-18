-- The shop's Pro end date before an approval, so voiding a mistaken approval restores it exactly.
ALTER TABLE "ProPayment" ADD COLUMN "revertProUntil" TIMESTAMP(3);

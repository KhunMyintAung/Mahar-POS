-- A sale rung up at the till without the internet is kept on the device and sent later.
-- clientRef is the device's own id for it, so a resend after a lost reply records it once;
-- offlineAt is when it was actually made.
ALTER TABLE "Sale" ADD COLUMN "clientRef" TEXT;
ALTER TABLE "Sale" ADD COLUMN "offlineAt" TIMESTAMP(3);
CREATE UNIQUE INDEX "Sale_businessId_clientRef_key" ON "Sale"("businessId", "clientRef");

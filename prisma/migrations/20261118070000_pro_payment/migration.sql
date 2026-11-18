-- A shop's manual Pro payment: picks a length, pays KBZ Pay, uploads the slip, operator approves.
CREATE TABLE "ProPayment" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "months" INTEGER NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "method" TEXT NOT NULL DEFAULT 'KBZPAY',
    "slipUrl" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "note" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ProPayment_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ProPayment_businessId_idx" ON "ProPayment"("businessId");
CREATE INDEX "ProPayment_status_idx" ON "ProPayment"("status");

ALTER TABLE "ProPayment" ADD CONSTRAINT "ProPayment_businessId_fkey" FOREIGN KEY ("businessId") REFERENCES "Business"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

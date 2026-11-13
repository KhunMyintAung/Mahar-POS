-- CreateTable
CREATE TABLE "RepairNumberBlock" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "first" INTEGER NOT NULL,
    "last" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RepairNumberBlock_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientOp" (
    "clientRef" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "refId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientOp_pkey" PRIMARY KEY ("clientRef")
);

-- CreateIndex
CREATE INDEX "RepairNumberBlock_businessId_deviceId_idx" ON "RepairNumberBlock"("businessId", "deviceId");

-- CreateIndex
CREATE INDEX "ClientOp_businessId_createdAt_idx" ON "ClientOp"("businessId", "createdAt");

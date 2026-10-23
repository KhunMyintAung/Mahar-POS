-- Online Shop: a shop address, items shown online with photos, and customers' orders.

-- AlterTable
ALTER TABLE "Business" ADD COLUMN "shopSlug" TEXT;
ALTER TABLE "Item" ADD COLUMN "onlineVisible" BOOLEAN NOT NULL DEFAULT false;

-- CreateIndex
CREATE UNIQUE INDEX "Business_shopSlug_key" ON "Business"("shopSlug");

-- CreateTable
CREATE TABLE "ItemImage" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "mime" TEXT NOT NULL,
    "data" BYTEA NOT NULL,
    "sort" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ItemImage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ItemImage_itemId_sort_idx" ON "ItemImage"("itemId", "sort");
ALTER TABLE "ItemImage" ADD CONSTRAINT "ItemImage_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "Item"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CreateTable
CREATE TABLE "OnlineOrder" (
    "id" TEXT NOT NULL,
    "businessId" TEXT NOT NULL,
    "orderNo" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'NEW',
    "customerName" TEXT NOT NULL,
    "customerPhone" TEXT NOT NULL,
    "address" TEXT,
    "note" TEXT,
    "total" BIGINT NOT NULL,
    "saleId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "OnlineOrder_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "OnlineOrder_businessId_orderNo_key" ON "OnlineOrder"("businessId", "orderNo");
CREATE INDEX "OnlineOrder_businessId_createdAt_idx" ON "OnlineOrder"("businessId", "createdAt");

-- CreateTable
CREATE TABLE "OnlineOrderLine" (
    "id" TEXT NOT NULL,
    "orderId" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "unitPrice" BIGINT NOT NULL,
    CONSTRAINT "OnlineOrderLine_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "OnlineOrderLine" ADD CONSTRAINT "OnlineOrderLine_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "OnlineOrder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

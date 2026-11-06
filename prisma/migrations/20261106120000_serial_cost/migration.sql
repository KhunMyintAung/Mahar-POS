-- Each IMEI unit keeps what it cost when bought.
ALTER TABLE "ItemSerial" ADD COLUMN "cost" BIGINT;

-- Units already bought through a purchase: that purchase line's unit cost.
UPDATE "ItemSerial" s
SET "cost" = pl."unitCost"
FROM "PurchaseLine" pl
WHERE s."purchaseId" IS NOT NULL AND pl."purchaseId" = s."purchaseId" AND pl."itemId" = s."itemId" AND pl."unitCost" > 0;

-- A second-hand phone's condition and battery health.
ALTER TABLE "Item" ADD COLUMN "condition" TEXT;
ALTER TABLE "Item" ADD COLUMN "batteryHealth" INTEGER;

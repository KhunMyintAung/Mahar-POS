-- Repair jobs: a plain note of the parts to order for the repair.
ALTER TABLE "RepairJob" ADD COLUMN "orderItems" TEXT;

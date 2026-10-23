-- Order list steps: to order, ordered from a supplier, received.
ALTER TABLE "PartOrder" ADD COLUMN "supplier" TEXT;
ALTER TABLE "PartOrder" ADD COLUMN "orderedAt" TIMESTAMP(3);
ALTER TABLE "PartOrder" ALTER COLUMN "status" SET DEFAULT 'TODO';
UPDATE "PartOrder" SET "status" = 'TODO' WHERE "status" = 'WAITING';
UPDATE "PartOrder" SET "status" = 'RECEIVED' WHERE "status" IN ('GOT', 'DONE');

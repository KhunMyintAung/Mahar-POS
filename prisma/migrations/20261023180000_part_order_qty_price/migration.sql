-- Order list: how many, and the price the supplier quoted.
ALTER TABLE "PartOrder" ADD COLUMN "quantity" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "PartOrder" ADD COLUMN "price" BIGINT NOT NULL DEFAULT 0;

-- Variants, the light way: items sharing a model are shown together; each keeps its own row.
ALTER TABLE "Item" ADD COLUMN "model" TEXT;
ALTER TABLE "Item" ADD COLUMN "variant" TEXT;
CREATE INDEX "Item_businessId_model_idx" ON "Item"("businessId", "model");

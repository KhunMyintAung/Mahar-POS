-- AlterTable
ALTER TABLE "Category" ADD COLUMN     "systemKey" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "Category_businessId_type_systemKey_key" ON "Category"("businessId", "type", "systemKey");

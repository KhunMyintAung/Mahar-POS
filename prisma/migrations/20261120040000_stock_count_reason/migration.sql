-- Why a counted item differs from the books, picked while counting; carried into the stock movement note.
ALTER TABLE "StockCountLine" ADD COLUMN "reason" TEXT;

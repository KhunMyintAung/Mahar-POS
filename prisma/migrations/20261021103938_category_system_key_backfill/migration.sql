-- Existing categories that carry a standard name take the standard key, so the dashboard
-- groups them correctly from the first request after this deploy. Shops without them get
-- the missing ones the first time their category list is read.
UPDATE "Category" SET "systemKey" = 'DAILY_SERVICE' WHERE "systemKey" IS NULL AND "type" = 'INCOME'  AND lower("name") = 'daily service income';
UPDATE "Category" SET "systemKey" = 'DAILY_SALE'    WHERE "systemKey" IS NULL AND "type" = 'INCOME'  AND lower("name") = 'daily sale income';
UPDATE "Category" SET "systemKey" = 'DAILY_BILL'    WHERE "systemKey" IS NULL AND "type" = 'INCOME'  AND lower("name") = 'daily bill income';
UPDATE "Category" SET "systemKey" = 'DAILY_GENERAL' WHERE "systemKey" IS NULL AND "type" = 'INCOME'  AND lower("name") = 'daily general income';
UPDATE "Category" SET "systemKey" = 'DAILY_SERVICE' WHERE "systemKey" IS NULL AND "type" = 'EXPENSE' AND lower("name") = 'daily service expense';
UPDATE "Category" SET "systemKey" = 'DAILY_SALE'    WHERE "systemKey" IS NULL AND "type" = 'EXPENSE' AND lower("name") = 'daily sale expense';
UPDATE "Category" SET "systemKey" = 'DAILY_BILL'    WHERE "systemKey" IS NULL AND "type" = 'EXPENSE' AND lower("name") = 'daily bill expense';
UPDATE "Category" SET "systemKey" = 'DAILY_GENERAL' WHERE "systemKey" IS NULL AND "type" = 'EXPENSE' AND lower("name") = 'daily general expense';

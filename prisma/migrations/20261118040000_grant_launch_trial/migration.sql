-- Every existing shop gets a 60-day Pro trial from launch (deploy time).
UPDATE "Business" SET "proUntil" = now() + interval '60 days' WHERE "proUntil" IS NULL;

-- The Service Tech role (repairs and their parts, no money) for every shop that has not got
-- a role of that name yet; new shops get it at sign-up (DEFAULT_ROLES).
INSERT INTO "Role" ("id", "businessId", "name", "description", "permissions", "isSystem")
SELECT gen_random_uuid()::text, b."id", 'Service Tech', 'Repairs and their parts, no money',
       '["repair.view","repair.create","repair.update","item.view","stock.view","stock.adjust","customer.view"]', true
FROM "Business" b
WHERE NOT EXISTS (SELECT 1 FROM "Role" r WHERE r."businessId" = b."id" AND r."name" = 'Service Tech');

-- When a user's email address was proven to be theirs. Signing up never checked it, so an
-- address typed into a sign-up form is no proof: Google sign-in and the admin list only
-- trust a verified one.
ALTER TABLE "User" ADD COLUMN "emailVerifiedAt" TIMESTAMP(3);

-- Accounts that have already signed up or in with Google have shown Google owns the address.
UPDATE "User" u SET "emailVerifiedAt" = sub.first_at
FROM (
  SELECT a."userId", MIN(a."createdAt") AS first_at
  FROM "AuditLog" a
  WHERE a."userId" IS NOT NULL
    AND a.action IN ('LOGIN', 'REGISTER')
    AND a.after LIKE '%"method":"google"%'
  GROUP BY a."userId"
) sub
-- A Google sign-in once matched on a username that was an address, so it only proves the
-- email field when the username was not some other address.
WHERE u.id = sub."userId" AND u.email IS NOT NULL
  AND (u.username NOT LIKE '%@%' OR u.username = u.email);

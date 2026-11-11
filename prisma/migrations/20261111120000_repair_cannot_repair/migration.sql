-- A repair that could not be done stays marked as such after the device goes back to its
-- owner (status DELIVERED), so the list can tell "returned, not repaired" from a repaired one.
ALTER TABLE "RepairJob" ADD COLUMN "cannotRepair" BOOLEAN NOT NULL DEFAULT false;

-- Still in the shop, waiting to be collected.
UPDATE "RepairJob" SET "cannotRepair" = true WHERE "status" = 'CANNOT_REPAIR';

-- Already handed back: the audit log kept the status each job was delivered from.
UPDATE "RepairJob" r SET "cannotRepair" = true
FROM "AuditLog" a
WHERE a."resourceType" = 'RepairJob' AND a."resourceId" = r."id" AND a."action" = 'DELIVER'
  AND a."before" LIKE '%"status":"CANNOT_REPAIR"%'
  AND r."status" = 'DELIVERED';

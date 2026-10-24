-- Repair jobs: who repairs it, by name (a technician need not have a login).
ALTER TABLE "RepairJob" ADD COLUMN "technicianName" TEXT;

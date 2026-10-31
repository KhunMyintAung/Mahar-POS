-- Mahar Shwe Point (MSP) is withdrawn: its tables, the customer wallet address and its settings go.
DROP TABLE IF EXISTS "MspWithdrawal";
DROP TABLE IF EXISTS "MspTransfer";
DROP TABLE IF EXISTS "MspReward";
DROP TABLE IF EXISTS "MspBatch";
DROP TABLE IF EXISTS "MspAward";
ALTER TABLE "Contact" DROP COLUMN IF EXISTS "mspAddress";
DELETE FROM "SystemSetting" WHERE "key" IN ('msp', 'msp_rewards', 'msp_wallet');
DELETE FROM "PlatformSetting" WHERE "key" IN ('msp', 'msp_rewards', 'msp_wallet');

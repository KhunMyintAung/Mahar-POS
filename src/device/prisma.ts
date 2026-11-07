// "@/lib/prisma" inside the device engine: the shop's database is Postgres running in this
// browser (PGlite), kept in IndexedDB, with the same schema and migrations as the server.
import { PGlite } from "@electric-sql/pglite";
import { PrismaPGlite } from "./pgliteAdapter";
import { PrismaClient } from "@prisma/client";

export const DEVICE_DB = "idb://mahar-device";

export const pglite = new PGlite(DEVICE_DB, { relaxedDurability: false });

export const prisma = new PrismaClient({ adapter: new PrismaPGlite(pglite) });

export type Tx = Omit<
  PrismaClient,
  "$connect" | "$disconnect" | "$on" | "$transaction" | "$use" | "$extends"
>;

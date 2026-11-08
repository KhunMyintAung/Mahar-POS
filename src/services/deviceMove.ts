// Moving a "This device only" shop into an online account. The device sends every table of its
// shop as JSON (src/device/engine.ts, exportShop); it is imported here as one new business, in
// one transaction, under the username, email and password the owner chose. Nothing in it may
// reach outside the shop: every row of a table with businessId is this business's, and every
// id it names is either a row it brings or no row on the server at all.
import { mkdir, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gunzipSync } from "node:zlib";
import { prisma } from "@/lib/prisma";
import { ApiError } from "@/lib/api";
import { audit } from "@/lib/audit";

/** Tables that are never moved: they belong to the server (or are left out by the device). */
const NOT_MOVED = new Set(["AuthSession", "TelegramAiKey", "TelegramSession", "EmailLog", "EmailBroadcast", "PlatformSetting", "PrintJob", "_prisma_migrations"]);
/** One part of the upload, under nginx's default body limit. */
export const PART_BYTES = 768 * 1024;
const MAX_PARTS = 400;
const MAX_JSON_BYTES = 400 * 1024 * 1024;
const MOVE_TTL_MS = 2 * 60 * 60 * 1000;

export type MoveAccount = { username: string; email: string; passwordHash: string; ip: string };

type Move = { account: MoveAccount; createdAt: number };
const moves = new Map<string, Move>();

function moveDir(id: string) {
  return join(tmpdir(), "mahar-device-move", id);
}

/** A move begins: the account it goes into, and where its parts are kept until it is done. */
export async function startMove(account: MoveAccount): Promise<string> {
  for (const [id, m] of moves) {
    if (Date.now() - m.createdAt > MOVE_TTL_MS) {
      moves.delete(id);
      await rm(moveDir(id), { recursive: true, force: true }).catch(() => {});
    }
  }
  const id = crypto.randomUUID();
  moves.set(id, { account, createdAt: Date.now() });
  await mkdir(moveDir(id), { recursive: true });
  return id;
}

function getMove(id: string): Move {
  const m = /^[0-9a-f-]{36}$/.test(id) ? moves.get(id) : undefined;
  if (!m || Date.now() - m.createdAt > MOVE_TTL_MS) throw new ApiError(404, "This move has expired. Start again.");
  return m;
}

export async function savePart(id: string, index: number, total: number, data: Uint8Array) {
  getMove(id);
  if (!Number.isInteger(index) || !Number.isInteger(total) || total < 1 || total > MAX_PARTS || index < 0 || index >= total) {
    throw new ApiError(422, "Invalid part");
  }
  if (data.byteLength === 0 || data.byteLength > PART_BYTES) throw new ApiError(413, "Part too large");
  await writeFile(join(moveDir(id), `${String(index).padStart(4, "0")}-of-${total}`), data);
}

async function readUpload(id: string): Promise<Buffer> {
  const dir = moveDir(id);
  const names = (await readdir(dir)).sort();
  const total = Number(names[0]?.split("-of-")[1]);
  if (!total || names.length !== total || names.some((n, i) => n !== `${String(i).padStart(4, "0")}-of-${total}`)) {
    throw new ApiError(422, "Some of the shop did not arrive. Try again.");
  }
  const parts = await Promise.all(names.map((n) => readFile(join(dir, n))));
  try {
    return gunzipSync(Buffer.concat(parts), { maxOutputLength: MAX_JSON_BYTES });
  } catch {
    throw new ApiError(422, "The shop's data could not be read. Try again.");
  }
}

type Payload = {
  format: string; version: number; businessId: string; owner: string;
  migrations: string[]; tables: Record<string, Record<string, unknown>[]>;
};

type Schema = {
  columns: Map<string, Set<string>>;
  /** child table → parent tables it must come after (foreign keys). */
  after: Map<string, Set<string>>;
};

async function schema(): Promise<Schema> {
  const cols = await prisma.$queryRawUnsafe<{ t: string; c: string }[]>(
    `SELECT table_name AS t, column_name AS c FROM information_schema.columns WHERE table_schema = 'public'`);
  const fks = await prisma.$queryRawUnsafe<{ child: string; parent: string }[]>(
    `SELECT DISTINCT tc.table_name AS child, ccu.table_name AS parent
     FROM information_schema.table_constraints tc
     JOIN information_schema.constraint_column_usage ccu ON ccu.constraint_name = tc.constraint_name AND ccu.table_schema = tc.table_schema
     WHERE tc.constraint_type = 'FOREIGN KEY' AND tc.table_schema = 'public'`);
  const columns = new Map<string, Set<string>>();
  for (const { t, c } of cols) (columns.get(t) ?? columns.set(t, new Set()).get(t)!).add(c);
  const after = new Map<string, Set<string>>();
  for (const { child, parent } of fks) if (child !== parent) (after.get(child) ?? after.set(child, new Set()).get(child)!).add(parent);
  return { columns, after };
}

/** Parents before children. */
function insertOrder(tables: string[], after: Map<string, Set<string>>): string[] {
  const left = new Set(tables);
  const order: string[] = [];
  while (left.size) {
    const ready = [...left].filter((t) => ![...(after.get(t) ?? [])].some((p) => left.has(p)));
    if (!ready.length) throw new ApiError(500, "Could not order the shop's tables");
    for (const t of ready.sort()) { order.push(t); left.delete(t); }
  }
  return order;
}

/** Imports an uploaded shop. Returns the owner, who is signed in by the caller. */
export async function finishMove(id: string): Promise<{ ownerId: string; businessId: string; businessName: string; ownerName: string; account: MoveAccount }> {
  const move = getMove(id);
  const json = await readUpload(id);
  let payload: Payload;
  try {
    payload = JSON.parse(json.toString("utf8")) as Payload;
  } catch {
    throw new ApiError(422, "The shop's data could not be read. Try again.");
  }
  if (payload?.format !== "mahar-device-shop" || payload.version !== 1 || typeof payload.tables !== "object" || !payload.tables) {
    throw new ApiError(422, "This is not a shop from This device only");
  }
  const B = payload.businessId;
  if (typeof B !== "string" || !/^[0-9a-f-]{36}$/i.test(B)) throw new ApiError(422, "This is not a shop from This device only");

  // The device's app must be the server's version: the same tables, the same columns.
  const applied = (await prisma.$queryRawUnsafe<{ name: string }[]>(
    `SELECT migration_name AS name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL`)).map((r) => r.name);
  const deviceMigrations = new Set(Array.isArray(payload.migrations) ? payload.migrations : []);
  if (applied.length !== deviceMigrations.size || applied.some((m) => !deviceMigrations.has(m))) {
    throw new ApiError(409, "Update the app on this device first (Update app, then open it again), then move the shop.");
  }

  const { columns, after } = await schema();
  const tables = Object.keys(payload.tables).filter((t) => !NOT_MOVED.has(t));
  const ids = new Map<string, Set<string>>();
  const named = new Set<string>();
  for (const t of tables) {
    const cols = columns.get(t);
    const rows = payload.tables[t];
    if (!cols || !Array.isArray(rows)) throw new ApiError(422, `Unknown table in the shop: ${t}`);
    const own = new Set<string>();
    for (const row of rows) {
      if (!row || typeof row !== "object") throw new ApiError(422, "The shop's data could not be read");
      for (const [k, v] of Object.entries(row)) {
        if (!cols.has(k)) throw new ApiError(409, "Update the app on this device first, then move the shop.");
        // Money is kept in whole minor units; a number past this would not be exact.
        if (typeof v === "number" && Number.isInteger(v) && !Number.isSafeInteger(v)) throw new ApiError(422, "An amount in the shop is too large");
        if (k !== "id" && k !== "businessId" && k.endsWith("Id") && typeof v === "string") named.add(v);
      }
      if (cols.has("businessId") && row.businessId !== B) throw new ApiError(422, "The shop's data belongs to more than one business");
      if (typeof row.id === "string") own.add(row.id);
    }
    ids.set(t, own);
  }
  const business = payload.tables.Business ?? [];
  const users = payload.tables.User ?? [];
  if (business.length !== 1 || business[0].id !== B) throw new ApiError(422, "The shop's data must hold exactly one business");
  if (users.length !== 1 || users[0].id !== payload.owner) throw new ApiError(422, "The shop's data must hold its owner only");

  // Every id the shop names is its own or names nothing on the server.
  const all = new Set([...ids.values()].flatMap((s) => [...s]));
  const outside = [...named].filter((v) => !all.has(v));
  if (outside.length) {
    for (const [t, cols] of columns) {
      if (!cols.has("id") || t.startsWith("_")) continue;
      const hit = await prisma.$queryRawUnsafe<{ id: string }[]>(`SELECT id::text AS id FROM "${t}" WHERE id::text = ANY($1::text[]) LIMIT 1`, outside);
      if (hit.length) throw new ApiError(422, "The shop's data names records outside the shop");
    }
  }

  const ownerId = payload.owner;
  const { account } = move;
  // The owner signs in with what they chose; nothing of the device's sign-in or Telegram.
  Object.assign(users[0], {
    username: account.username, email: account.email, passwordHash: account.passwordHash, emailVerifiedAt: null,
    active: true, failedLogins: 0, lockedUntil: null,
    telegramBotToken: null, telegramBotUsername: null, telegramWebhookSecret: null, telegramChatId: null,
  });
  // The online shop's address is chosen again online.
  Object.assign(business[0], { shopSlug: null });
  try {
    await prisma.$transaction(async (tx) => {
      const taken = await tx.user.findFirst({
        where: { OR: [{ username: account.username }, { email: account.username }, { username: account.email }, { email: account.email }] },
        select: { id: true },
      });
      if (taken) throw new ApiError(409, "Username or email is already registered");
      if (await tx.business.findUnique({ where: { id: B }, select: { id: true } })) {
        throw new ApiError(409, "This shop is already in an online account");
      }
      for (const t of insertOrder(tables, after)) {
        const rows = payload.tables[t];
        if (!rows.length) continue;
        // In slices, so no one statement is too large.
        for (let i = 0; i < rows.length; i += 2000) {
          await tx.$executeRawUnsafe(`INSERT INTO "${t}" SELECT * FROM json_populate_recordset(NULL::"${t}", $1::json)`, JSON.stringify(rows.slice(i, i + 2000)));
        }
      }
      await audit(tx, {
        businessId: B, userId: ownerId, action: "CREATE", module: "business", resourceType: "Business", resourceId: B,
        after: { movedFrom: "This device only", tables: tables.length }, ip: account.ip,
      });
    }, { timeout: 180_000, maxWait: 15_000 });
  } catch (error) {
    if (error instanceof ApiError) throw error;
    console.error("[device-move]", error);
    throw new ApiError(422, "The shop could not be moved. Nothing was changed; try again.");
  }

  moves.delete(id);
  await rm(moveDir(id), { recursive: true, force: true }).catch(() => {});
  const owner = await prisma.user.findUniqueOrThrow({ where: { id: ownerId }, select: { name: true, business: { select: { name: true } } } });
  return { ownerId, businessId: B, businessName: owner.business.name, ownerName: owner.name, account };
}
